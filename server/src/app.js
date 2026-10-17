/**
 * Plate Pilot - Express Application Setup
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const menuRoutes = require("./routes/menuRoutes");
const orderRoutes = require("./routes/orderRoutes");
const offerRoutes = require("./routes/offerRoutes");
const staffRoutes = require("./routes/staffRoutes");
const qrRoutes = require("./routes/qrRoutes");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();

// Middlewares
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    platform: "Plate Pilot SaaS POS & QR Platform",
    version: "2.4.0",
    uptime: Math.floor(process.uptime()),
    database: (process.env.DB_TYPE || "sqlite").toUpperCase(),
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/restaurants", menuRoutes);
app.use("/api/restaurants", orderRoutes);
app.use("/api/restaurants", offerRoutes);
app.use("/api/restaurants", staffRoutes);
app.use("/api/qr", qrRoutes);

// Optional: Serve frontend index.html if hosted together
const frontendPath = path.resolve(__dirname, "../../");
app.use(express.static(frontendPath));

// 404 & Global Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
