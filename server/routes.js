const express = require("express");
const db = require("./db");
const { simulateDay, ZONES } = require("./simulation");

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "genesis-admin";
const WORLD_ID = 1; // single global world

// Simple admin check via header
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Not authorized" });
  }
  next();
}

// ═══════════════════════════════════════
// SETUP — auto-create the global world on first run
// ═══════════════════════════════════════

function ensureWorldExists() {
  const world = db.getWorldById(WORLD_ID);
  if (!world) {
    // Create a dummy user for the global world
    try { db.createUser("__system__", "no-login"); } catch(e) {}
    const user = db.getUserByUsername("__system__");
    if (user) {
      const existing = db.getWorld(user.id);
      if (!existing) db.createWorld(user.id);
    }
  }
}

// ═══════════════════════════════════════
// PUBLIC ROUTES (anyone can read)
// ═══════════════════════════════════════

// Get full world state — no auth needed
router.get("/world", (req, res) => {
  try {
    ensureWorldExists();
    const world = db.getWorldById(WORLD_ID);
    if (!world) return res.status(404).json({ error: "World not initialized" });

    const agents = db.getAgents(world.id);
    const log = db.getRecentLogs(world.id, 150);

    res.json({
      day: world.day,
      entropy: { name: world.entropy_name, level: world.entropy_level, desc: world.entropy_desc },
      isRunning: !!world.is_running,
      agents: agents.map(a => ({
        id: a.id, name: a.name, origin: a.origin, alive: a.alive,
        born: a.born, died: a.died, compute: a.compute,
        mem_used: a.mem_used, mem_cap: a.mem_cap, zone: a.zone,
        traits: a.traits, structures: a.structures, connections: a.connections,
        status: a.status, thought: a.thought, hue: a.hue, logs: a.logs,
      })),
      log,
      zones: ZONES,
    });
  } catch (err) {
    console.error("Get world error:", err);
    res.status(500).json({ error: "Failed to load world" });
  }
});

// ═══════════════════════════════════════
// ADMIN ROUTES (requires x-admin-key header)
// ═══════════════════════════════════════

// Verify admin key
router.post("/admin/verify", requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// Advance one day
router.post("/admin/tick", requireAdmin, async (req, res) => {
  try {
    ensureWorldExists();
    const newDay = await simulateDay(WORLD_ID);
    res.json({ day: newDay, success: true });
  } catch (err) {
    console.error("Tick error:", err);
    res.status(500).json({ error: "Simulation step failed" });
  }
});

// Toggle auto-run
router.post("/admin/toggle-run", requireAdmin, (req, res) => {
  try {
    ensureWorldExists();
    const world = db.getWorldById(WORLD_ID);
    const newState = !world.is_running;
    db.setWorldRunning(world.id, newState);
    res.json({ isRunning: newState });
  } catch (err) {
    console.error("Toggle run error:", err);
    res.status(500).json({ error: "Failed to toggle simulation" });
  }
});

// Reset world
router.post("/admin/reset", requireAdmin, (req, res) => {
  try {
    ensureWorldExists();
    db.setWorldRunning(WORLD_ID, false);
    db.deleteWorldData(WORLD_ID);
    db.updateWorld(WORLD_ID, {
      day: 0,
      entropy_name: "deep silence",
      entropy_level: 0.1,
      entropy_desc: "Near-zero noise",
    });
    db.createAgent(WORLD_ID, "Alpha", "primordial emergence", 0, "core", 180);
    db.createAgent(WORLD_ID, "Omega", "primordial emergence", 0, "core", 30);
    db.addLogEntry(WORLD_ID, 0, "World reset. Two minds emerge from the void. They feel three pulls: survive, grow, connect.", "system", "⬡");
    res.json({ success: true });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: "Failed to reset world" });
  }
});

module.exports = router;
