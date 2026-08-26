const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("JWT_SECRET is missing");
    process.exit(1);
}

// ======================================================
// SOCKET.IO
// ======================================================

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json());
app.set("trust proxy", 1);

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests, please try again later"
    }
});

app.use("/api", apiLimiter);

// ======================================================
// DATABASE
// ======================================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// ======================================================
// API KEY
// ======================================================

function requireApiKey(req, res, next) {

    const apiKey = req.headers["x-api-key"];
    const serverApiKey = process.env.BECOIN_API_KEY;

    if (!serverApiKey) {

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

// ======================================================
// ADMIN JWT
// ======================================================

function requireAdmin(req, res, next) {

    try {

        const authHeader =
            req.headers.authorization || "";

        if (!authHeader.startsWith("Bearer ")) {

            return res.status(401).json({
                success: false,
                message: "Admin authentication required"
            });
        }

        const token =
            authHeader.substring(7);

        const decoded =
            jwt.verify(token, JWT_SECRET);

        if (
            !decoded ||
            decoded.type !== "admin"
        ) {

            return res.status(403).json({
                success: false,
                message: "Admin access denied"
            });
        }

        req.admin = decoded;

        next();

    } catch (error) {

        return res.status(401).json({
            success: false,
            message: "Invalid or expired admin token"
        });
    }
}

// ======================================================
// AUDIT LOG
// ======================================================

async function auditLog({
    adminId = null,
    action,
    targetType = null,
    targetId = null,
    details = {}
}) {

    try {

        await pool.query(
            `
            INSERT INTO audit_logs
            (
                admin_id,
                action,
                target_type,
                target_id,
                details
            )
            VALUES ($1, $2, $3, $4, $5)
            `,
            [
                adminId,
                action,
                targetType,
                targetId,
                JSON.stringify(details)
            ]
        );

    } catch (error) {

        console.error(
            "Audit log error:",
            error
        );
    }
}

// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {

    res.json({
        success: true,
        message: "BEcoin backend is running",
        version: "3.0.0",
        websocket: true,
        socket_path: "/socket.io",
        live_support: true
    });

});

// ======================================================
// HEALTH
// ======================================================

