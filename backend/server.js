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
   DATABASE SETUP
========================= */

app.get("/api/setup", async (req, res) => {
    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                user_code VARCHAR(50) UNIQUE,
                wallet_address VARCHAR(100),
                balance NUMERIC(18,2) DEFAULT 10000.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS user_code VARCHAR(50);
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(100);
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS balance NUMERIC(18,2)
            DEFAULT 10000.00;
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP;
        `);

        await pool.query(`
            UPDATE users
            SET user_code =
                'BEC-' || LPAD(id::TEXT, 6, '0')
            WHERE user_code IS NULL;
        `);

        await pool.query(`
            UPDATE users
            SET balance = 10000.00
            WHERE balance IS NULL;
        `);


        /* Wallet transactions */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                type VARCHAR(20) NOT NULL,
                amount NUMERIC(18,2) NOT NULL,
                balance_after NUMERIC(18,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT fk_wallet_user
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
            );
        `);


        /* Trades */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS trades (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                asset VARCHAR(50) NOT NULL,
                trade_type VARCHAR(20) NOT NULL,
                direction VARCHAR(10),
                amount NUMERIC(18,2) NOT NULL,
                entry_price NUMERIC(18,8),
                exit_price NUMERIC(18,8),
                result VARCHAR(20),
                profit NUMERIC(18,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT fk_trade_user
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
            );
        `);


        res.json({
            success: true,
            message:
                "BEcoin database setup completed"
        });

    } catch (error) {

        console.error(
            "Setup error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Database setup failed",
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

        console.error(error);

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

            if (
                !Number.isInteger(id)
            ) {
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

            console.error(error);

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
   WALLET ADDRESS
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
                    "Wallet address updated",
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
   DEPOSIT
========================= */

app.post(
    "/api/wallet/deposit",
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const userId =
                Number(req.body.userId);

            const amount =
                Number(req.body.amount);

            if (
                !Number.isInteger(userId) ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Valid userId and amount are required"
                });
            }

            await client.query("BEGIN");

            const user =
                await client.query(
                    `
                    SELECT balance
                    FROM users
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [userId]
                );

            if (
                user.rows.length === 0
            ) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found"
                });
            }

            const newBalance =
                Number(user.rows[0].balance) +
                amount;

            await client.query(
                `
                UPDATE users
                SET balance = $1
                WHERE id = $2
                `,
                [
                    newBalance,
                    userId
                ]
            );

            await client.query(
                `
                INSERT INTO wallet_transactions
                (
                    user_id,
                    type,
                    amount,
                    balance_after
                )
                VALUES
                (
                    $1,
                    'DEPOSIT',
                    $2,
                    $3
                )
                `,
                [
                    userId,
                    amount,
                    newBalance
                ]
            );

            await client.query("COMMIT");

            res.json({
                success: true,
                message:
                    "Demo deposit successful",
                balance:
                    newBalance.toFixed(2)
            });

        } catch (error) {

            await client.query("ROLLBACK");

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Deposit failed",
                error: error.message
            });

        } finally {

            client.release();
        }
    }
);


/* =========================
   WITHDRAW
========================= */

app.post(
    "/api/wallet/withdraw",
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const userId =
                Number(req.body.userId);

            const amount =
                Number(req.body.amount);

            if (
                !Number.isInteger(userId) ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Valid userId and amount are required"
                });
            }

            await client.query("BEGIN");

            const user =
                await client.query(
                    `
                    SELECT balance
                    FROM users
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [userId]
                );

            if (
                user.rows.length === 0
            ) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found"
                });
            }

            const currentBalance =
                Number(
                    user.rows[0].balance
                );

            if (
                amount > currentBalance
            ) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Insufficient demo balance"
                });
            }

            const newBalance =
                currentBalance -
                amount;

            await client.query(
                `
                UPDATE users
                SET balance = $1
                WHERE id = $2
                `,
                [
                    newBalance,
                    userId
                ]
            );

            await client.query(
                `
                INSERT INTO wallet_transactions
                (
                    user_id,
                    type,
                    amount,
                    balance_after
                )
                VALUES
                (
                    $1,
                    'WITHDRAW',
                    $2,
                    $3
                )
                `,
                [
                    userId,
                    amount,
                    newBalance
                ]
            );

            await client.query("COMMIT");

            res.json({
                success: true,
                message:
                    "Demo withdrawal successful",
                balance:
                    newBalance.toFixed(2)
            });

        } catch (error) {

            await client.query("ROLLBACK");

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Withdrawal failed",
                error: error.message
            });

        } finally {

            client.release();
        }
    }
);


/* =========================
   WALLET TRANSACTIONS
========================= */

app.get(
    "/api/wallet/:userId/transactions",
    async (req, res) => {

        try {

            const userId =
                Number(req.params.userId);

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        type,
                        amount,
                        balance_after,
                        created_at
                    FROM wallet_transactions
                    WHERE user_id = $1
                    ORDER BY created_at DESC
                    `,
                    [userId]
                );

            res.json({
                success: true,
                transactions:
                    result.rows
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Failed to get transactions",
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