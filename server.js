// server.js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg'); // Change to PostgreSQL
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection Pool
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL, // Use connection string format
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database (create table if it doesn't exist)
async function initializeDatabase() {
  const client = await dbPool.connect();
  try {
    // Create schools table if not exists (PostgreSQL syntax)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255) NOT NULL,
        latitude FLOAT NOT NULL,
        longitude FLOAT NOT NULL
      )
    `);
    console.log('Database initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    client.release();
  }
}

// Distance calculation (unchanged)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// API Routes
app.get('/', (req, res) => {
  res.status(200).json({ message: 'School Management API is running!' });
});

// Add School API
app.post('/addSchool', async (req, res) => {
  const { name, address, latitude, longitude } = req.body;

  // Input Validation (unchanged)
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Invalid or missing school name.' });
  }
  if (!address || typeof address !== 'string' || address.trim() === '') {
    return res.status(400).json({ error: 'Invalid or missing school address.' });
  }
  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);
  if (isNaN(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Invalid latitude (must be between -90 and 90).' });
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Invalid longitude (must be between -180 and 180).' });
  }

  const client = await dbPool.connect();
  try {
    // PostgreSQL uses $1, $2, etc. for parameterized queries
    const sql = 'INSERT INTO schools (name, address, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id';
    const result = await client.query(sql, [name.trim(), address.trim(), lat, lon]);

    console.log('School added with ID:', result.rows[0].id);

    res.status(201).json({
      message: 'School added successfully!',
      school: {
        id: result.rows[0].id,
        name: name.trim(),
        address: address.trim(),
        latitude: lat,
        longitude: lon
      }
    });
  } catch (error) {
    console.error('Error adding school:', error);
    res.status(500).json({ error: 'Failed to add school to database.', details: error.message });
  } finally {
    client.release();
  }
});

// List Schools API
app.get('/listSchools', async (req, res) => {
  const { userLat, userLon } = req.query;

  // Input Validation (unchanged)
  const lat = parseFloat(userLat);
  const lon = parseFloat(userLon);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Invalid userLat (must be between -90 and 90).' });
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Invalid userLon (must be between -180 and 180).' });
  }

  const client = await dbPool.connect();
  try {
    const sql = 'SELECT id, name, address, latitude, longitude FROM schools';
    const result = await client.query(sql);

    if (result.rows.length === 0) {
      return res.status(200).json([]);
    }

    const schoolsWithDistance = result.rows.map(school => {
      const distance = calculateDistance(lat, lon, school.latitude, school.longitude);
      return { ...school, distance };
    });

    schoolsWithDistance.sort((a, b) => a.distance - b.distance);
    res.status(200).json(schoolsWithDistance);
  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({ error: 'Failed to retrieve schools.', details: error.message });
  } finally {
    client.release();
  }
});

// Error handler (unchanged)
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({ error: 'Something went wrong on the server!' });
});

// Initialize database and start server
initializeDatabase().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
});
