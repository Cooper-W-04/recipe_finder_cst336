import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import session from 'express-session';
import 'dotenv/config';

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
    res.render('home.ejs', {username});
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