require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "x-admin-key"] }));
app.use(express.json());

// Health check (no auth)
app.get("/api/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

async function start() {
  // Initialize database first
  await db.getDb();
  console.log("[DB] Initialized");

  // Load routes after DB is ready
  const routes = require("./routes");
  app.use("/api", routes);

  // Serve static frontend (production)
  const clientDist = path.join(__dirname, "../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      const index = path.join(clientDist, "index.html");
      const fs = require("fs");
      if (fs.existsSync(index)) res.sendFile(index);
      else res.status(404).json({ error: "Frontend not built. Serve client separately or run: cd client && npm run build" });
    }
  });

  app.listen(PORT, () => {
    console.log(`
  ⬡ GENESIS SERVER
  ─────────────────────
  Port:       ${PORT}
  Think days: every ${process.env.THINK_INTERVAL_DAYS || 3} days
  Tick rate:  ${process.env.BACKGROUND_TICK_MS || 60000}ms
  ─────────────────────
  Ready.
    `);

    // Start background worker
    const { startBackgroundWorker } = require("./simulation");
    startBackgroundWorker();
  });
}

start().catch(err => {
  console.error("Failed to start:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...");
  db.saveDb();
  const { stopBackgroundWorker } = require("./simulation");
  stopBackgroundWorker();
  process.exit(0);
});
