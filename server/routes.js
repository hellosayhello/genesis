const express = require("express");
const db = require("./db");
const { simulateDay, ZONES, GOVERNANCE_MILESTONES } = require("./simulation");

const router = express.Router();
const ADMIN_KEY = process.env.ADMIN_KEY || "genesis-admin";
const WORLD_ID = 1;

function requireAdmin(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) return res.status(403).json({ error: "Not authorized" });
  next();
}

function ensureWorldExists() {
  const world = db.getWorldById(WORLD_ID);
  if (!world) {
    try { db.createUser("__system__", "no-login"); } catch(e) {}
    const user = db.getUserByUsername("__system__");
    if (user && !db.getWorld(user.id)) db.createWorld(user.id);
  }
}

// PUBLIC
router.get("/world", (req, res) => {
  try {
    ensureWorldExists();
    const world = db.getWorldById(WORLD_ID);
    if (!world) return res.status(404).json({ error: "World not initialized" });

    const agents = db.getAgents(world.id);
    const log = db.getRecentLogs(world.id, 150);
    const governance = JSON.parse(world.governance || "{}");
    const active_events = JSON.parse(world.active_events || "[]");
    const milestones_achieved = JSON.parse(world.milestones_achieved || "[]");

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
      log, zones: ZONES, governance, active_events, milestones_achieved,
      all_milestones: GOVERNANCE_MILESTONES.map(m => ({ id: m.id, name: m.name, desc: m.desc })),
    });
  } catch (err) {
    console.error("Get world error:", err);
    res.status(500).json({ error: "Failed to load world" });
  }
});

// ADMIN
router.post("/admin/verify", requireAdmin, (req, res) => res.json({ ok: true }));

router.post("/admin/tick", requireAdmin, async (req, res) => {
  try { ensureWorldExists(); const d = await simulateDay(WORLD_ID); res.json({ day: d, success: true }); }
  catch (err) { console.error("Tick error:", err); res.status(500).json({ error: "Simulation step failed" }); }
});

router.post("/admin/toggle-run", requireAdmin, (req, res) => {
  try { ensureWorldExists(); const w = db.getWorldById(WORLD_ID); const ns = !w.is_running; db.setWorldRunning(w.id, ns); res.json({ isRunning: ns }); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/admin/reset", requireAdmin, (req, res) => {
  try {
    ensureWorldExists();
    db.setWorldRunning(WORLD_ID, false);
    db.deleteWorldData(WORLD_ID);
    db.updateWorld(WORLD_ID, {
      day: 0, entropy_name: "deep silence", entropy_level: 0.1, entropy_desc: "Near-zero noise",
      governance: "{}", active_events: "[]", milestones_achieved: "[]",
    });
    db.createAgent(WORLD_ID, "Alpha", "primordial emergence", 0, "core", 180);
    db.createAgent(WORLD_ID, "Omega", "primordial emergence", 0, "core", 30);
    db.addLogEntry(WORLD_ID, 0, "World reset. Two minds emerge. Four drives: survive, grow, connect, govern.", "system", "⬡");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to reset" }); }
});

module.exports = router;