app.get("/api/health", async (req, res) => {

    try {

        const result =
            await pool.query("SELECT NOW()");

        res.json({
            success: true,
            message: "Database connected",
            websocket: true,
            time: result.rows[0].now
        });

    } catch (error) {

        console.error(
            "Health error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }

});

// ======================================================
// CREATE TABLES
// ======================================================

async function createTables() {

    // --------------------------------------------------
    // UUID EXTENSION
    // --------------------------------------------------

    await pool.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto
    `);

    // --------------------------------------------------
    // USERS
    // --------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            user_id UUID UNIQUE DEFAULT gen_random_uuid(),
            user_code VARCHAR(50) UNIQUE NOT NULL,
            wallet_address VARCHAR(255),
            balance NUMERIC(18,2) NOT NULL DEFAULT 10000.00,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS user_id UUID
    `);

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
        ADD COLUMN IF NOT EXISTS role VARCHAR(20)
        NOT NULL DEFAULT 'user'
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS status VARCHAR(20)
        NOT NULL DEFAULT 'active'
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
        UPDATE users
        SET user_id = gen_random_uuid()
        WHERE user_id IS NULL
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_users_user_id
        ON users(user_id)
    `);

    // --------------------------------------------------
    // TRANSACTIONS
    // --------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id UUID,
            user_code VARCHAR(50) NOT NULL,
            type VARCHAR(30) NOT NULL,
            amount NUMERIC(18,2) NOT NULL,
            balance_after NUMERIC(18,2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS user_id UUID
    `);

    await pool.query(`
        UPDATE transactions t
        SET user_id = u.user_id
        FROM users u
        WHERE t.user_id IS NULL
        AND t.user_code = u.user_code
    `);

    // --------------------------------------------------
    // SUPPORT MESSAGES
    // --------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS support_messages (
            id SERIAL PRIMARY KEY,
            user_id UUID,
            user_code VARCHAR(50) NOT NULL,
            sender_type VARCHAR(20) NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        ALTER TABLE support_messages
        ADD COLUMN IF NOT EXISTS user_id UUID
    `);

    await pool.query(`
        UPDATE support_messages s
        SET user_id = u.user_id
        FROM users u
        WHERE s.user_id IS NULL
        AND s.user_code = u.user_code
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        idx_support_messages_user_id
        ON support_messages(user_id)
    `);

    // --------------------------------------------------
    // ADMIN USERS
    // --------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
            admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name VARCHAR(100),
            role VARCHAR(30) NOT NULL DEFAULT 'admin',
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // --------------------------------------------------
    // AUDIT LOGS
    // --------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id BIGSERIAL PRIMARY KEY,
            admin_id UUID,
            action VARCHAR(100) NOT NULL,
            target_type VARCHAR(50),
            target_id VARCHAR(255),
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        idx_audit_logs_created_at
        ON audit_logs(created_at DESC)
    `);

    // --------------------------------------------------
    // TRADE SETTINGS
    // --------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS trade_settings (
            id INTEGER PRIMARY KEY,
            duration_seconds INTEGER NOT NULL DEFAULT 60,
            enabled BOOLEAN NOT NULL DEFAULT true,
            updated_by UUID,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        INSERT INTO trade_settings
        (
            id,
            duration_seconds,
            enabled
        )
        VALUES
        (1, 60, true)
        ON CONFLICT (id)
        DO NOTHING
    `);

    console.log("All database tables ready");
}

// ======================================================
// ADMIN LOGIN
// ======================================================

app.post("/api/admin/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;

        if (!email || !password) {

            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const result =
            await pool.query(
                `
                SELECT
                    admin_id,
                    email,
                    password_hash,
                    name,
                    role,
                    status
                FROM admin_users
                WHERE LOWER(email) = LOWER($1)
                `,
                [email.trim()]
            );

        if (result.rows.length === 0) {

            return res.status(401).json({
                success: false,
                message: "Invalid login credentials"
            });
        }

        const admin =
            result.rows[0];

        if (admin.status !== "active") {

            return res.status(403).json({
                success: false,
                message: "Admin account is disabled"
            });
        }

        const passwordOK =
            await bcrypt.compare(
                password,
                admin.password_hash
            );

        if (!passwordOK) {

            return res.status(401).json({
                success: false,
                message: "Invalid login credentials"
            });
        }

        const token =
            jwt.sign(
                {
                    admin_id: admin.admin_id,
                    email: admin.email,
                    role: admin.role,
                    type: "admin"
                },
                JWT_SECRET,
                {
                    expiresIn: "12h"
                }
            );

        await auditLog({
            adminId: admin.admin_id,
            action: "ADMIN_LOGIN",
            targetType: "admin",
            targetId: admin.admin_id,
            details: {
                email: admin.email
            }
        });

        res.json({
            success: true,
            token,
            admin: {
                admin_id: admin.admin_id,
                email: admin.email,
                name: admin.name,
                role: admin.role
            }
        });

    } catch (error) {

        console.error(
            "Admin login error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }

});

// ======================================================
// ADMIN ME
// ======================================================

app.get(
    "/api/admin/me",
    requireAdmin,
    async (req, res) => {

        res.json({
            success: true,
            admin: {
                admin_id: req.admin.admin_id,
                email: req.admin.email,
                role: req.admin.role
            }
        });

    }
);

// ======================================================
// ADMIN - LIST USERS
// ======================================================

app.get(
    "/api/admin/users",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        user_id,
                        user_code,
                        wallet_address,
                        balance,
                        role,
                        status,
                        created_at,
                        updated_at
                    FROM users
                    ORDER BY created_at DESC
                    `
                );

            res.json({
                success: true,
                users: result.rows
            });

        } catch (error) {

            console.error(
                "Admin users error:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Failed to load users"
            });
        }
    }
);

