const express = require("express");
const cors = require("cors");
require("dotenv").config();

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

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        service: "BEcoin API",
        database: "PostgreSQL"
    });
});


/* =========================
   TEST API
========================= */

app.get("/api/test", (req, res) => {
    res.json({
        success: true,
        message: "BEcoin API is working"
    });
});


/* =========================
   404
========================= */

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found"
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