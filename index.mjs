import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2/promise';
const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
//for Express to get values using the POST method
app.use(express.urlencoded({extended:true}));
//setting up database connection pool, replace values in red
const pool = mysql.createPool({
    host: "lg7j30weuqckmw07.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: process.env.DB_USERNAME,
    password: process.env.DB_PWD,
    database: "gbyb8vmnvqchvq92",
    connectionLimit: 10,
    waitForConnections: true
});

//routes
app.get('/', (req, res) => {
   res.send('Hello Express app!')
});

app.get("/populate", (req, res) => {
   res.render("populate.ejs");
});

app.get("/getRecipeByIngredient", async (req, res) => {
  let ingredientName = req.query.ingredient;
  let errorMessage = false;

  if (ingredientName.length < 3) {
    res.redirect('/');
    return;
  }

  let [meals] = await pool.query(
    `SELECT recipes.recipe_id, recipes.recipe_name, recipes.instructions, recipes.category, recipes.area, recipes.image_url, recipes.source_url, recipes.youtube_url
     FROM recipes
     JOIN recipe_ingredients
      ON recipes.recipe_id = recipe_ingredients.recipe_id
     JOIN ingredients
      ON recipe_ingredients.ingredient_id = ingredients.ingredient_id
     WHERE ingredients.ingredient_name LIKE ?`,
    [`%${ingredientName}%`]
  );

  if (meals.length === 0) {
    errorMessage = `Cannot find a meal containing ${ingredientName}`;
  }

  res.render('recipesIngredientList.ejs', { errorMessage, meals});
});

app.get("/recipeDetail", async (req, res) => {
  let recipeId = req.query.id;

  let [recipeRows] = await pool.query(
    `SELECT recipe_id, recipe_name, instructions, category, area, image_url, source_url, youtube_url
     FROM recipes
     WHERE recipe_id = ?`,
    [recipeId]
  );

  if (recipeRows.length === 0) {
    res.status(404).send("Recipe not found");
    return;
  }

  let meal = recipeRows[0];

  let [ingredients] = await pool.query(
    `SELECT ingredients.ingredient_name AS name, recipe_ingredients.measure
     FROM recipe_ingredients
     JOIN ingredients 
       ON recipe_ingredients.ingredient_id = ingredients.ingredient_id
     WHERE recipe_ingredients.recipe_id = ?`,
    [recipeId]
  );

  // res.render("recipeDetail.ejs", { meal, ingredients });
  let successMessage = false;

  //check if coming from add recipe page and if so show success message
  if (req.query.added === "true") {
    successMessage = "Recipe was successfully added!";
  }

  res.render("recipeDetail.ejs", { meal, ingredients, successMessage });
});

app.get("/addRecipe", (req, res) => {
  res.render("addRecipe.ejs");
});