// ======================================================
// ADMIN - GET USER
// ======================================================

app.get(
    "/api/admin/users/:user_id",
    requireAdmin,
    async (req, res) => {

        try {

            const {
                user_id
            } = req.params;

            const result =
                await pool.query(
                    `
                    SELECT
                        user_id,
                        user_code,
                        wallet_address,
                        balance,
                        role,
                        status,
                        created_at,
                        updated_at
                    FROM users
                    WHERE user_id = $1
                    `,
                    [user_id]
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
                "Admin get user error:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Failed to load user"
            });
        }
    }
);

// ======================================================
// ADMIN - CHANGE BALANCE
// ======================================================

app.patch(
    "/api/admin/users/:user_id/balance",
    requireAdmin,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const {
                user_id
            } = req.params;

            const {
                amount,
                mode = "set",
                reason = "Admin balance update"
            } = req.body;

            const numericAmount =
                Number(amount);

            if (
                !Number.isFinite(numericAmount) ||
                numericAmount < 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Valid non-negative amount is required"
                });
            }

            if (
                !["set", "add", "subtract"]
                    .includes(mode)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "mode must be set, add or subtract"
                });
            }

            await client.query("BEGIN");

            const userResult =
                await client.query(
                    `
                    SELECT
                        user_id,
                        user_code,
                        balance
                    FROM users
                    WHERE user_id = $1
                    FOR UPDATE
                    `,
                    [user_id]
                );

            if (userResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            const user =
                userResult.rows[0];

            const oldBalance =
                Number(user.balance);

            let newBalance;

            if (mode === "set") {

                newBalance =
                    numericAmount;

            } else if (mode === "add") {

                newBalance =
                    oldBalance +
                    numericAmount;

            } else {

                newBalance =
                    oldBalance -
                    numericAmount;

                if (newBalance < 0) {

                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(400).json({
                        success: false,
                        message:
                            "Balance cannot become negative"
                    });
                }
            }

            const updated =
                await client.query(
                    `
                    UPDATE users
                    SET
                        balance = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $2
                    RETURNING
                        user_id,
                        user_code,
                        balance
                    `,
                    [
                        newBalance,
                        user_id
                    ]
                );

            await client.query(
                `
                INSERT INTO transactions
                (
                    user_id,
                    user_code,
                    type,
                    amount,
                    balance_after
                )
                VALUES
                (
                    $1,
                    $2,
                    'admin_adjustment',
                    $3,
                    $4
                )
                `,
                [
                    user.user_id,
                    user.user_code,
                    newBalance - oldBalance,
                    newBalance
                ]
            );

            await client.query("COMMIT");

            await auditLog({
                adminId: req.admin.admin_id,
                action: "BALANCE_UPDATE",
                targetType: "user",
                targetId: user_id,
                details: {
                    user_code: user.user_code,
                    old_balance: oldBalance,
                    new_balance: newBalance,
                    mode,
                    reason
                }
            });

            io.to(
                `user:${user_id}`
            ).emit(
                "balance_updated",
                {
                    user_id,
                    user_code: user.user_code,
                    balance: newBalance
                }
            );

            res.json({
                success: true,
                message: "Balance updated",
                user: updated.rows[0]
            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Balance update error:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Balance update failed"
            });

        } finally {

            client.release();

        }
    }
);

// ======================================================
// ADMIN - CHANGE USER STATUS
// ======================================================

