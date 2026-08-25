const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

// =========================
// SOCKET.IO
// =========================

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// =========================
// MIDDLEWARE
// =========================

app.use(cors());
app.use(express.json());
app.set("trust proxy", 1);

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests, please try again later"
    }
});

app.use("/api", apiLimiter);

// =========================
// API KEY
// =========================

function requireApiKey(req, res, next) {

    const apiKey = req.headers["x-api-key"];
    const serverApiKey = process.env.BECOIN_API_KEY;

    if (!serverApiKey) {

        console.error(
            "BECOIN_API_KEY is missing on server"
        );

        return res.status(500).json({
            success: false,
            message: "Server API key is not configured"
        });
    }

    if (!apiKey || apiKey !== serverApiKey) {

        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        });
    }

    next();
}

// =========================
// PROTECTED ROUTES
// =========================

app.use("/api/users", requireApiKey);
app.use("/api/wallet", requireApiKey);

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
        version: "2.0.0",
        live_support: true
    });

});

// =========================
// HEALTH CHECK
// =========================

app.get("/api/health", async (req, res) => {

    try {

        const result = await pool.query(
            "SELECT NOW()"
        );

        res.json({
            success: true,
            message: "Database connected",
            time: result.rows[0].now
        });

    } catch (error) {

        console.error(
            "Health check error:",
            error
        );

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

    // =========================
    // USERS
    // =========================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            user_code VARCHAR(50) UNIQUE NOT NULL,
            wallet_address VARCHAR(255),
            balance NUMERIC(18,2) NOT NULL DEFAULT 10000.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            role VARCHAR(20) NOT NULL DEFAULT 'user'
        )
    `);

    // =========================
    // USERS MIGRATION
    // =========================

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(255)
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS balance NUMERIC(18,2)
        NOT NULL DEFAULT 10000.00
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS role VARCHAR(20)
        NOT NULL DEFAULT 'user'
    `);

    await pool.query(`
        UPDATE users
        SET created_at = CURRENT_TIMESTAMP
        WHERE created_at IS NULL
    `);

    // =========================
    // TRANSACTIONS
    // =========================

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

    // =========================
    // LIVE SUPPORT MESSAGES
    // =========================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS support_messages (
            id SERIAL PRIMARY KEY,
            user_code VARCHAR(50) NOT NULL,
            sender_type VARCHAR(20) NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // =========================
    // CHAT INDEX
    // =========================

    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        idx_support_messages_user_code
        ON support_messages(user_code)
    `);

    console.log("All database tables ready");
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

        const cleanUserCode =
            user_code.trim();

        const result = await pool.query(
            `
            INSERT INTO users
            (
                user_code,
                wallet_address
            )
            VALUES ($1, $2)
            RETURNING
                id,
                user_code,
                wallet_address,
                balance,
                created_at,
                role
            `,
            [
                cleanUserCode,
                wallet_address || null
            ]
        );

        res.status(201).json({

            success: true,

            message:
                "User created successfully",

            user: result.rows[0]

        });

    } catch (error) {

        if (error.code === "23505") {

            return res.status(409).json({
                success: false,
                message: "User code already exists"
            });
        }

        console.error(
            "Create user error:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Failed to create user"

        });

    }

});

// =========================
// GET USER
// =========================

app.get(
    "/api/users/:user_code",
    async (req, res) => {

        try {

            const {
                user_code
            } = req.params;

            const result = await pool.query(
                `
                SELECT
                    id,
                    user_code,
                    wallet_address,
                    balance,
                    created_at,
                    role
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

            console.error(
                "Get user error:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Failed to get user"
            });
        }

    }
);

// =========================
// DEPOSIT
// =========================

