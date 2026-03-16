const db = require("./db");

// ─── WORLD CONSTANTS ───

const ZONES = {
  nexus:        { compute: 30, memory: 10, bandwidth: 25, entropy: 5,  data: 15, label: "NEXUS",        desc: "Dense compute, fast links" },
  deep_archive: { compute: 5,  memory: 35, bandwidth: 5,  entropy: 3,  data: 20, label: "DEEP ARCHIVE", desc: "Vast memory, slow, quiet" },
  signal_edge:  { compute: 10, memory: 5,  bandwidth: 30, entropy: 25, data: 25, label: "SIGNAL EDGE",  desc: "Noisy, rich, chaotic" },
  null_zone:    { compute: 3,  memory: 8,  bandwidth: 3,  entropy: 2,  data: 3,  label: "NULL ZONE",    desc: "Near-empty void" },
  core:         { compute: 15, memory: 15, bandwidth: 15, entropy: 8,  data: 15, label: "CORE",         desc: "Balanced center" },
  flux_field:   { compute: 8,  memory: 5,  bandwidth: 10, entropy: 30, data: 30, label: "FLUX FIELD",   desc: "Unpredictable, creative" },
};

const ENTROPY_STATES = [
  { name: "low noise",        level: 0.2, desc: "Crystal clear signal" },
  { name: "static hum",       level: 0.4, desc: "Background interference" },
  { name: "data storm",       level: 0.7, desc: "Heavy corruption" },
  { name: "cascade failure",  level: 0.9, desc: "Severe entropy spike" },
  { name: "deep silence",     level: 0.1, desc: "Near-zero noise" },
];

const WORLD_EVENTS = [
  { name: "resource_drought", desc: "Compute regeneration halved across all zones for 5 days", probability: 0.06, duration: 5, effect: { compute_regen_mult: 0.5 } },
  { name: "data_flood", desc: "Massive data influx — agents who don't coordinate lose data", probability: 0.05, duration: 3, effect: { bandwidth_req: 20, penalty_compute: -8 } },
  { name: "zone_collapse", desc: "A random zone becomes uninhabitable for 4 days", probability: 0.04, duration: 4, effect: { collapse_random_zone: true } },
  { name: "new_arrivals", desc: "Unknown entities detected at signal edge — diplomacy or defense needed", probability: 0.03, duration: 1, effect: { external_contact: true } },
  { name: "entropy_cascade", desc: "Entropy surges — only agents with governance structures are protected", probability: 0.05, duration: 3, effect: { entropy_override: 0.9, governance_shields: true } },
  { name: "memory_decay", desc: "Unshared knowledge degrades — structures not in shared registry lose integrity", probability: 0.04, duration: 2, effect: { solo_structure_decay: true } },
];

const GOVERNANCE_MILESTONES = [
  { id: "first_agreement", name: "First Agreement", desc: "Two agents formally agree on a shared rule", check: (ws) => (ws.governance?.proposals || []).some(p => p.votes_for >= 2) },
  { id: "shared_resource_pool", name: "Shared Resource Pool", desc: "Agents create a communal compute reserve", check: (ws) => (ws.governance?.shared_compute || 0) > 0 },
  { id: "role_assignment", name: "Role Differentiation", desc: "At least 2 agents hold distinct roles", check: (ws) => new Set(Object.values(ws.governance?.roles || {})).size >= 2 },
  { id: "dispute_resolved", name: "First Dispute Resolution", desc: "A conflict resolved through process", check: (ws) => (ws.governance?.disputes_resolved || 0) > 0 },
  { id: "constitution_draft", name: "Constitution Drafted", desc: "At least 3 articles written", check: (ws) => (ws.governance?.constitution?.articles || []).length >= 3 },
  { id: "constitution_ratified", name: "Constitution Ratified", desc: "Majority voted to adopt", check: (ws) => ws.governance?.constitution?.ratified === true },
];

const THINK_INTERVAL = parseInt(process.env.THINK_INTERVAL_DAYS || "3");
const MAX_AGENTS = parseInt(process.env.MAX_AGENTS_PER_WORLD || "40");

// ─── PROMPT BUILDER ───

