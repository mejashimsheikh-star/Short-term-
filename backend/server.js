const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;

// =========================
// MIDDLEWARE
// =========================

app.use(cors());
app.use(express.json());

// =========================
// DATABASE
// =========================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// =========================
// HOME
// =========================

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "BEcoin backend is running",
        version: "1.0.0"
    });
});

// =========================
// HEALTH CHECK
// =========================

app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            success: true,
            message: "Database connected",
            time: result.rows[0].now
        });

    } catch (error) {
        console.error("Health check error:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

// =========================
// CREATE TABLES
// =========================

async function createTables() {

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            user_code VARCHAR(50) UNIQUE NOT NULL,
            wallet_address VARCHAR(255),
            balance NUMERIC(18,2) NOT NULL DEFAULT 10000.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

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
// =========================
// CREATE USER
// =========================

app.post("/api/users", async (req, res) => {

    try {

        const {
            user_code,
            wallet_address
        } = req.body;

        if (
            !user_code ||
            typeof user_code !== "string" ||
            user_code.trim().length < 3
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid user_code is required"
            });
        }

        const result = await pool.query(
            `
            INSERT INTO users
            (user_code, wallet_address)
            VALUES ($1, $2)
            RETURNING id, user_code, wallet_address, balance, created_at
            `,
            [
                user_code.trim(),
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

        console.error("Create user error:", error);

         res.status(500).json({
             success: false,
             message: "Failed to create user",
             error: error.message,
             code: error.code
         });
    }

});

// =========================
// GET USER
// =========================

app.get("/api/users/:user_code", async (req, res) => {

    try {

        const { user_code } = req.params;

        const result = await pool.query(
            `
            SELECT
                id,
                user_code,
                wallet_address,
                balance,
                created_at
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

        console.error("Get user error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get user"
        });
    }

});

// =========================
// DEPOSIT
// =========================

app.post("/api/wallet/deposit", async (req, res) => {

    const client = await pool.connect();

    try {

        const {
            user_code,
            amount
        } = req.body;

        const numericAmount = Number(amount);

        if (
            !user_code ||
            !Number.isFinite(numericAmount) ||
            numericAmount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid user_code and positive amount are required"
            });
        }

        await client.query("BEGIN");

        const userResult = await client.query(
            `
            UPDATE users
            SET balance = balance + $1
            WHERE user_code = $2
            RETURNING balance
            `,
            [numericAmount, user_code]
        );

        if (userResult.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const newBalance = userResult.rows[0].balance;

        await client.query(
            `
            INSERT INTO transactions
            (user_code, type, amount, balance_after)
            VALUES ($1, 'deposit', $2, $3)
            `,
            [
                user_code,
                numericAmount,
                newBalance
            ]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Deposit successful",
            balance: newBalance
        });

    } catch (error) {

        await client.query("ROLLBACK");

        console.error("Deposit error:", error);

        res.status(500).json({
            success: false,
            message: "Deposit failed"
        });

    } finally {

        client.release();

    }

});

// =========================
// WITHDRAW
// =========================

app.post("/api/wallet/withdraw", async (req, res) => {

    const client = await pool.connect();

    try {

        const {
            user_code,
            amount
        } = req.body;

        const numericAmount = Number(amount);

        if (
            !user_code ||
            !Number.isFinite(numericAmount) ||
            numericAmount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid user_code and positive amount are required"
            });
        }

        await client.query("BEGIN");

        const result = await client.query(
            `
            UPDATE users
            SET balance = balance - $1
            WHERE user_code = $2
            AND balance >= $1
            RETURNING balance
            `,
            [
                numericAmount,
                user_code
            ]
        );

        if (result.rows.length === 0) {

            const userCheck = await client.query(
                `
                SELECT id, balance
                FROM users
                WHERE user_code = $1
                `,
                [user_code]
            );

            await client.query("ROLLBACK");

            if (userCheck.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });

            }

            return res.status(400).json({
                success: false,
                message: "Insufficient balance"
            });
        }

        const newBalance = result.rows[0].balance;

        await client.query(
            `
            INSERT INTO transactions
            (user_code, type, amount, balance_after)
            VALUES ($1, 'withdraw', $2, $3)
            `,
            [
                user_code,
                numericAmount,
                newBalance
            ]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Withdrawal successful",
            balance: newBalance
        });

    } catch (error) {

        await client.query("ROLLBACK");

        console.error("Withdraw error:", error);

        res.status(500).json({
            success: false,
            message: "Withdrawal failed"
        });

    } finally {

        client.release();

    }

});

// =========================
// TRANSACTION HISTORY
// =========================

app.get(
    "/api/wallet/:user_code/transactions",
    async (req, res) => {

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

            console.error("Transaction history error:", error);

            res.status(500).json({
                success: false,
                message: "Failed to get transactions"
            });
        }

    }
);

// =========================
// 404
// =========================

app.use((req, res) => {

    res.status(404).json({
        success: false,
        message: "Route not found"
    });

});

// =========================
// GLOBAL ERROR HANDLER
// =========================

app.use((error, req, res, next) => {

    console.error("Unhandled error:", error);

    res.status(500).json({
        success: false,
        message: "Internal server error"
    });

});

// =========================
// START SERVER
// =========================

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