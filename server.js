// server.js
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const mysql = require('mysql2/promise'); // Use promise-based version
const cors = require('cors'); // Import cors

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors()); // Enable CORS for all origins (adjust for production)
app.use(express.json()); // Middleware to parse JSON request bodies

// --- Database Connection Pool ---
// Using a pool is more efficient than creating connections for each request
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Adjust as needed
    queueLimit: 0
});

// --- Helper Function: Haversine Formula for Distance Calculation ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    return distance;
}

// --- API Routes ---

// Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({ message: 'School Management API is running!' });
});


// 1. Add School API
app.post('/addSchool', async (req, res) => {
    const { name, address, latitude, longitude } = req.body;

    // --- Input Validation ---
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'Invalid or missing school name.' });
    }
    if (!address || typeof address !== 'string' || address.trim() === '') {
        return res.status(400).json({ error: 'Invalid or missing school address.' });
    }
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'Invalid or missing latitude (must be between -90 and 90).' });
    }
     if (isNaN(lon) || lon < -180 || lon > 180) {
        return res.status(400).json({ error: 'Invalid or missing longitude (must be between -180 and 180).' });
    }
    // --- End Validation ---

    let connection; // Define connection variable outside try block

    try {
        connection = await dbPool.getConnection(); // Get connection from pool
        console.log("Database connected!"); // Log successful connection

        const sql = 'INSERT INTO schools (name, address, latitude, longitude) VALUES (?, ?, ?, ?)';
        const [result] = await connection.execute(sql, [name.trim(), address.trim(), lat, lon]);

        console.log('School added with ID:', result.insertId);

        // Respond with the newly created school's details
        res.status(201).json({
            message: 'School added successfully!',
            school: {
                id: result.insertId,
                name: name.trim(),
                address: address.trim(),
                latitude: lat,
                longitude: lon
            }
        });

    } catch (error) {
        console.error('Error adding school:', error);
        // Check for specific DB errors if needed (e.g., duplicate entry)
        res.status(500).json({ error: 'Failed to add school to database.', details: error.message });
    } finally {
        if (connection) {
            connection.release(); // Release the connection back to the pool
            console.log("Database connection released.");
        }
    }
});


// 2. List Schools API (Sorted by Proximity)
app.get('/listSchools', async (req, res) => {
    const { userLat, userLon } = req.query; // Get user location from query parameters

    // --- Input Validation ---
    const lat = parseFloat(userLat);
    const lon = parseFloat(userLon);

    if (isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'Invalid or missing userLat query parameter (must be between -90 and 90).' });
    }
     if (isNaN(lon) || lon < -180 || lon > 180) {
        return res.status(400).json({ error: 'Invalid or missing userLon query parameter (must be between -180 and 180).' });
    }
    // --- End Validation ---

    let connection; // Define connection variable outside try block

    try {
        connection = await dbPool.getConnection();
        console.log("Database connected!");

        const sql = 'SELECT id, name, address, latitude, longitude FROM schools';
        const [schools] = await connection.query(sql); // Use query for SELECT without placeholders

        if (schools.length === 0) {
            return res.status(200).json([]); // Return empty array if no schools found
        }

        // Calculate distance for each school and add it to the object
        const schoolsWithDistance = schools.map(school => {
            const distance = calculateDistance(lat, lon, school.latitude, school.longitude);
            return { ...school, distance: distance }; // Add distance property (in km)
        });

        // Sort schools by distance (ascending)
        schoolsWithDistance.sort((a, b) => a.distance - b.distance);

        res.status(200).json(schoolsWithDistance);

    } catch (error) {
        console.error('Error fetching schools:', error);
        res.status(500).json({ error: 'Failed to retrieve schools from database.', details: error.message });
    } finally {
        if (connection) {
            connection.release(); // Release connection
            console.log("Database connection released.");
        }
    }
});


// --- Global Error Handler (Optional but Recommended) ---
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err.stack);
    res.status(500).json({ error: 'Something went wrong on the server!' });
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});