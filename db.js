// db.js
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', // leave blank if you didn’t set a password in XAMPP
  database: 'led_rental_db'
});

db.connect(err => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Connected to MySQL database');
  }
});

module.exports = db;
