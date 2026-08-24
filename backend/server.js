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
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Database connection failed",
            error: error.message
        });
    }
});


/* =========================
   DATABASE MIGRATION
========================= */

app.get("/api/setup", async (req, res) => {
    try {

        /*
         * Create users table if it does not exist.
         */
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                user_code VARCHAR(50) UNIQUE,
                wallet_address VARCHAR(100),
                balance NUMERIC(18,2) DEFAULT 10000.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);


        /*
         * Add missing columns to an
         * already-existing users table.
         */

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS
            user_code VARCHAR(50);
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS
            wallet_address VARCHAR(100);
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS
            balance NUMERIC(18,2)
            DEFAULT 10000.00;
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS
            created_at TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP;
        `);


        /*
         * Give existing users a user code
         * if they do not have one.
         */

        await pool.query(`
            UPDATE users
            SET user_code =
                'BEC-' || LPAD(id::TEXT, 6, '0')
            WHERE user_code IS NULL;
        `);


        /*
         * Give NULL balances the default
         * demo balance.
         */

        await pool.query(`
            UPDATE users
            SET balance = 10000.00
            WHERE balance IS NULL;
        `);


        res.json({
            success: true,
            message:
                "Database migration completed successfully"
        });

    } catch (error) {

        console.error(
            "Migration error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Database migration failed",
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
            message:
                "User created successfully",
            user: result.rows[0]
        });

    } catch (error) {

        console.error(
            "Create user error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Failed to create user",
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

            const id =
                Number(req.params.id);

            if (!Number.isInteger(id)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid user ID"
                });
            }

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
                    message:
                        "User not found"
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
                message:
                    "Failed to get user",
                error: error.message
            });
        }
    }
);


/* =========================
   UPDATE WALLET
========================= */

app.put(
    "/api/users/:id/wallet",
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const {
                walletAddress
            } = req.body;

            if (!walletAddress) {

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
                    message:
                        "User not found"
                });
            }

            res.json({
                success: true,
                message:
                    "Wallet updated successfully",
                user: result.rows[0]
            });

        } catch (error) {

            console.error(error);

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

            const id =
                Number(req.params.id);

            const amount =
                Number(req.body.amount);

            if (
                !Number.isFinite(amount)
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
                        amount,
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
                    "Balance updated successfully",
                user: result.rows[0]
            });

        } catch (error) {

            console.error(error);

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
   SERVER
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