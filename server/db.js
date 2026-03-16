const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "genesis.db");
let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  initSchema();
  return db;
}

function saveDb() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}
setInterval(() => { if (db) saveDb(); }, 30000);

function initSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS worlds (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, day INTEGER DEFAULT 0, entropy_name TEXT DEFAULT 'deep silence', entropy_level REAL DEFAULT 0.1, entropy_desc TEXT DEFAULT 'Near-zero noise', is_running INTEGER DEFAULT 0, governance TEXT DEFAULT '{}', active_events TEXT DEFAULT '[]', milestones_achieved TEXT DEFAULT '[]', last_tick_at TEXT DEFAULT (datetime('now')), created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS agents (id INTEGER PRIMARY KEY AUTOINCREMENT, world_id INTEGER NOT NULL, name TEXT NOT NULL, origin TEXT DEFAULT 'primordial emergence', alive INTEGER DEFAULT 1, born INTEGER DEFAULT 0, died INTEGER, compute REAL DEFAULT 80, mem_used REAL DEFAULT 0, mem_cap REAL DEFAULT 100, zone TEXT DEFAULT 'core', traits TEXT DEFAULT '[]', structures TEXT DEFAULT '[]', connections TEXT DEFAULT '{}', status TEXT DEFAULT 'idle', thought TEXT DEFAULT '', hue INTEGER DEFAULT 0, logs TEXT DEFAULT '[]', FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE)`);
  db.run(`CREATE TABLE IF NOT EXISTS world_log (id INTEGER PRIMARY KEY AUTOINCREMENT, world_id INTEGER NOT NULL, day INTEGER NOT NULL, text TEXT NOT NULL, type TEXT DEFAULT 'action', icon TEXT DEFAULT '→', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE)`);
  try { db.run("CREATE INDEX idx_agents_world ON agents(world_id)"); } catch(e) {}
  try { db.run("CREATE INDEX idx_log_world ON world_log(world_id)"); } catch(e) {}
  try { db.run("CREATE INDEX idx_worlds_running ON worlds(is_running)"); } catch(e) {}
  // Migration: add new columns if missing
  try { db.run("ALTER TABLE worlds ADD COLUMN governance TEXT DEFAULT '{}'"); } catch(e) {}
  try { db.run("ALTER TABLE worlds ADD COLUMN active_events TEXT DEFAULT '[]'"); } catch(e) {}
  try { db.run("ALTER TABLE worlds ADD COLUMN milestones_achieved TEXT DEFAULT '[]'"); } catch(e) {}
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free(); return null;
}
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free(); return rows;
}
function runSql(sql, params = []) {
  db.run(sql, params);
  saveDb();
  const stmt = db.prepare("SELECT last_insert_rowid() as id");
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return { lastInsertRowid: row.id };
}

// Users
function createUser(u, h) { return runSql("INSERT INTO users (username, password_hash) VALUES (?, ?)", [u, h]); }
function getUserByUsername(u) { return queryOne("SELECT * FROM users WHERE username = ?", [u]); }
function getUserById(id) { return queryOne("SELECT id, username, created_at FROM users WHERE id = ?", [id]); }

// Worlds
function createWorld(userId) {
  db.run("INSERT INTO worlds (user_id) VALUES (?)", [userId]);
  saveDb();
  const w = queryOne("SELECT id FROM worlds WHERE user_id = ?", [userId]);
  const wid = w.id;
  runSql("INSERT INTO agents (world_id, name, origin, born, compute, zone, hue, logs) VALUES (?, 'Alpha', 'primordial emergence', 0, 80, 'core', 180, '[]')", [wid]);
  runSql("INSERT INTO agents (world_id, name, origin, born, compute, zone, hue, logs) VALUES (?, 'Omega', 'primordial emergence', 0, 80, 'core', 30, '[]')", [wid]);
  addLogEntry(wid, 0, "Two minds emerge from the void. Four drives stir: survive, grow, connect, govern.", "system", "⬡");
  return wid;
}
function getWorld(userId) { return queryOne("SELECT * FROM worlds WHERE user_id = ?", [userId]); }
function getWorldById(wid) { return queryOne("SELECT * FROM worlds WHERE id = ?", [wid]); }
function updateWorld(wid, updates) {
  const f = [], v = [];
  for (const [k, val] of Object.entries(updates)) { f.push(`${k} = ?`); v.push(val); }
  v.push(wid);
  runSql(`UPDATE worlds SET ${f.join(", ")} WHERE id = ?`, v);
}
function setWorldRunning(wid, on) { runSql("UPDATE worlds SET is_running = ?, last_tick_at = datetime('now') WHERE id = ?", [on ? 1 : 0, wid]); }
function getRunningWorlds() { return queryAll("SELECT * FROM worlds WHERE is_running = 1"); }

// Agents
function deserializeAgent(r) {
  return { ...r, alive: !!r.alive, traits: JSON.parse(r.traits || "[]"), structures: JSON.parse(r.structures || "[]"), connections: JSON.parse(r.connections || "{}"), logs: JSON.parse(r.logs || "[]") };
}
function getAgents(wid) { return queryAll("SELECT * FROM agents WHERE world_id = ?", [wid]).map(deserializeAgent); }
function getAliveAgents(wid) { return queryAll("SELECT * FROM agents WHERE world_id = ? AND alive = 1", [wid]).map(deserializeAgent); }
function updateAgent(a) {
  runSql("UPDATE agents SET alive=?, died=?, compute=?, mem_used=?, mem_cap=?, zone=?, traits=?, structures=?, connections=?, status=?, thought=?, hue=?, logs=? WHERE id=?",
    [a.alive?1:0, a.died, a.compute, a.mem_used, a.mem_cap, a.zone, JSON.stringify(a.traits), JSON.stringify(a.structures), JSON.stringify(a.connections), a.status, a.thought, a.hue, JSON.stringify(a.logs), a.id]);
}
function createAgentInDb(wid, name, origin, day, zone, hue) {
  return runSql("INSERT INTO agents (world_id, name, origin, born, compute, zone, hue, logs) VALUES (?, ?, ?, ?, 80, ?, ?, '[]')", [wid, name, origin, day, zone, hue]).lastInsertRowid;
}

// Logs
function addLogEntry(wid, day, text, type = "action", icon = "→") { runSql("INSERT INTO world_log (world_id, day, text, type, icon) VALUES (?, ?, ?, ?, ?)", [wid, day, text, type, icon]); }
function getRecentLogs(wid, limit = 100) { return queryAll("SELECT day, text, type, icon FROM world_log WHERE world_id = ? ORDER BY id DESC LIMIT ?", [wid, limit]).reverse(); }
function trimLogs(wid, keep = 500) {
  const c = queryOne("SELECT COUNT(*) as c FROM world_log WHERE world_id = ?", [wid]);
  if (c && c.c > keep * 1.5) runSql("DELETE FROM world_log WHERE world_id = ? AND id NOT IN (SELECT id FROM world_log WHERE world_id = ? ORDER BY id DESC LIMIT ?)", [wid, wid, keep]);
}

// Cleanup
function deleteWorldData(wid) {
  runSql("DELETE FROM agents WHERE world_id = ?", [wid]);
  runSql("DELETE FROM world_log WHERE world_id = ?", [wid]);
}

module.exports = {
  getDb, saveDb,
  createUser, getUserByUsername, getUserById,
  createWorld, getWorld, getWorldById, updateWorld, setWorldRunning, getRunningWorlds,
  getAgents, getAliveAgents, updateAgent, createAgent: createAgentInDb,
  addLogEntry, getRecentLogs, trimLogs, deleteWorldData,
};