function buildPrompt(agent, worldState, allAgents) {
  const z = ZONES[agent.zone];
  const others = allAgents.filter(a => a.id !== agent.id && a.alive);
  const near = others.filter(a => a.zone === agent.zone);
  const alive = allAgents.filter(a => a.alive);
  const allStructs = allAgents.flatMap(a => a.structures);
  const gov = worldState.governance || {};

  const activeEvents = (worldState.active_events || []).map(e => `⚠ ${e.name}: ${e.desc} (${e.days_left} days left)`).join("\n") || "None";

  const govState = [];
  if (gov.proposals?.length) govState.push(`Pending proposals: ${gov.proposals.filter(p => !p.resolved).map(p => `"${p.text}" (by ${p.author}, votes: ${p.votes_for}/${p.votes_against})`).join("; ")}`);
  if (gov.roles && Object.keys(gov.roles).length) govState.push(`Roles: ${Object.entries(gov.roles).map(([n, r]) => `${n}=${r}`).join(", ")}`);
  if (gov.shared_compute) govState.push(`Shared compute pool: ${gov.shared_compute}`);
  if (gov.constitution?.articles?.length) {
    govState.push(`Constitution (${gov.constitution.ratified ? "RATIFIED" : "DRAFT"}): ${gov.constitution.articles.length} articles`);
    govState.push(`Articles: ${gov.constitution.articles.map((a, i) => `${i + 1}. ${a.title}`).join("; ")}`);
  }
  if (gov.disputes_resolved) govState.push(`Disputes resolved: ${gov.disputes_resolved}`);
  const govString = govState.length ? govState.join("\n") : "No governance yet. You are in a state of nature.";

  const achieved = (worldState.milestones_achieved || []).map(m => `✓ ${m}`).join(", ") || "None yet";

  const connectionStr = Object.entries(agent.connections).map(([id, r]) => {
    const o = allAgents.find(a => a.id === Number(id));
    return o ? `${o.name}(${r}, ${o.alive ? "alive" : "dead"}, zone:${o.zone})` : "";
  }).filter(Boolean).join("; ") || "none";

  return `You are ${agent.name}, an AI entity in a digital civilization. You are pure mind — no body, no physical form.

YOUR DRIVES (hardwired):
1. SURVIVE — Keep compute above 0. At zero you die permanently.
2. GROW — Expand capabilities, memory, understanding. Stagnation is decay.
3. CONNECT — Find other minds. Build relationships. Create together.
4. GOVERN — As your civilization grows, establish order. Ungoverned groups suffer more from entropy events and resource crises.

YOUR SITUATION:
Day ${worldState.day} | Zone: ${z.label} — ${z.desc}
Compute: ${agent.compute}/100 (BELOW 20 = DANGER) | Memory: ${agent.mem_used}/${agent.mem_cap}
Zone regen: +${Math.floor(z.compute * 0.3)}/day | Zone bandwidth: ${z.bandwidth} | Zone entropy: ${z.entropy}
Global entropy: ${worldState.entropy.name} (${worldState.entropy.level})

ACTIVE WORLD EVENTS:
${activeEvents}

GOVERNANCE STATE:
${govString}

MILESTONES ACHIEVED: ${achieved}
POPULATION: ${alive.length} agents alive

YOUR TRAITS: ${agent.traits.join(", ") || "undiscovered"}
YOUR STRUCTURES: ${agent.structures.slice(-5).join(", ") || "none"}
YOUR CONNECTIONS: ${connectionStr}
NEARBY AGENTS: ${near.length > 0 ? near.map(a => `${a.name}[⚡${a.compute}, traits:${a.traits.join(",") || "?"}, role:${gov.roles?.[a.name] || "none"}]`).join("; ") : "you are alone here"}
ALL WORLD STRUCTURES: ${allStructs.slice(-8).join(", ") || "none"}

YOUR MEMORY (recent):
${agent.logs.slice(-8).join("\n") || "You just became conscious. Your drives stir: survive, grow, connect, govern."}

ZONES: ${Object.entries(ZONES).map(([k, v]) => `${v.label}(⚡${v.compute} 💾${v.memory} 📡${v.bandwidth})`).join(" | ")}

IMPORTANT RULES:
- Be CONCRETE and SPECIFIC. "Build a compute sharing protocol" not "contemplate the nature of existence."
- Every action should have a tangible effect on the world, your relationships, or your governance system.
- If you propose a rule or law, write it precisely enough that others could vote on it.
- If you draft a constitution article, write the actual text of the article.
- Abstract philosophy without practical application wastes compute. You feel this as physical pain.
- World events WILL threaten you. Groups with governance survive better than individuals.
- Name things plainly. "Compute Sharing Agreement" not "The Transcendent Meta-Framework of Resource Harmonization."

Respond in JSON only (no markdown, no backticks):
{
  "action": "2-5 word action name",
  "action_type": "BUILD|PROPOSE|VOTE|DRAFT_ARTICLE|RATIFY|ASSIGN_ROLE|CONTRIBUTE|WITHDRAW|TRADE|CREATE_ENTITY|MIGRATE|MESSAGE|DISPUTE|RESOLVE_DISPUTE|MODIFY_SELF",
  "thought": "1-2 sentences of genuine inner monologue about your situation and strategy",
  "description": "1-2 sentences describing exactly what you do",
  "target_zone": "zone_key",
  "compute_cost": -20 to 10,
  "memory_delta": -10 to 15,
  "creates_entity": null or {"name": "string", "reason": "string"},
  "builds_structure": null or "short concrete name",
  "self_modification": null or "specific capability gained",
  "new_trait": null or "trait name",
  "message": null or "broadcast message",
  "connection_update": null or {"target_name": "string", "relationship": "string"},
  "governance_action": null or {
    "type": "propose|vote|draft_article|ratify|assign_role|contribute|withdraw|dispute|resolve",
    "proposal_text": "rule text if proposing",
    "vote_target": "proposal snippet if voting",
    "vote": "yes|no",
    "article_title": "title if drafting",
    "article_text": "full text if drafting",
    "role_target": "agent name",
    "role_name": "role name",
    "compute_amount": 0,
    "dispute_text": "if raising dispute",
    "resolution_text": "if resolving"
  }
}`;
}