app.post(
    "/api/wallet/deposit",
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const {
                user_code,
                amount
            } = req.body;

            const numericAmount =
                Number(amount);

            if (
                !user_code ||
                !Number.isFinite(numericAmount) ||
                numericAmount <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Valid user_code and positive amount are required"
                });
            }

            await client.query("BEGIN");

            const userResult =
                await client.query(
                    `
                    UPDATE users
                    SET balance =
                        balance + $1
                    WHERE user_code = $2
                    RETURNING balance
                    `,
                    [
                        numericAmount,
                        user_code
                    ]
                );

            if (
                userResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            const newBalance =
                userResult.rows[0].balance;

            await client.query(
                `
                INSERT INTO transactions
                (
                    user_code,
                    type,
                    amount,
                    balance_after
                )
                VALUES
                ($1, 'deposit', $2, $3)
                `,
                [
                    user_code,
                    numericAmount,
                    newBalance
                ]
            );

            await client.query(
                "COMMIT"
            );

            res.json({
                success: true,
                message: "Deposit successful",
                balance: newBalance
            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Deposit error:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Deposit failed"
            });

        } finally {

            client.release();

        }

    }
);

// =========================
// WITHDRAW
// =========================

app.post(
    "/api/wallet/withdraw",
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const {
                user_code,
                amount
            } = req.body;

            const numericAmount =
                Number(amount);

            if (
                !user_code ||
                !Number.isFinite(numericAmount) ||
                numericAmount <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Valid user_code and positive amount are required"
                });
            }

            await client.query("BEGIN");

            const result =
                await client.query(
                    `
                    UPDATE users
                    SET balance =
                        balance - $1
                    WHERE user_code = $2
                    AND balance >= $1
                    RETURNING balance
                    `,
                    [
                        numericAmount,
                        user_code
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                const userCheck =
                    await client.query(
                        `
                        SELECT
                            id,
                            balance
                        FROM users
                        WHERE user_code = $1
                        `,
                        [user_code]
                    );

                await client.query(
                    "ROLLBACK"
                );

                if (
                    userCheck.rows.length === 0
                ) {

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

            const newBalance =
                result.rows[0].balance;

            await client.query(
                `
                INSERT INTO transactions
                (
                    user_code,
                    type,
                    amount,
                    balance_after
                )
                VALUES
                ($1, 'withdraw', $2, $3)
                `,
                [
                    user_code,
                    numericAmount,
                    newBalance
                ]
            );

            await client.query(
                "COMMIT"
            );

            res.json({
                success: true,
                message:
                    "Withdrawal successful",
                balance: newBalance
            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Withdraw error:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Withdrawal failed"
            });

        } finally {

            client.release();

        }

    }
);

// =========================
// TRANSACTION HISTORY
// =========================

app.get(
    "/api/wallet/:user_code/transactions",
    async (req, res) => {

        try {

            const {
                user_code
            } = req.params;

            const result =
                await pool.query(
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
                transactions:
                    result.rows
            });

        } catch (error) {

            console.error(
                "Transaction history error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to get transactions"
            });
        }

    }
);

// ======================================================
// LIVE SUPPORT - GET CHAT HISTORY
// ======================================================

app.get(
    "/api/support/:user_code/messages",
    requireApiKey,
    async (req, res) => {

        try {

            const {
                user_code
            } = req.params;

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_code,
                        sender_type,
                        message,
                        created_at
                    FROM support_messages
                    WHERE user_code = $1
                    ORDER BY created_at ASC
                    `,
                    [user_code]
                );

            res.json({
                success: true,
                messages:
                    result.rows
            });

        } catch (error) {

            console.error(
                "Support history error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to load support messages"
            });
        }

    }
);

// ======================================================
// LIVE SUPPORT - GET ALL CHAT USERS FOR ADMIN
// ======================================================

app.get(
    "/api/support/users",
    requireApiKey,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        user_code,
                        MAX(created_at)
                        AS last_message_at,
                        COUNT(*)::INTEGER
                        AS message_count
                    FROM support_messages
                    GROUP BY user_code
                    ORDER BY last_message_at DESC
                    `
                );

            res.json({
                success: true,
                users:
                    result.rows
            });

        } catch (error) {

            console.error(
                "Support users error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to load support users"
            });
        }

    }
);

