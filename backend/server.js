const express = require("express");
const { Pool } = require("pg");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

/* =========================
   DATABASE
========================= */

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

app.get("/api/db-test", async (req, res) => {
    try {

        const result = await pool.query(
            "SELECT NOW() AS time"
        );

        res.json({
            success: true,
            message: "PostgreSQL connected successfully",
            databaseTime: result.rows[0].time
        });

    } catch (error) {

        console.error(
            "Database error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});


/* =========================
   DATABASE SETUP
========================= */

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

        console.error(
            "Setup error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to create users table",
            error: error.message
        });
    }
});


/* =========================
   CREATE USER
========================= */

app.post("/api/users", async (req, res) => {
    try {

        const userCode =
            "BEC-" +
            Math.floor(
                100000 +
                Math.random() * 900000
            );

        const result =
            await pool.query(
                `
                INSERT INTO users
                (
                    user_code,
                    balance
                )
                VALUES
                (
                    $1,
                    $2
                )
                RETURNING
                    id,
                    user_code,
                    wallet_address,
                    balance,
                    created_at
                `,
                [
                    userCode,
                    10000
                ]
            );

        res.status(201).json({
            success: true,
            message: "User created successfully",
            user: result.rows[0]
        });

    } catch (error) {

        console.error(
            "Create user error:",
            error
        );

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

app.get(
    "/api/users/:id",
    async (req, res) => {

        try {

            const { id } =
                req.params;

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_code,
                        wallet_address,
                        balance,
                        created_at
                    FROM users
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                result.rows.length === 0
            ) {

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

            console.error(
                "Get user error:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Failed to get user",
                error: error.message
            });
        }
    }
);


/* =========================
   UPDATE WALLET ADDRESS
========================= */

app.put(
    "/api/users/:id/wallet",
    async (req, res) => {

        try {

            const { id } =
                req.params;

            const {
                walletAddress
            } = req.body;

            if (
                !walletAddress
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Wallet address is required"
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET wallet_address = $1
                    WHERE id = $2
                    RETURNING
                        id,
                        user_code,
                        wallet_address,
                        balance
                    `,
                    [
                        walletAddress,
                        id
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            res.json({
                success: true,
                message:
                    "Wallet address updated",
                user: result.rows[0]
            });

        } catch (error) {

            console.error(
                "Wallet update error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to update wallet",
                error: error.message
            });
        }
    }
);


/* =========================
   UPDATE BALANCE
========================= */

app.put(
    "/api/users/:id/balance",
    async (req, res) => {

        try {

            const { id } =
                req.params;

            const {
                amount
            } = req.body;

            const numericAmount =
                Number(amount);

            if (
                !Number.isFinite(
                    numericAmount
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Valid amount is required"
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET balance =
                        balance + $1
                    WHERE id = $2
                    AND balance + $1 >= 0
                    RETURNING
                        id,
                        user_code,
                        balance
                    `,
                    [
                        numericAmount,
                        id
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "User not found or insufficient balance"
                });
            }

            res.json({
                success: true,
                message:
                    "Balance updated",
                user: result.rows[0]
            });

        } catch (error) {

            console.error(
                "Balance update error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to update balance",
                error: error.message
            });
        }
    }
);


/* =========================
   START SERVER
========================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `BEcoin backend running on port ${PORT}`
        );

    }
);