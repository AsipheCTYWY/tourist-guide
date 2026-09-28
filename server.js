const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const cors = require('cors');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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
        initializeAuthTables();
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

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

function readSessionCookie(req) {
  const cookie = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith('tourist_session='));
  return cookie ? cookie.slice('tourist_session='.length) : null;
}

function sessionCookie(token, maxAge) {
  return `tourist_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  await dbRun('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash, userId, expiresAt]);
  res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(SESSION_DURATION_MS / 1000)));
}

function initializeAuthTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        surname TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) {
        console.error('Error creating authentication tables:', err.message);
        return;
      }
      db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
      startServer();
    });
  });
}
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ACCOUNT ROUTES ====================

app.post('/api/auth/signup', async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const surname = typeof body.surname === 'string' ? body.surname.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || !surname || name.length > 80 || surname.length > 80) {
    return res.status(400).json({ error: 'Enter your name and surname (up to 80 characters each).' });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  }

  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await hashPassword(password, salt)).toString('hex');
    const result = await dbRun(
      'INSERT INTO users (name, surname, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [name, surname, email, salt, passwordHash, Date.now()]
    );
    await createSession(result.lastID, res);
    res.status(201).json({ user: { id: result.lastID, name, surname, email } });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    }
    console.error('Account signup failed:', error.message);
    res.status(500).json({ error: 'Could not create the account. Please try again.' });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });

  try {
    const user = await dbGet('SELECT id, name, surname, email, password_salt, password_hash FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const submittedHash = await hashPassword(password, user.password_salt);
    const storedHash = Buffer.from(user.password_hash, 'hex');
    if (submittedHash.length !== storedHash.length || !crypto.timingSafeEqual(submittedHash, storedHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await createSession(user.id, res);
    res.json({ user: { id: user.id, name: user.name, surname: user.surname, email: user.email } });
  } catch (error) {
    console.error('Account sign in failed:', error.message);
    res.status(500).json({ error: 'Could not sign in. Please try again.' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = readSessionCookie(req);
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await dbGet(`
      SELECT users.id, users.name, users.surname, users.email
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `, [tokenHash, Date.now()]);
    if (!user) return res.status(401).json({ error: 'Session expired.' });
    res.json({ user });
  } catch (error) {
    console.error('Could not check account session:', error.message);
    res.status(500).json({ error: 'Could not check sign in status.' });
  }
});

app.post('/api/auth/signout', async (req, res) => {
  const token = readSessionCookie(req);
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  if (!token) return res.json({ success: true });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await dbRun('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
    res.json({ success: true });
  } catch (error) {
    console.error('Account sign out failed:', error.message);
    res.status(500).json({ error: 'Could not sign out.' });
  }
});

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
