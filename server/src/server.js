/**
 * Plate Pilot - Server Bootstrapper
 */

require("dotenv").config();
const http = require("http");
const app = require("./app");
const { initDb } = require("./config/initDb");

const PORT = parseInt(process.env.PORT || "5000", 10);

async function startServer() {
  try {
    console.log("[Plate Pilot] Initializing database and verifying schema...");
    await initDb(false);

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log("==========================================================");
      console.log(`  🚀 Plate Pilot Backend Server Running on Port ${PORT}`);
      console.log(`  📡 API Base URL:  http://localhost:${PORT}/api`);
      console.log(`  🏥 Health Check:  http://localhost:${PORT}/api/health`);
      console.log(`  💾 Database Type: ${(process.env.DB_TYPE || "sqlite").toUpperCase()}`);
      console.log("==========================================================");
    });

    const shutdown = () => {
      console.log("\n[Plate Pilot] Shutting down gracefully...");
      server.close(() => {
        console.log("[Plate Pilot] HTTP server closed.");
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    console.error("[Plate Pilot] Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
