import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import session from 'express-session';

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(express.urlencoded({ extended: true }));
//setting up database connection pool, replace values in red
const pool = mysql.createPool({
  host: "lg7j30weuqckmw07.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
  user: process.env.DB_USERNAME,
  password: process.env.DB_PWD,
  database: "gbyb8vmnvqchvq92",
  connectionLimit: 10,
  waitForConnections: true
});

app.set('trust proxy', 1) // trust first proxy
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
  //   cookie: { secure: true }
}))

//routes
app.get('/', (req, res) => {
  res.render('login.ejs')
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get('/profile', isUserAuthenticated, (req, res) => {
  res.render('profile.ejs')
});

app.get('/settings', isUserAuthenticated, (req, res) => {
  res.render("settings.ejs")
});

//route that checks username and password
app.post('/loginProcess', async (req, res) => {
  let { username, password } = req.body;
  //  console.log(username + ": " + password);
  let hashedPassword = "";

  let sql = `SELECT *
              FROM users
              WHERE username = ?`;
  const [rows] = await pool.query(sql, [username]);

  if (rows.length > 0) { //username was found in the database
    hashedPassword = rows[0].password;
  }

  const match = await bcrypt.compare(password, hashedPassword);

  if (match) {
    req.session.authenticated = true;
    let name = rows[0].username;
    res.render('home.ejs', { username });
  } else {
    let loginError = "Wrong Credentials! Try again!"
    res.render('login.ejs', { loginError });
  }
});

app.get('/signup', (req, res) => {
  res.render('signup.ejs')
});

app.post('/signUpProcess', async (req, res) => {
  let username = req.body.username;
  let password = req.body.password;
  let confirmPassword = req.body.confirmPassword;

  if (!username || !password || !confirmPassword) {
    let signupError = "Fill out all fields";
    return res.render("signup.ejs", { signupError });
  }

  if (password !== confirmPassword) {
    let signupError = "Passwords do not match";
    return res.render("signup.ejs", { signupError });
  }

  let loginSql = `SELECT *
                  FROM users
                  WHERE username = ? `;


  const [rows] = await pool.query(loginSql, [username]);
  if (rows.length > 0) {
    let signupError = "Username already exists"
    return res.render("signup.ejs", { signupError });
  }

  const hashedPassword = await bcrypt.hash(password, 10);


  let sql = `INSERT INTO users
        (username, password)
        VALUES(?, ?)`;
  const [new_rows] = await pool.query(sql, [username, hashedPassword]);
  res.redirect('/')
});

app.get('/api/randomRecipes', async (req, res) => {
  let sql = `SELECT *
            FROM recipes
            ORDER BY RAND()
            LIMIT 4`;
  const [randRecipes] = await pool.query(sql);
  // console.log(randRecipes);


  res.send(randRecipes); // display the value in json format
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

    let mealIds = new Set();

    //fetch recipes from TheMealDB
    for (let code = 97; code <= 122; code++) {
      let letter = String.fromCharCode(code);
      let response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?f=${letter}`);
      let data = await response.json();

      if (data.meals) {
        for (let meal of data.meals) {
          mealIds.add(meal.idMeal);
        }
      }
    }

    const meals = [];

    for (let mealId of mealIds) {
      let response = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${mealId}`);
      let data = await response.json();

      if (data.meals && data.meals.length > 0) {
        meals.push(data.meals[0]);
      }
    }

    //loop through recipes
    for (let meal of meals) {

      //insert into recipes table
      let sql = `
        INSERT INTO recipes
        (recipe_name, instructions, category, area, image_url, source_url, youtube_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      let params = [
        meal.strMeal,
        meal.strInstructions,
        meal.strCategory,
        meal.strArea,
        meal.strMealThumb,
        meal.strSource || null,
        meal.strYoutube || null
      ];

      const [recipeResult] = await pool.query(sql, params);
      const newRecipeId = recipeResult.insertId;

      //loop through ingredients (1–20)
      for (let i = 1; i <= 20; i++) {
        let ingredient = meal[`strIngredient${i}`];
        let measure = meal[`strMeasure${i}`];

        if (ingredient && ingredient.trim() !== "") {
          ingredient = ingredient.trim();
          measure = measure && measure.trim() !== "" ? measure.trim() : null;

          //check if ingredient already exists
          let [rows] = await pool.query(
            "SELECT ingredient_id FROM ingredients WHERE ingredient_name = ?",
            [ingredient]
          );

          let ingredientId;

          if (rows.length > 0) {
            ingredientId = rows[0].ingredient_id;
          } else {
            let [result] = await pool.query(
              "INSERT INTO ingredients (ingredient_name) VALUES (?)",
              [ingredient]
            );
            ingredientId = result.insertId;
          }

          //insert into recipe_ingredients
          await pool.query(
            "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, measure) VALUES (?, ?, ?)",
            [newRecipeId, ingredientId, measure]
          );
        }
      }
    }

    res.json({
      success: true,
      message: `Database populated successfully! Added ${meals.length} recipes.`
    });

  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      message: "Error populating database."
    });
  }
});

app.get("/dbTest", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT CURDATE()");
    res.send(rows);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Database error!");
  }
});//dbTest

//middleware functions
function isUserAuthenticated(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect("/");
  }
}

app.listen(3000, () => {
  console.log("Express server running")
})
