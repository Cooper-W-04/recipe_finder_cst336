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