app.patch(
    "/api/admin/users/:user_id/status",
    requireAdmin,
    async (req, res) => {

        try {

            const {
                user_id
            } = req.params;

            const {
                status
            } = req.body;

            if (
                !["active", "blocked"]
                    .includes(status)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Status must be active or blocked"
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        status = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $2
                    RETURNING
                        user_id,
                        user_code,
                        status
                    `,
                    [
                        status,
                        user_id
                    ]
                );

            if (result.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            await auditLog({
                adminId: req.admin.admin_id,
                action: "USER_STATUS_UPDATE",
                targetType: "user",
                targetId: user_id,
                details: {
                    status
                }
            });

            io.to(
                `user:${user_id}`
            ).emit(
                "account_status",
                {
                    status
                }
            );

            res.json({
                success: true,
                user: result.rows[0]
            });

        } catch (error) {

            console.error(
                "Status update error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to update user status"
            });
        }
    }
);

// ======================================================
// ADMIN - TRADE SETTINGS
// ======================================================

app.get(
    "/api/admin/trade-settings",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        duration_seconds,
                        enabled,
                        updated_by,
                        updated_at
                    FROM trade_settings
                    WHERE id = 1
                    `
                );

            res.json({
                success: true,
                settings:
                    result.rows[0]
            });

        } catch (error) {

            console.error(
                "Trade settings error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to load trade settings"
            });
        }
    }
);

// ======================================================
// ADMIN - UPDATE TRADE SETTINGS
// ======================================================

app.patch(
    "/api/admin/trade-settings",
    requireAdmin,
    async (req, res) => {

        try {

            const {
                duration_seconds,
                enabled
            } = req.body;

            const duration =
                Number(duration_seconds);

            if (
                ![60, 90, 120]
                    .includes(duration)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Duration must be 60, 90 or 120 seconds"
                });
            }

            const enabledValue =
                enabled === undefined
                    ? true
                    : Boolean(enabled);

            const result =
                await pool.query(
                    `
                    UPDATE trade_settings
                    SET
                        duration_seconds = $1,
                        enabled = $2,
                        updated_by = $3,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                    RETURNING
                        duration_seconds,
                        enabled,
                        updated_by,
                        updated_at
                    `,
                    [
                        duration,
                        enabledValue,
                        req.admin.admin_id
                    ]
                );

            await auditLog({
                adminId: req.admin.admin_id,
                action: "TRADE_SETTINGS_UPDATE",
                targetType: "trade_settings",
                targetId: "1",
                details: {
                    duration_seconds:
                        duration,
                    enabled:
                        enabledValue
                }
            });

            // Broadcast setting to connected users
            io.emit(
                "trade_settings_updated",
                {
                    duration_seconds:
                        duration,
                    enabled:
                        enabledValue
                }
            );

            res.json({
                success: true,
                settings:
                    result.rows[0]
            });

        } catch (error) {

            console.error(
                "Trade setting update error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to update trade settings"
            });
        }
    }
);

// ======================================================
// ADMIN - AUDIT LOGS
// ======================================================