app.post("/addRecipe", async (req, res) => {
  let recipeName = req.body.recipeName;
  let instructions = req.body.instructions;
  let category = req.body.category;
  let area = req.body.area;
  let imageUrl = req.body.imageUrl;
  let ingredients = req.body.ingredients;

  let sql = `INSERT INTO recipes
             (recipe_name, instructions, category, area, image_url)
             VALUES
             (?, ?, ?, ?, ?)`;

  let sqlParams = [recipeName, instructions, category, area, imageUrl];

  //add recipe to recipes table and get the id of the new recipe so we can link it to the ingredients in the recipe_ingredients table
  const [rows] = await pool.query(sql, sqlParams);

  let recipeId = rows.insertId;

  //each line is measurement and ingredient name
  let ingredientLines = ingredients.split("\n");

  //do this for every line of ingredients that the user entered in the textarea
  for (let line of ingredientLines) {
    //make sure there are ingredients on the line and that the line isn't just empty spaces
    if (line.trim() !== "") {
      //2 cups|Flour -> ["2 cups", "Flour"]
      let ingredientParts = line.split("|");

      let measure = ingredientParts[0].trim();
      let ingredientName = ingredientParts[1].trim();

      //add ingredient to ingredients table if not already in ingredients table
      let ingredientSql = `INSERT IGNORE INTO ingredients
                           (ingredient_name)
                           VALUES
                           (?)`;

      let ingredientSqlParams = [ingredientName];
      //add ingredient to ingredients table
      await pool.query(ingredientSql, ingredientSqlParams);

      //find that ingredient's id so we can add it to the recipe_ingredients table
      let findIngredientSql = `SELECT ingredient_id
                               FROM ingredients
                               WHERE ingredient_name = ?`;

      let findIngredientSqlParams = [ingredientName];
      //finds ingredient id of the ingredient we just added
      const [ingredientRows] = await pool.query(findIngredientSql, findIngredientSqlParams);

      //grab ingredient id from the query result
      let ingredientId = ingredientRows[0].ingredient_id;

      //add to recipe_ingredients table to link the recipe and ingredient together
      let recipeIngredientSql = `INSERT INTO recipe_ingredients
                                 (recipe_id, ingredient_id, measure)
                                 VALUES
                                 (?, ?, ?)`;

      let recipeIngredientSqlParams = [recipeId, ingredientId, measure];
      //adds recipe and ingredient to recipe_ingredients table
      await pool.query(recipeIngredientSql, recipeIngredientSqlParams);
    }
  }

  res.redirect(`/recipeDetail?id=${recipeId}&added=true`);
});



app.post("/populate-db", async (req, res) => {
  try {
    //DO NOT IMPLEMENT THIS!! IT WILL COMPLETELY RESET THE DATABASE AND REMOVE ANY RECIPES THAT WERE ADDED BY USERS

    //prevent duplicate population
    //instead of not doing it if already populated, we just reset since there's a ton of errors right now

    //clear tables first (order matters because of foreign keys)
    await pool.query("DELETE FROM recipe_ingredients");
    await pool.query("DELETE FROM ingredients");
    await pool.query("DELETE FROM recipes");

    //fetch recipes from TheMealDB
    const response = await fetch("https://www.themealdb.com/api/json/v1/1/search.php?s=");
    const data = await response.json();

    const meals = data.meals;

    //loop through recipes
    for (let meal of meals) {

      //insert into recipes table
      let sql = `
        INSERT INTO recipes
        (recipe_id, recipe_name, instructions, category, area, image_url, source_url, youtube_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      let params = [
        meal.idMeal,
        meal.strMeal,
        meal.strInstructions,
        meal.strCategory,
        meal.strArea,
        meal.strMealThumb,
        meal.strSource || null,
        meal.strYoutube || null
      ];

      await pool.query(sql, params);

      //loop through ingredients (1–20)
      for (let i = 1; i <= 20; i++) {
        let ingredient = meal[`strIngredient${i}`];
        let measure = meal[`strMeasure${i}`];

        if (ingredient && ingredient.trim() !== "") {

          //check if ingredient already exists
          let [rows] = await pool.query(
            "SELECT ingredient_id FROM ingredients WHERE ingredient_name = ?",
            [ingredient]
          );

          let ingredientId;

          if (rows.length > 0) {
            ingredientId = rows[0].ingredient_id;
          } else {
            let result = await pool.query(
              "INSERT INTO ingredients (ingredient_name) VALUES (?)",
              [ingredient]
            );
            ingredientId = result[0].insertId;
          }

          //insert into recipe_ingredients
          await pool.query(
            "INSERT IGNORE INTO recipe_ingredients (recipe_id, ingredient_id, measure) VALUES (?, ?, ?)",
            [meal.idMeal, ingredientId, measure]
          );
        }
      }
    }

    res.json({
      success: true,
      message: "Database populated successfully!"
    });

  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      message: "Error populating database."
    });
  }
});

app.get("/dbTest", async(req, res) => {
   try {
        const [rows] = await pool.query("SELECT CURDATE()");
        res.send(rows);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Database error!");
    }
});//dbTest
app.listen(3000, ()=>{
    console.log("Express server running")
})
