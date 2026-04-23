import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import session from 'express-session';

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
//for Express to get values using the POST method
app.use(express.urlencoded({extended:true}));
//setting up database connection pool, replace values in red
const pool = mysql.createPool({
    host: "",
    user: "",
    password: "",
    database: "",
    connectionLimit: 10,
    waitForConnections: true
});

//setting sessions
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

app.get('/profile', isUserAuthenticated, (req, res) => {


  res.render('profile.ejs')

});

app.get('/settings', isUserAuthenticated,  (req, res) => {

  res.render("settings.ejs")
   
});

app.get('/logout', (req, res) => {
   req.session.destroy();
   res.redirect("/");
});

//route that checks username and password
app.post('/loginProcess', async (req, res) => {
//    let username = req.body.username;
//    let password = req.body.password;
   let {username, password} = req.body;
   console.log(username + ": " + password);

   let hashedPassword = "";

   let sql = `SELECT *
              FROM admin
              WHERE username = ?`;
   const [rows] = await pool.query(sql, [username]);

   if (rows.length > 0) { //username was found in the database
       hashedPassword = rows[0].password;
   }
 
   const match = await bcrypt.compare(password, hashedPassword);

   if (match) {
     req.session.authenticated = true;
     req.session.fullName = rows[0].firstName + " " + rows[0].lastName;
     res.render('welcome.ejs', {"fullName":req.session.fullName});
   } else {
     let loginError = "Wrong Credentials! Try again!"
     res.render('login.ejs', {loginError});
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

//middleware functions
function isUserAuthenticated(req, res, next){
    if (req.session.authenticated) { 
      next();
   } else {
     res.redirect("/");
   }
}


app.listen(3000, ()=>{
    console.log("Express server running")
})