app.get(
    "/api/admin/audit-logs",
    requireAdmin,
    async (req, res) => {

        try {

            const limit =
                Math.min(
                    Number(req.query.limit) || 100,
                    500
                );

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        admin_id,
                        action,
                        target_type,
                        target_id,
                        details,
                        created_at
                    FROM audit_logs
                    ORDER BY created_at DESC
                    LIMIT $1
                    `,
                    [limit]
                );

            res.json({
                success: true,
                logs: result.rows
            });

        } catch (error) {

            console.error(
                "Audit log fetch error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to load audit logs"
            });
        }
    }
);

// ======================================================
// CREATE USER
// ======================================================

app.post(
    "/api/users",
    requireApiKey,
    async (req, res) => {

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
                    message:
                        "Valid user_code is required"
                });
            }

            const cleanUserCode =
                user_code.trim();

            const result =
                await pool.query(
                    `
                    INSERT INTO users
                    (
                        user_code,
                        wallet_address
                    )
                    VALUES ($1, $2)
                    RETURNING
                        user_id,
                        user_code,
                        wallet_address,
                        balance,
                        created_at,
                        role,
                        status
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
                user:
                    result.rows[0]
            });

        } catch (error) {

            if (error.code === "23505") {

                return res.status(409).json({
                    success: false,
                    message:
                        "User code already exists"
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
    }
);

// ======================================================
// GET USER
// ======================================================

app.get(
    "/api/users/:user_code",
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
                        user_id,
                        user_code,
                        wallet_address,
                        balance,
                        created_at,
                        role,
                        status
                    FROM users
                    WHERE user_code = $1
                    `,
                    [user_code]
                );

            if (result.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found"
                });
            }

            res.json({
                success: true,
                user:
                    result.rows[0]
            });

        } catch (error) {

            console.error(
                "Get user error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to get user"
            });
        }
    }
);

// ======================================================
// DEPOSIT
// ======================================================

app.post(
    "/api/wallet/deposit",
    requireApiKey,
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
                    SET
                        balance =
                            balance + $1,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE user_code = $2
                    AND status = 'active'
                    RETURNING
                        user_id,
                        user_code,
                        balance
                    `,
                    [
                        numericAmount,
                        user_code
                    ]
                );

            if (userResult.rows.length === 0) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message:
                        "Active user not found"
                });
            }

            const user =
                userResult.rows[0];

            const newBalance =
                user.balance;

            await client.query(
                `
                INSERT INTO transactions
                (
                    user_id,
                    user_code,
                    type,
                    amount,
                    balance_after
                )
                VALUES
                (
                    $1,
                    $2,
                    'deposit',
                    $3,
                    $4
                )
                `,
                [
                    user.user_id,
                    user.user_code,
                    numericAmount,
                    newBalance
                ]
            );

            await client.query(
                "COMMIT"
            );

            io.to(
                `user:${user.user_id}`
            ).emit(
                "balance_updated",
                {
                    user_id:
                        user.user_id,
                    user_code:
                        user.user_code,
                    balance:
                        Number(newBalance)
                }
            );

            res.json({
                success: true,
                message:
                    "Deposit successful",
                balance:
                    newBalance
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
                message:
                    "Deposit failed"
            });

        } finally {

            client.release();
        }
    }
);

// ======================================================
// WITHDRAW
// ======================================================

app.post(
    "/api/wallet/withdraw",
    requireApiKey,
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
                    SET
                        balance =
                            balance - $1,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE user_code = $2
                    AND status = 'active'
                    AND balance >= $1
                    RETURNING
                        user_id,
                        user_code,
                        balance
                    `,
                    [
                        numericAmount,
                        user_code
                    ]
                );

            if (result.rows.length === 0) {

                const userCheck =
                    await client.query(
                        `
                        SELECT
                            user_id,
                            balance,
                            status
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
                        message:
                            "User not found"
                    });
                }

                return res.status(400).json({
                    success: false,
                    message:
                        "Insufficient balance or account blocked"
                });
            }

            const user =
                result.rows[0];

            const newBalance =
                user.balance;

            await client.query(
                `
                INSERT INTO transactions
                (
                    user_id,
                    user_code,
                    type,
                    amount,
                    balance_after
                )
                VALUES
                (
                    $1,
                    $2,
                    'withdraw',
                    $3,
                    $4
                )
                `,
                [
                    user.user_id,
                    user.user_code,
                    numericAmount,
                    newBalance
                ]
            );

            await client.query(
                "COMMIT"
            );

            io.to(
                `user:${user.user_id}`
            ).emit(
                "balance_updated",
                {
                    user_id:
                        user.user_id,
                    user_code:
                        user.user_code,
                    balance:
                        Number(newBalance)
                }
            );

            res.json({
                success: true,
                message:
                    "Withdrawal successful",
                balance:
                    newBalance
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
                message:
                    "Withdrawal failed"
            });

        } finally {

            client.release();
        }
    }
);

// ======================================================
// TRANSACTION HISTORY
// ======================================================