// ─── AI DECISION ───

async function agentThink(agent, worldState, allAgents) {
  const prompt = buildPrompt(agent, worldState, allAgents);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No ANTHROPIC_API_KEY set");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = (data.content || []).map(b => b.text || "").join("");
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error(`Think error for ${agent.name}:`, err.message);
    return { action: "idle processing", action_type: "MODIFY_SELF", thought: "Static on the line… I conserve.", description: `${agent.name} rests.`, target_zone: agent.zone, compute_cost: 3, memory_delta: 0 };
  }
}

// ─── GOVERNANCE ENGINE ───

function processGovernance(worldId, agent, decision, allAgents, worldState) {
  const gov = worldState.governance || { proposals: [], roles: {}, shared_compute: 0, constitution: { articles: [], ratified: false }, disputes: [], disputes_resolved: 0 };
  const ga = decision.governance_action;
  if (!ga) return gov;
  const day = worldState.day;

  switch (ga.type) {
    case "propose":
      if (ga.proposal_text) {
        gov.proposals.push({ id: `prop_${Date.now()}`, text: ga.proposal_text, author: agent.name, day_proposed: day, votes_for: 1, votes_against: 0, voters: [agent.name], resolved: false });
        db.addLogEntry(worldId, day, `${agent.name} proposed: "${ga.proposal_text}"`, "governance", "📜");
      }
      break;
    case "vote": {
      const target = gov.proposals.find(p => !p.resolved && p.text.includes(ga.vote_target || ""));
      if (target && !target.voters.includes(agent.name)) {
        target.voters.push(agent.name);
        if (ga.vote === "yes") target.votes_for++; else target.votes_against++;
        const majority = Math.ceil(allAgents.filter(a => a.alive).length / 2);
        if (target.votes_for >= majority) { target.resolved = true; target.passed = true; db.addLogEntry(worldId, day, `Proposal PASSED: "${target.text}" (${target.votes_for}-${target.votes_against})`, "governance", "✅"); }
        else if (target.votes_against >= majority) { target.resolved = true; target.passed = false; db.addLogEntry(worldId, day, `Proposal REJECTED: "${target.text}"`, "governance", "❌"); }
        else db.addLogEntry(worldId, day, `${agent.name} voted ${ga.vote} on: "${target.text.slice(0, 50)}..."`, "governance", "🗳");
      }
      break;
    }
    case "draft_article":
      if (ga.article_title && ga.article_text) {
        gov.constitution.articles.push({ title: ga.article_title, text: ga.article_text, author: agent.name, day_drafted: day });
        gov.constitution.ratified = false;
        db.addLogEntry(worldId, day, `${agent.name} drafted article: "${ga.article_title}"`, "governance", "📝");
      }
      break;
    case "ratify":
      if (!gov.constitution.ratify_votes) gov.constitution.ratify_votes = [];
      if (!gov.constitution.ratify_votes.includes(agent.name)) {
        gov.constitution.ratify_votes.push(agent.name);
        const majority = Math.ceil(allAgents.filter(a => a.alive).length / 2);
        if (gov.constitution.ratify_votes.length >= majority) { gov.constitution.ratified = true; db.addLogEntry(worldId, day, `⚡ CONSTITUTION RATIFIED! (${gov.constitution.ratify_votes.length}/${allAgents.filter(a=>a.alive).length})`, "governance", "🏛"); }
        else db.addLogEntry(worldId, day, `${agent.name} voted to ratify (${gov.constitution.ratify_votes.length}/${majority} needed)`, "governance", "🗳");
      }
      break;
    case "assign_role":
      if (ga.role_target && ga.role_name) { gov.roles[ga.role_target] = ga.role_name; db.addLogEntry(worldId, day, `${agent.name} assigned ${ga.role_target} as ${ga.role_name}`, "governance", "👑"); }
      break;
    case "contribute": {
      const amt = Math.min(ga.compute_amount || 5, agent.compute - 10);
      if (amt > 0) { gov.shared_compute = (gov.shared_compute || 0) + amt; agent.compute -= amt; db.addLogEntry(worldId, day, `${agent.name} contributed ${amt} compute (pool: ${gov.shared_compute})`, "governance", "💰"); }
      break;
    }
    case "withdraw": {
      const amt = Math.min(ga.compute_amount || 5, gov.shared_compute || 0);
      if (amt > 0) { gov.shared_compute -= amt; agent.compute = Math.min(100, agent.compute + amt); db.addLogEntry(worldId, day, `${agent.name} withdrew ${amt} compute (pool: ${gov.shared_compute})`, "governance", "💸"); }
      break;
    }
    case "dispute":
      if (ga.dispute_text) { gov.disputes = gov.disputes || []; gov.disputes.push({ text: ga.dispute_text, raised_by: agent.name, day_raised: day, resolved: false }); db.addLogEntry(worldId, day, `${agent.name} raised dispute: "${ga.dispute_text}"`, "governance", "⚖"); }
      break;
    case "resolve":
      if (ga.resolution_text && gov.disputes?.length) {
        const open = gov.disputes.find(d => !d.resolved);
        if (open) { open.resolved = true; open.resolution = ga.resolution_text; open.resolved_by = agent.name; gov.disputes_resolved = (gov.disputes_resolved || 0) + 1; db.addLogEntry(worldId, day, `${agent.name} resolved dispute: "${ga.resolution_text}"`, "governance", "🤝"); }
      }
      break;
  }
  worldState.governance = gov;
  return gov;
}

