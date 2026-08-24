const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS password_hash TEXT
    `);

}


/* =========================
   CREATE USER
========================= */

app.post("/api/users", async (req, res) => {

    try {

        const { user_code, password, wallet_address } = req.body;

        if (!user_code || !password) {
            return res.status(400).json({
                success: false,
                message: "user_code and password are required"
            });
        }

        if (typeof user_code !== "string" || user_code.length < 3 || user_code.length > 50) {
            return res.status(400).json({
                success: false,
                message: "user_code must be between 3 and 50 characters"
            });
        }

        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `
            INSERT INTO users
            (user_code, wallet_address, password_hash)
            VALUES ($1, $2, $3)
            RETURNING
                id,
                user_code,
                wallet_address,
                balance,
                created_at
            `,
            [
                user_code.trim(),
                wallet_address || null,
                passwordHash
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

        console.error("Create user error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create user"
        });

    }

});

/* =========================
   LOGIN
========================= */

app.post("/api/auth/login", async (req, res) => {

    try {

        const { user_code, password } = req.body;

        if (!user_code || !password) {
            return res.status(400).json({
                success: false,
                message: "user_code and password are required"
            });
        }

        const result = await pool.query(
            `
            SELECT
                id,
                user_code,
                wallet_address,
                password_hash,
                balance
            FROM users
            WHERE user_code = $1
            `,
            [user_code.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid user_code or password"
            });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid user_code or password"
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is not configured");

            return res.status(500).json({
                success: false,
                message: "Authentication service is not configured"
            });
        }

        const token = jwt.sign(
            {
                userId: user.id,
                userCode: user.user_code
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1h"
            }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user.id,
                user_code: user.user_code,
                wallet_address: user.wallet_address,
                balance: user.balance
            }
        });

    } catch (error) {

        console.error("Login error:", error);

        res.status(500).json({
            success: false,
            message: "Login failed"
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
========================


/* =========================
   START SERVER
========================= */

async function startServer() {

    try {

        await createTables();
        await createTransactionTable();

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
/* =========================
   TRANSACTIONS TABLE
========================= */

async function createTransactionTable() {

    await pool.query(`
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_code VARCHAR(50) NOT NULL,
            type VARCHAR(20) NOT NULL,
            amount NUMERIC(18,2) NOT NULL,
            balance_after NUMERIC(18,2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

}


/* =========================
   DEPOSIT
========================= */

app.post("/api/wallet/deposit", async (req, res) => {

    const client = await pool.connect();

    try {

        const { user_code, amount } = req.body;

        if (!user_code || !amount || Number(amount) <= 0) {

            return res.status(400).json({
                success: false,
                message: "Valid user_code and amount are required"
            });

        }

        await client.query("BEGIN");

        const userResult = await client.query(
            `
            UPDATE users
            SET balance = balance + $1
            WHERE user_code = $2
            RETURNING *
            `,
            [Number(amount), user_code]
        );

        if (userResult.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }

        const user = userResult.rows[0];

        await client.query(
            `
            INSERT INTO transactions
            (user_code, type, amount, balance_after)
            VALUES ($1, $2, $3, $4)
            `,
            [
                user_code,
                "deposit",
                Number(amount),
                user.balance
            ]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Deposit successful",
            balance: user.balance
        });

    } catch (error) {

        await client.query("ROLLBACK");

        res.status(500).json({
            success: false,
            message: "Deposit failed",
            error: error.message
        });

    } finally {

        client.release();

    }

});


/* =========================
   WITHDRAW
========================= */

app.post("/api/wallet/withdraw", async (req, res) => {

    const client = await pool.connect();

    try {

        const { user_code, amount } = req.body;

        if (!user_code || !amount || Number(amount) <= 0) {

            return res.status(400).json({
                success: false,
                message: "Valid user_code and amount are required"
            });

        }

        await client.query("BEGIN");

        const userResult = await client.query(
            `
            SELECT *
            FROM users
            WHERE user_code = $1
            FOR UPDATE
            `,
            [user_code]
        );

        if (userResult.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }

        const user = userResult.rows[0];

        if (Number(user.balance) < Number(amount)) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Insufficient balance"
            });

        }

        const updateResult = await client.query(
            `
            UPDATE users
            SET balance = balance - $1
            WHERE user_code = $2
            RETURNING *
            `,
            [Number(amount), user_code]
        );

        const updatedUser = updateResult.rows[0];

        await client.query(
            `
            INSERT INTO transactions
            (user_code, type, amount, balance_after)
            VALUES ($1, $2, $3, $4)
            `,
            [
                user_code,
                "withdraw",
                Number(amount),
                updatedUser.balance
            ]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Withdrawal successful",
            balance: updatedUser.balance
        });

    } catch (error) {

        await client.query("ROLLBACK");

        res.status(500).json({
            success: false,
            message: "Withdrawal failed",
            error: error.message
        });

    } finally {

        client.release();

    }

});


/* =========================
   TRANSACTION HISTORY
========================= */

app.get("/api/wallet/:user_code/transactions", async (req, res) => {

    try {

        const { user_code } = req.params;

        const result = await pool.query(
            `
            SELECT
                id,
                type,
                amount,
                balance_after,
                created_at
            FROM transactions
            WHERE user_code = $1
            ORDER BY created_at DESC
            `,
            [user_code]
        );

        res.json({
            success: true,
            transactions: result.rows
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Failed to get transactions",
            error: error.message
        });

    }

});


startServer();