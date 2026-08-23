const express = require("express");
const { Pool } = require("pg");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "BEcoin backend is running"
    });
});

app.get("/api/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS time");

        res.json({
            success: true,
            message: "PostgreSQL connected successfully",
            databaseTime: result.rows[0].time
        });
    } catch (error) {
        console.error("Database error:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});
// Create users table
app.get("/api/setup", async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                user_code VARCHAR(50) UNIQUE NOT NULL,
                wallet_address VARCHAR(100),
                balance NUMERIC(18,2) DEFAULT 10000.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        res.json({
            success: true,
            message: "Users table created successfully"
        });

    } catch (error) {
        console.error("Setup error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create users table"
        });
    }
});
app.listen(PORT, "0.0.0.0", () => {
    console.log(`BEcoin backend running on port ${PORT}`);
});
