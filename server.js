// server.js
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

let db;
async function initializeDatabase() {
  // Open database connection
  db = await open({
    filename: path.join(__dirname, 'schools.db'),
    driver: sqlite3.Database
  });
  

  await db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL
    )
  `);
  console.log('Database initialized');
}


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

app.get('/', (req, res) => {
  res.status(200).json({ message: 'School Management API is running!' });
});


app.post('/addSchool', async (req, res) => {
  const { name, address, latitude, longitude } = req.body;

  // Input Validation
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

  try {
    const result = await db.run(
      'INSERT INTO schools (name, address, latitude, longitude) VALUES (?, ?, ?, ?)',
      [name.trim(), address.trim(), lat, lon]
    );

    console.log('School added with ID:', result.lastID);

    res.status(201).json({
      message: 'School added successfully!',
      school: {
        id: result.lastID,
        name: name.trim(),
        address: address.trim(),
        latitude: lat,
        longitude: lon
      }
    });
  } catch (error) {
    console.error('Error adding school:', error);
    res.status(500).json({ error: 'Failed to add school to database.', details: error.message });
  }
});

app.get('/listSchools', async (req, res) => {
  const { userLat, userLon } = req.query;


  const lat = parseFloat(userLat);
  const lon = parseFloat(userLon);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Invalid userLat (must be between -90 and 90).' });
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Invalid userLon (must be between -180 and 180).' });
  }

  try {
    const schools = await db.all('SELECT id, name, address, latitude, longitude FROM schools');

    if (schools.length === 0) {
      return res.status(200).json([]);
    }

    const schoolsWithDistance = schools.map(school => {
      const distance = calculateDistance(lat, lon, school.latitude, school.longitude);
      return { ...school, distance };
    });

    schoolsWithDistance.sort((a, b) => a.distance - b.distance);
    res.status(200).json(schoolsWithDistance);
  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({ error: 'Failed to retrieve schools.', details: error.message });
  }
});


app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({ error: 'Something went wrong on the server!' });
});

initializeDatabase().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
});
