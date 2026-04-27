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