const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/database");

const app = express();

const PORT = process.env.PORT || 5000;


/* =========================
   MIDDLEWARE
========================= */

app.use(cors());

app.use(express.json());


/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

    res.json({
        success: true,
        message: "BEcoin Backend API is running",
        version: "1.0.0"
    });

});


/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", async (req, res) => {

    try {

        const result = await pool.query(
            "SELECT NOW() AS server_time"
        );

        res.json({

            success: true,

            status: "healthy",

            service: "BEcoin API",

            database: "connected",

            serverTime:
                result.rows[0].server_time

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            status: "unhealthy",

            database: "disconnected",

            error: error.message

        });

    }

});


/* =========================
   DATABASE TEST
========================= */

app.get("/api/db-test", async (req, res) => {

    try {

        const result = await pool.query(
            "SELECT NOW() AS current_time"
        );

        res.json({

            success: true,

            message:
                "PostgreSQL connection working",

            time:
                result.rows[0].current_time

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            message:
                "PostgreSQL connection failed",

            error: error.message

        });

    }

});


/* =========================
   404
========================= */

app.use((req, res) => {

    res.status(404).json({

        success: false,

        message:
            "API endpoint not found"

    });

});


/* =========================
   SERVER
========================= */

app.listen(PORT, () => {

    console.log(
        `BEcoin backend running on port ${PORT}`
    );

});
const express = require("express");
const { Pool } = require("pg");

const app = express();

app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test API
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "BEcoin backend is running"
    });
});

// PostgreSQL connection test
app.get("/api/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS time");

        res.json({
            success: true,
            message: "PostgreSQL connected successfully",
            databaseTime: result.rows[0].time
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`BEcoin backend running on port ${PORT}`);
});