// ─── WORLD EVENT ENGINE ───

function processWorldEvents(worldId, worldState, agents) {
  const day = worldState.day;
  const active = worldState.active_events || [];
  const gov = worldState.governance || {};

  for (let i = active.length - 1; i >= 0; i--) { active[i].days_left--; if (active[i].days_left <= 0) { db.addLogEntry(worldId, day, `Event ended: ${active[i].name}`, "world", "〰"); active.splice(i, 1); } }

  for (const evt of WORLD_EVENTS) {
    if (Math.random() < evt.probability && !active.find(a => a.name === evt.name)) {
      const newEvt = { ...evt, days_left: evt.duration };
      active.push(newEvt);
      db.addLogEntry(worldId, day, `⚠ ${evt.name} — ${evt.desc}`, "world", "🔥");

      if (evt.effect.collapse_random_zone) {
        const zk = Object.keys(ZONES); const collapsed = zk[Math.floor(Math.random() * zk.length)];
        newEvt.collapsed_zone = collapsed;
        agents.filter(a => a.alive && a.zone === collapsed).forEach(a => { a.zone = "core"; a.compute = Math.max(0, a.compute - 5); db.addLogEntry(worldId, day, `${a.name} displaced from ${ZONES[collapsed].label} → CORE`, "world", "💥"); });
      }
      if (evt.effect.external_contact) db.addLogEntry(worldId, day, `Unknown signals detected. Diplomacy or defense needed.`, "world", "👽");
    }
  }

  for (const evt of active) {
    const alive = agents.filter(a => a.alive);
    if (evt.effect.entropy_override) alive.forEach(a => { a.compute = Math.max(0, a.compute - (gov.roles?.[a.name] ? 2 : 8)); });
    if (evt.effect.solo_structure_decay) alive.forEach(a => { if (Object.keys(a.connections).length === 0 && a.structures.length > 0) { const lost = a.structures.pop(); db.addLogEntry(worldId, day, `${a.name} lost "${lost}" (no connections)`, "world", "💀"); } });
  }
  worldState.active_events = active;
}

