const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

const db = new sqlite3.Database('./tourist-guide.db', (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS destinations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    rating INTEGER DEFAULT 3
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET destinations with filters - only define once
app.get('/api/destinations', (req, res) => {
  const category = req.query.category;
  const search = req.query.search;

  let sql = "SELECT * FROM destinations WHERE 1=1";
  let params = [];

  if (category && category !== 'all') {
    sql += " AND category = ?";
    params.push(category);
  }

  if (search) {
    sql += " AND name LIKE ?";
    params.push(`%${search}%`);
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    res.json(rows);
  });
});

// POST new destination
app.post('/api/destinations', (req, res) => {
  const { name, description, category, location, rating } = req.body;
  
  // Validate input
  if (!name || !description || !category || !location || !rating) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  db.run(`
    INSERT INTO destinations (name, description, category, location, rating)
    VALUES (?, ?, ?, ?, ?)
  `, [name, description, category, location, rating], function(err) {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.status(201).json({ 
        id: this.lastID, 
        name, 
        description, 
        category, 
        location, 
        rating 
      });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Tourist Guide server running at http://localhost:${PORT}`);
});