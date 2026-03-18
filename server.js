const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { Parser } = require('json2csv');
const db = require('./db');
const app = express();

const deleteStack = [];
const confirmQueue = [];
let bookingList = [];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'superSecretAdminKey',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
  res.locals.loggedIn = req.session?.loggedIn || false;
  next();
});

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Booking page
app.get('/booking', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});

// Handle booking form submission
app.post('/submit-booking', (req, res) => {
  const { name, email, phone, display_type, message } = req.body;

  const sql = `
    INSERT INTO bookings (name, email, phone, display_type, message, status)
    VALUES (?, ?, ?, ?, ?, "Pending")
  `;

  db.query(sql, [name, email, phone, display_type, message], (err, result) => {
    if (err) {
      console.error('❌ Error inserting data:', err.message);
      res.status(500).send('Database error');
    } else {
      confirmQueue.push(result.insertId);
      res.send('Thank you! Your booking request has been received and is pending confirmation.');
    }
  });
});

// Login page
app.get('/login', (req, res) => {
  res.render('login');
});

// Handle login
app.post('/login', (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123';

  if (password === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    res.redirect('/admin');
  } else {
    res.send('<h2 style="color:red;">❌ Incorrect password.</h2><a href="/login">Try again</a>');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

function ensureAdmin(req, res, next) {
  if (req.session && req.session.loggedIn) next();
  else res.redirect('/login');
}

// Admin dashboard
app.get('/admin', ensureAdmin, (req, res) => {
  const sql = 'SELECT * FROM bookings ORDER BY created_at DESC';
  db.query(sql, (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).send('Database error');
    } else {
      bookingList = rows;
      res.render('admin', { bookings: rows });
    }
  });
});

// Delete booking
app.post('/admin/delete/:id', ensureAdmin, (req, res) => {
  const bookingId = req.params.id;
  db.query('SELECT * FROM bookings WHERE id = ?', [bookingId], (err, result) => {
    if (err) return res.status(500).send('Database error');
    deleteStack.push(result[0]);
    db.query('DELETE FROM bookings WHERE id = ?', [bookingId], () => {
      res.redirect('/admin');
    });
  });
});

// Undo delete
app.post('/admin/undo-delete', ensureAdmin, (req, res) => {
  if (deleteStack.length === 0) return res.send('No deletions to undo.');
  const { name, email, phone, display_type, message, status } = deleteStack.pop();
  db.query(
    'INSERT INTO bookings (name, email, phone, display_type, message, status) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, phone, display_type, message, status],
    () => res.redirect('/admin')
  );
});

// Confirm next booking
app.post('/admin/confirm-next', ensureAdmin, (req, res) => {
  if (confirmQueue.length === 0) return res.send('No bookings in queue.');
  const nextId = confirmQueue.shift();
  db.query(
    'UPDATE bookings SET status = "Confirmed" WHERE id = ?',
    [nextId],
    () => res.redirect('/admin')
  );
});

// Mark completed
app.post('/admin/complete/:id', ensureAdmin, (req, res) => {
  db.query(
    'UPDATE bookings SET status = "Completed" WHERE id = ?',
    [req.params.id],
    () => res.redirect('/admin')
  );
});

// Export CSV
app.get('/admin/export', ensureAdmin, (req, res) => {
  db.query('SELECT * FROM bookings', (err, rows) => {
    if (err) return res.status(500).send('Database error');
    const parser = new Parser();
    const csv = parser.parse(rows);
    res.header('Content-Type', 'text/csv');
    res.attachment('bookings_export.csv');
    res.send(csv);
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