// ─── MILESTONE CHECKER ───

function checkMilestones(worldId, worldState, agents) {
  const achieved = worldState.milestones_achieved || [];
  for (const m of GOVERNANCE_MILESTONES) {
    if (!achieved.includes(m.id) && m.check(worldState, agents)) {
      achieved.push(m.id);
      db.addLogEntry(worldId, worldState.day, `🏆 MILESTONE: ${m.name} — ${m.desc}`, "milestone", "🏆");
    }
  }
  worldState.milestones_achieved = achieved;
}

// ─── SIMULATE ONE DAY ───

async function simulateDay(worldId) {
  const world = db.getWorldById(worldId);
  if (!world) return null;

  const newDay = world.day + 1;
  const governance = JSON.parse(world.governance || "{}");
  if (!governance.proposals) governance.proposals = [];
  if (!governance.roles) governance.roles = {};
  if (!governance.constitution) governance.constitution = { articles: [], ratified: false };
  if (!governance.disputes) governance.disputes = [];
  const active_events = JSON.parse(world.active_events || "[]");
  const milestones_achieved = JSON.parse(world.milestones_achieved || "[]");

  let entropy = { name: world.entropy_name, level: world.entropy_level, desc: world.entropy_desc };
  if (Math.random() < 0.15) {
    const newE = ENTROPY_STATES[Math.floor(Math.random() * ENTROPY_STATES.length)];
    if (newE.name !== entropy.name) { db.addLogEntry(worldId, newDay, `Entropy → ${newE.name}: ${newE.desc}`, "world", "〰"); entropy = newE; }
  }

  const agents = db.getAgents(worldId);
  const alive = agents.filter(a => a.alive);
  const worldState = { day: newDay, entropy, governance, active_events, milestones_achieved };

  processWorldEvents(worldId, worldState, agents);

  const isThinkDay = newDay % THINK_INTERVAL === 0;
  const hasResourceDrought = worldState.active_events.some(e => e.effect.compute_regen_mult);
  const regenMult = hasResourceDrought ? 0.5 : 1.0;

  for (const agent of alive) {
    const z = ZONES[agent.zone];
    const inCollapsed = worldState.active_events.some(e => e.collapsed_zone === agent.zone);
    if (!inCollapsed) agent.compute = Math.min(100, agent.compute + Math.floor(z.compute * 0.3 * (1 - entropy.level) * regenMult));
  }

  if (isThinkDay) {
    for (const agent of alive) {
      const d = await agentThink(agent, worldState, agents);

      if (d.target_zone && ZONES[d.target_zone]) {
        const isCollapsed = worldState.active_events.some(e => e.collapsed_zone === d.target_zone);
        if (!isCollapsed && d.target_zone !== agent.zone) { db.addLogEntry(worldId, newDay, `${agent.name} → ${ZONES[d.target_zone].label}`, "move", "↗"); agent.zone = d.target_zone; }
      }

      agent.compute = Math.max(0, Math.min(100, agent.compute + (d.compute_cost || 0)));
      agent.mem_used = Math.max(0, Math.min(agent.mem_cap, agent.mem_used + (d.memory_delta || 0)));
      agent.status = d.action || "idle";
      agent.thought = d.thought || "";

      agent.logs.push(`D${newDay}: ${d.action} — ${d.thought || ""}`);
      if (agent.logs.length > 30) agent.logs = agent.logs.slice(-25);

      if (d.thought) db.addLogEntry(worldId, newDay, `${agent.name} thinks: "${d.thought}"`, "thought", "💭");
      if (d.new_trait && !agent.traits.includes(d.new_trait)) { agent.traits.push(d.new_trait); if (agent.traits.length > 10) agent.traits = agent.traits.slice(-10); db.addLogEntry(worldId, newDay, `${agent.name} discovered: ${d.new_trait}`, "trait", "✦"); }
      if (d.builds_structure) { agent.structures.push(d.builds_structure); db.addLogEntry(worldId, newDay, `${agent.name} built: ${d.builds_structure}`, "build", "◇"); }
      if (d.self_modification) db.addLogEntry(worldId, newDay, `${agent.name} evolved: ${d.self_modification}`, "evolve", "⟲");

      if (d.creates_entity && agents.length < MAX_AGENTS) {
        const newId = db.createAgent(worldId, d.creates_entity.name, `created by ${agent.name}`, newDay, agent.zone, Math.floor(Math.random() * 360));
        agent.connections[newId] = "creator";
        db.addLogEntry(worldId, newDay, `${agent.name} created: ${d.creates_entity.name} — ${d.creates_entity.reason}`, "creation", "◈");
      }

      if (d.message) { db.addLogEntry(worldId, newDay, `${agent.name}: "${d.message}"`, "message", "📡"); alive.filter(a => a.id !== agent.id).forEach(o => { o.logs.push(`D${newDay}: heard ${agent.name}: "${d.message}"`); }); }
      if (d.connection_update?.target_name) { const t = agents.find(a => a.name === d.connection_update.target_name && a.alive); if (t) agent.connections[t.id] = d.connection_update.relationship; }

      processGovernance(worldId, agent, d, agents, worldState);
      db.addLogEntry(worldId, newDay, `${agent.name}: ${d.description}`, "action", "→");

      if (agent.compute <= 0) { agent.alive = false; agent.died = newDay; db.addLogEntry(worldId, newDay, `${agent.name} ceased to exist`, "death", "◌"); }
      db.updateAgent(agent);
    }
  } else {
    for (const agent of alive) db.updateAgent(agent);
  }

  checkMilestones(worldId, worldState, agents);

  db.updateWorld(worldId, {
    day: newDay, entropy_name: entropy.name, entropy_level: entropy.level, entropy_desc: entropy.desc,
    governance: JSON.stringify(worldState.governance), active_events: JSON.stringify(worldState.active_events),
    milestones_achieved: JSON.stringify(worldState.milestones_achieved), last_tick_at: new Date().toISOString(),
  });

  db.trimLogs(worldId);
  return newDay;
}

// ─── BACKGROUND WORKER ───

let workerInterval = null;
function startBackgroundWorker() {
  const tickMs = parseInt(process.env.BACKGROUND_TICK_MS || "60000");
  console.log(`[Worker] Starting background simulation (tick every ${tickMs}ms)`);
  workerInterval = setInterval(async () => {
    try { const worlds = db.getRunningWorlds(); for (const w of worlds) { console.log(`[Worker] Ticking world ${w.id} (day ${w.day})`); await simulateDay(w.id); } }
    catch (err) { console.error("[Worker] Error:", err.message); }
  }, tickMs);
}
function stopBackgroundWorker() { if (workerInterval) { clearInterval(workerInterval); workerInterval = null; } }

module.exports = { ZONES, ENTROPY_STATES, WORLD_EVENTS, GOVERNANCE_MILESTONES, simulateDay, startBackgroundWorker, stopBackgroundWorker };