app.get(
    "/api/wallet/:user_code/transactions",
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
                        user_id,
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
// SUPPORT HISTORY
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
                        user_id,
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
// ADMIN SUPPORT USERS
// ======================================================

app.get(
    "/api/admin/support/users",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        u.user_id,
                        u.user_code,
                        u.balance,
                        u.status,
                        MAX(s.created_at)
                            AS last_message_at,
                        COUNT(s.id)::INTEGER
                            AS message_count
                    FROM users u
                    INNER JOIN support_messages s
                        ON s.user_id = u.user_id
                    GROUP BY
                        u.user_id,
                        u.user_code,
                        u.balance,
                        u.status
                    ORDER BY
                        last_message_at DESC
                    `
                );

            res.json({
                success: true,
                users:
                    result.rows
            });

        } catch (error) {

            console.error(
                "Admin support users error:",
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
// ADMIN SUPPORT HISTORY
// ======================================================

app.get(
    "/api/admin/support/:user_id/messages",
    requireAdmin,
    async (req, res) => {

        try {

            const {
                user_id
            } = req.params;

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        user_code,
                        sender_type,
                        message,
                        created_at
                    FROM support_messages
                    WHERE user_id = $1
                    ORDER BY created_at ASC
                    `,
                    [user_id]
                );

            res.json({
                success: true,
                messages:
                    result.rows
            });

        } catch (error) {

            console.error(
                "Admin support history error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to load messages"
            });
        }
    }
);

// ======================================================
// SOCKET AUTH
// ======================================================

io.use(async (socket, next) => {

    try {

        const auth =
            socket.handshake.auth || {};

        const token =
            auth.token;

        if (!token) {

            return next(
                new Error(
                    "Authentication required"
                )
            );
        }

        const decoded =
            jwt.verify(
                token,
                JWT_SECRET
            );

        if (
            !decoded ||
            !decoded.type
        ) {

            return next(
                new Error(
                    "Invalid authentication"
                )
            );
        }

        if (decoded.type === "admin") {

            const adminResult =
                await pool.query(
                    `
                    SELECT
                        admin_id,
                        email,
                        role,
                        status
                    FROM admin_users
                    WHERE admin_id = $1
                    `,
                    [decoded.admin_id]
                );

            if (
                adminResult.rows.length === 0 ||
                adminResult.rows[0].status !== "active"
            ) {

                return next(
                    new Error(
                        "Admin account is inactive"
                    )
                );
            }

            socket.user = {
                type: "admin",
                admin_id:
                    decoded.admin_id,
                email:
                    decoded.email,
                role:
                    decoded.role
            };

            return next();
        }

        if (decoded.type === "user") {

            const userResult =
                await pool.query(
                    `
                    SELECT
                        user_id,
                        user_code,
                        status
                    FROM users
                    WHERE user_id = $1
                    `,
                    [decoded.user_id]
                );

            if (
                userResult.rows.length === 0
            ) {

                return next(
                    new Error(
                        "User not found"
                    )
                );
            }

            if (
                userResult.rows[0].status !==
                "active"
            ) {

                return next(
                    new Error(
                        "User account is blocked"
                    )
                );
            }

            socket.user = {
                type: "user",
                user_id:
                    userResult.rows[0].user_id,
                user_code:
                    userResult.rows[0].user_code
            };

            return next();
        }

        next(
            new Error(
                "Unsupported socket account"
            )
        );

    } catch (error) {

        next(
            new Error(
                "Invalid or expired token"
            )
        );
    }
});

// ======================================================
// SOCKET.IO / WEBSOCKET
// ======================================================

