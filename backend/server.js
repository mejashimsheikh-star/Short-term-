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

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "BEcoin backend is running"
    });
});


/* =========================
   DATABASE TEST
========================= */

app.get("/api/health", async (req, res) => {

    try {

        const result = await pool.query("SELECT NOW()");

        res.json({
            success: true,
            message: "Database connected",
            time: result.rows[0].now
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Database connection failed",
            error: error.message
        });

    }

});


/* =========================
   CREATE USERS TABLE
========================= */

async function createTables() {

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            user_code VARCHAR(50) UNIQUE NOT NULL,
            wallet_address VARCHAR(255),
            balance NUMERIC(18,2) DEFAULT 10000.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

}


/* =========================
   CREATE USER
========================= */

app.post("/api/users", async (req, res) => {

    try {

        let {
            user_code,
            wallet_address
        } = req.body;

        if (!user_code) {

            return res.status(400).json({
                success: false,
                message: "user_code is required"
            });

        }

        const result = await pool.query(
            `
            INSERT INTO users
            (user_code, wallet_address)
            VALUES ($1, $2)
            RETURNING *
            `,
            [
                user_code,
                wallet_address || null
            ]
        );

        res.status(201).json({
            success: true,
            message: "User created successfully",
            user: result.rows[0]
        });

    } catch (error) {

        if (error.code === "23505") {

            return res.status(409).json({
                success: false,
                message: "User code already exists"
            });

        }

        res.status(500).json({
            success: false,
            message: "Failed to create user",
            error: error.message
        });

    }

});


/* =========================
   GET USER
========================= */

app.get("/api/users/:user_code", async (req, res) => {

    try {

        const { user_code } = req.params;

        const result = await pool.query(
            `
            SELECT *
            FROM users
            WHERE user_code = $1
            `,
            [user_code]
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }

        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Failed to get user",
            error: error.message
        });

    }

});


/* =========================
   UPDATE WALLET BALANCE
========================= */

app.patch("/api/users/:user_code/balance", async (req, res) => {

    try {

        const { user_code } = req.params;
        const { amount } = req.body;

        if (amount === undefined) {

            return res.status(400).json({
                success: false,
                message: "amount is required"
            });

        }

        const result = await pool.query(
            `
            UPDATE users
            SET balance = balance + $1
            WHERE user_code = $2
            RETURNING *
            `,
            [
                Number(amount),
                user_code
            ]
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }

        res.json({
            success: true,
            message: "Balance updated",
            user: result.rows[0]
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Failed to update balance",
            error: error.message
        });

    }

});


/* =========================
   START SERVER
========================= */

async function startServer() {

    try {

        await createTables();

        console.log("Database tables ready");

        app.listen(PORT, "0.0.0.0", () => {

            console.log(
                `BEcoin backend running on port ${PORT}`
            );

        });

    } catch (error) {

        console.error(
            "Server startup failed:",
            error
        );

        process.exit(1);

    }

}

startServer();