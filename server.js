const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const db = new sqlite3.Database('./tourist-guide.db', (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Create tables and migrate older databases to include optional destination fields.
db.run(`
  CREATE TABLE IF NOT EXISTS destinations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    rating INTEGER DEFAULT 3,
    image_url TEXT,
    meta TEXT
  )
`, (err) => {
  if (err) {
    console.error('Error creating table:', err.message);
    return;
  }

  db.all('PRAGMA table_info(destinations)', (schemaError, columns) => {
    if (schemaError) {
      console.error('Error checking destinations table:', schemaError.message);
      return;
    }

    const existingColumns = new Set(columns.map((column) => column.name));
    const missingColumns = [
      ['image_url', 'TEXT'],
      ['meta', 'TEXT']
    ].filter(([name]) => !existingColumns.has(name));

    function addMissingColumn(index) {
      if (index >= missingColumns.length) {
        console.log('Destinations table ready.');
        startServer();
        return;
      }

      const [name, type] = missingColumns[index];
      db.run(`ALTER TABLE destinations ADD COLUMN ${name} ${type}`, (migrationError) => {
        if (migrationError) {
          console.error(`Error adding ${name} column:`, migrationError.message);
          return;
        }
        console.log(`Added ${name} column to destinations.`);
        addMissingColumn(index + 1);
      });
    }

    addMissingColumn(0);
  });
});
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DESTINATION ROUTES ====================

// GET destinations with filters
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
    sql += " AND (name LIKE ? OR description LIKE ? OR location LIKE ?)";
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  sql += " ORDER BY id DESC";

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
    }
    res.json(rows);
  });
});

// POST new destination
app.post('/api/destinations', (req, res) => {
  const { name, description, category, location, rating, image_url, meta } = req.body;
  
  if (!name || !description || !category || !location || !rating) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  db.run(`
    INSERT INTO destinations (name, description, category, location, rating, image_url, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [name, description, category, location, rating, image_url || null, meta || null], function(err) {
    if (err) {
      console.error('Database error:', err.message);
      res.status(500).json({ error: 'Internal Server Error: ' + err.message });
    } else {
      res.status(201).json({ 
        id: this.lastID, 
        name, 
        description, 
        category, 
        location, 
        rating,
        image_url,
        meta
      });
    }
  });
});

// DELETE destination
app.delete('/api/destinations/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM destinations WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Destination not found' });
    }
    res.json({ message: 'Destination deleted successfully' });
  });
});

// ==================== SERPAPI ROUTES ====================

// Import SERPAPI routes
try {
  const serpapiRoutes = require('./routes/serpapi');
  app.use('/api/serpapi', serpapiRoutes);
  console.log('âœ… SERPAPI routes loaded');
} catch (err) {
  console.error('âŒ Error loading SERPAPI routes:', err.message);
}

// ==================== START SERVER ====================

function startServer() {
  app.listen(PORT, () => {
    console.log(`Tourist Guide server running at http://localhost:${PORT}`);
    console.log(`SERPAPI: ${process.env.SERPAPI_KEY ? 'Configured' : 'Not configured'}`);
  });
}