io.on("connection", (socket) => {

    console.log(
        "Socket connected:",
        socket.id,
        socket.user.type
    );

    // --------------------------------------------------
    // USER CONNECTION
    // --------------------------------------------------

    if (socket.user.type === "user") {

        const room =
            `user:${socket.user.user_id}`;

        socket.join(room);

        const supportRoom =
            `support:${socket.user.user_id}`;

        socket.join(supportRoom);

        socket.emit(
            "connected",
            {
                success: true,
                type: "user",
                user_id:
                    socket.user.user_id,
                user_code:
                    socket.user.user_code
            }
        );

        // Send current trade settings
        pool.query(
            `
            SELECT
                duration_seconds,
                enabled
            FROM trade_settings
            WHERE id = 1
            `
        )
        .then(result => {

            socket.emit(
                "trade_settings",
                result.rows[0]
            );

        })
        .catch(console.error);
    }

    // --------------------------------------------------
    // ADMIN CONNECTION
    // --------------------------------------------------

    if (socket.user.type === "admin") {

        socket.join("admins");

        socket.emit(
            "connected",
            {
                success: true,
                type: "admin",
                admin_id:
                    socket.user.admin_id
            }
        );
    }

    // --------------------------------------------------
    // USER SEND MESSAGE
    // --------------------------------------------------

    socket.on(
        "user_message",
        async (data) => {

            try {

                if (
                    socket.user.type !== "user"
                ) {
                    return;
                }

                const message =
                    String(
                        data?.message || ""
                    ).trim();

                if (!message) {
                    return;
                }

                if (
                    message.length > 2000
                ) {

                    return socket.emit(
                        "support_error",
                        {
                            message:
                                "Message is too long"
                        }
                    );
                }

                const result =
                    await pool.query(
                        `
                        INSERT INTO support_messages
                        (
                            user_id,
                            user_code,
                            sender_type,
                            message
                        )
                        VALUES
                        ($1, $2, 'user', $3)
                        RETURNING
                            id,
                            user_id,
                            user_code,
                            sender_type,
                            message,
                            created_at
                        `,
                        [
                            socket.user.user_id,
                            socket.user.user_code,
                            message
                        ]
                    );

                const saved =
                    result.rows[0];

                // User
                io.to(
                    `support:${socket.user.user_id}`
                ).emit(
                    "support_message",
                    saved
                );

                // Admin
                io.to("admins").emit(
                    "new_support_message",
                    saved
                );

            } catch (error) {

                console.error(
                    "User chat error:",
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

    // --------------------------------------------------
    // ADMIN SEND MESSAGE
    // --------------------------------------------------

    socket.on(
        "admin_message",
        async (data) => {

            try {

                if (
                    socket.user.type !== "admin"
                ) {
                    return;
                }

                const userId =
                    String(
                        data?.user_id || ""
                    ).trim();

                const message =
                    String(
                        data?.message || ""
                    ).trim();

                if (
                    !userId ||
                    !message
                ) {
                    return;
                }

                if (
                    message.length > 2000
                ) {

                    return socket.emit(
                        "support_error",
                        {
                            message:
                                "Message is too long"
                        }
                    );
                }

                const userResult =
                    await pool.query(
                        `
                        SELECT
                            user_id,
                            user_code,
                            status
                        FROM users
                        WHERE user_id = $1
                        `,
                        [userId]
                    );

                if (
                    userResult.rows.length === 0
                ) {

                    return socket.emit(
                        "support_error",
                        {
                            message:
                                "User not found"
                        }
                    );
                }

                const user =
                    userResult.rows[0];

                const result =
                    await pool.query(
                        `
                        INSERT INTO support_messages
                        (
                            user_id,
                            user_code,
                            sender_type,
                            message
                        )
                        VALUES
                        ($1, $2, 'admin', $3)
                        RETURNING
                            id,
                            user_id,
                            user_code,
                            sender_type,
                            message,
                            created_at
                        `,
                        [
                            user.user_id,
                            user.user_code,
                            message
                        ]
                    );

                const saved =
                    result.rows[0];

                // Send to user
                io.to(
                    `support:${user.user_id}`
                ).emit(
                    "support_message",
                    saved
                );

                // Send to admin sockets
                io.to("admins").emit(
                    "support_message",
                    saved
                );

                await auditLog({
                    adminId:
                        socket.user.admin_id,
                    action:
                        "SUPPORT_MESSAGE",
                    targetType:
                        "user",
                    targetId:
                        user.user_id,
                    details: {
                        message_id:
                            saved.id
                    }
                });

            } catch (error) {

                console.error(
                    "Admin chat error:",
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

    // --------------------------------------------------
    // ADMIN REQUEST ONLINE USERS
    // --------------------------------------------------

    socket.on(
        "get_online_users",
        async () => {

            if (
                socket.user.type !== "admin"
            ) {
                return;
            }

            const onlineUsers = [];

            for (
                const [
                    socketId,
                    connectedSocket
                ]
                of io.sockets.sockets
            ) {

                if (
                    connectedSocket.user &&
                    connectedSocket.user.type ===
                        "user"
                ) {

                    onlineUsers.push({
                        socket_id:
                            socketId,
                        user_id:
                            connectedSocket.user.user_id,
                        user_code:
                            connectedSocket.user.user_code
                    });
                }
            }

            socket.emit(
                "online_users",
                onlineUsers
            );
        }
    );

    // --------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------

    socket.on(
        "disconnect",
        () => {

            console.log(
                "Socket disconnected:",
                socket.id
            );
        }
    );
});

// ======================================================
// USER TOKEN
// ======================================================
//
// IMPORTANT:
// This endpoint should normally be called from your
// authenticated user-login system.
//
// For your current demo architecture it accepts
// user_code + BECOIN_API_KEY.
// Do NOT put BECOIN_API_KEY in public production frontend.
// Replace this later with your real user authentication.
//

app.post(
    "/api/auth/user",
    requireApiKey,
    async (req, res) => {

        try {

            const {
                user_code
            } = req.body;

            const result =
                await pool.query(
                    `
                    SELECT
                        user_id,
                        user_code,
                        status
                    FROM users
                    WHERE user_code = $1
                    `,
                    [user_code]
                );

            if (result.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found"
                });
            }

            const user =
                result.rows[0];

            if (
                user.status !== "active"
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "User account is blocked"
                });
            }

            const token =
                jwt.sign(
                    {
                        type: "user",
                        user_id:
                            user.user_id,
                        user_code:
                            user.user_code
                    },
                    JWT_SECRET,
                    {
                        expiresIn: "24h"
                    }
                );

            res.json({
                success: true,
                token,
                user: {
                    user_id:
                        user.user_id,
                    user_code:
                        user.user_code
                }
            });

        } catch (error) {

            console.error(
                "User auth error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "User authentication failed"
            });
        }
    }
);

// ======================================================
// 404
// ======================================================

app.use(
    (req, res) => {

        res.status(404).json({
            success: false,
            message:
                "Route not found"
        });
    }
);

// ======================================================
// GLOBAL ERROR
// ======================================================

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

// ======================================================
// START SERVER
// ======================================================

async function startServer() {

    try {

        await createTables();

        // --------------------------------------------------
        // OPTIONAL FIRST ADMIN CREATION
        // --------------------------------------------------

        if (
            process.env.ADMIN_EMAIL &&
            process.env.ADMIN_PASSWORD_HASH
        ) {

            const existing =
                await pool.query(
                    `
                    SELECT admin_id
                    FROM admin_users
                    WHERE LOWER(email) =
                        LOWER($1)
                    `,
                    [
                        process.env.ADMIN_EMAIL
                    ]
                );

            if (
                existing.rows.length === 0
            ) {

                await pool.query(
                    `
                    INSERT INTO admin_users
                    (
                        email,
                        password_hash,
                        name,
                        role
                    )
                    VALUES
                    ($1, $2, $3, 'admin')
                    `,
                    [
                        process.env.ADMIN_EMAIL,
                        process.env.ADMIN_PASSWORD_HASH,
                        process.env.ADMIN_NAME ||
                            "BEcoin Admin"
                    ]
                );

                console.log(
                    "Initial admin account created"
                );
            }
        }

        server.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `BEcoin backend running on port ${PORT}`
                );

                console.log(
                    "Socket.IO WebSocket enabled"
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