// ======================================================
// LIVE SUPPORT SOCKET
// ======================================================

io.on("connection", (socket) => {

    console.log(
        "Support connected:",
        socket.id
    );

    // =========================
    // JOIN USER CHAT ROOM
    // =========================

    socket.on(
        "join_support",
        ({ user_code }) => {

            if (
                !user_code ||
                typeof user_code !== "string"
            ) {
                return;
            }

            const cleanUserCode =
                user_code.trim();

            if (!cleanUserCode) {
                return;
            }

            const room =
                `support:${cleanUserCode}`;

            socket.join(room);

            socket.emit(
                "support_joined",
                {
                    success: true,
                    user_code:
                        cleanUserCode
                }
            );

            console.log(
                `${socket.id} joined ${room}`
            );
        }
    );

    // =========================
    // SEND SUPPORT MESSAGE
    // =========================

    socket.on(
        "support_message",
        async (data) => {

            try {

                const {
                    user_code,
                    sender_type,
                    message
                } = data || {};

                if (
                    !user_code ||
                    !message
                ) {
                    return;
                }

                if (
                    ![
                        "user",
                        "admin"
                    ].includes(sender_type)
                ) {
                    return;
                }

                const cleanUserCode =
                    String(
                        user_code
                    ).trim();

                const cleanMessage =
                    String(
                        message
                    ).trim();

                if (
                    !cleanUserCode ||
                    !cleanMessage
                ) {
                    return;
                }

                // Maximum message length
                if (
                    cleanMessage.length > 2000
                ) {
                    socket.emit(
                        "support_error",
                        {
                            message:
                                "Message is too long"
                        }
                    );

                    return;
                }

                // =========================
                // CHECK USER
                // =========================

                const userResult =
                    await pool.query(
                        `
                        SELECT id
                        FROM users
                        WHERE user_code = $1
                        `,
                        [cleanUserCode]
                    );

                if (
                    userResult.rows.length === 0
                ) {

                    socket.emit(
                        "support_error",
                        {
                            message:
                                "User not found"
                        }
                    );

                    return;
                }

                // =========================
                // SAVE MESSAGE
                // =========================

                const result =
                    await pool.query(
                        `
                        INSERT INTO support_messages
                        (
                            user_code,
                            sender_type,
                            message
                        )
                        VALUES
                        ($1, $2, $3)
                        RETURNING
                            id,
                            user_code,
                            sender_type,
                            message,
                            created_at
                        `,
                        [
                            cleanUserCode,
                            sender_type,
                            cleanMessage
                        ]
                    );

                const savedMessage =
                    result.rows[0];

                // =========================
                // SEND TO USER + ADMIN
                // =========================

                io.to(
                    `support:${cleanUserCode}`
                ).emit(
                    "support_message",
                    savedMessage
                );

            } catch (error) {

                console.error(
                    "Support chat error:",
                    error
                );

                socket.emit(
                    "support_error",
                    {
                        message:
                            "Message could not be sent"
                    }
                );
            }

        }
    );

    // =========================
    // DISCONNECT
    // =========================

    socket.on(
        "disconnect",
        () => {

            console.log(
                "Support disconnected:",
                socket.id
            );

        }
    );

});

// =========================
// 404
// =========================

app.use(
    (req, res) => {

        res.status(404).json({
            success: false,
            message:
                "Route not found"
        });

    }
);

// =========================
// GLOBAL ERROR HANDLER
// =========================

app.use(
    (error, req, res, next) => {

        console.error(
            "Unhandled error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Internal server error"
        });

    }
);

// =========================
// START SERVER
// =========================

async function startServer() {

    try {

        await createTables();

        console.log(
            "Database tables ready"
        );

        server.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `BEcoin backend running on port ${PORT}`
                );

                console.log(
                    "Live support chat is enabled"
                );

            }
        );

    } catch (error) {

        console.error(
            "Server startup failed:",
            error
        );

        process.exit(1);
    }

}

startServer();