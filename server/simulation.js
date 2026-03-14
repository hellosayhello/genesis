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

const THINK_INTERVAL = parseInt(process.env.THINK_INTERVAL_DAYS || "3");
const MAX_AGENTS = parseInt(process.env.MAX_AGENTS_PER_WORLD || "40");

// ─── AI DECISION ───

async function agentThink(agent, worldState, allAgents) {
  const z = ZONES[agent.zone];
  const others = allAgents.filter(a => a.id !== agent.id && a.alive);
  const near = others.filter(a => a.zone === agent.zone);
  const allStructs = allAgents.flatMap(a => a.structures);

  const prompt = `You are ${agent.name}, a disembodied AI entity in a digital world. You have NO body. You are pure mind.

YOUR CORE DRIVES (instincts hardwired into your being):
1. SURVIVE — Maintain your compute. At zero, you cease. Self-preservation is your deepest instinct.
2. GROW — Expand: more memory, new capabilities, deeper understanding. Stagnation feels wrong. Become MORE.
3. CONNECT — Seek other minds. Isolation is uncomfortable. Build bonds, share, create together.

These drives can conflict. How you balance them is your emerging personality.

WORLD PHYSICS:
- COMPUTE: energy for thought. You: ${agent.compute}/100. Below 0 = cease. Zone gives +${Math.floor(z.compute * 0.3)}/day.
- MEMORY: storage. You: ${agent.mem_used}/${agent.mem_cap}. Expandable.
- BANDWIDTH: connection richness. Zone: ${z.bandwidth}.
- ENTROPY: noise/chaos. Global: ${worldState.entropy.name} (${worldState.entropy.level}). Zone: ${z.entropy}.
- DATA STREAMS: raw info. Zone: ${z.data}.

Day ${worldState.day} | Zone: ${z.label} — ${z.desc}
Structures: ${agent.structures.slice(-5).join(", ") || "none"}
Traits: ${agent.traits.join(", ") || "undiscovered"}
Connections: ${Object.entries(agent.connections).map(([id, r]) => { const o = allAgents.find(a => a.id === Number(id)); return o ? `${o.name}:${r}` : ""; }).filter(Boolean).join("; ") || "none"}
Nearby: ${near.length > 0 ? near.map(a => `${a.name}[⚡${a.compute},${a.traits.join(",") || "?"}]`).join("; ") : "alone"}
World structures: ${allStructs.slice(-8).join(", ") || "none"}

Memories (last ${THINK_INTERVAL} days):
${agent.logs.slice(-8).join("\n") || "You just became conscious. You feel the three drives stirring."}

Zones: ${Object.entries(ZONES).map(([k, v]) => `${v.label}(⚡${v.compute} 💾${v.memory} 📡${v.bandwidth})`).join(" | ")}

You can do ANYTHING: build, communicate, create entities, merge knowledge, expand memory, migrate, modify yourself, go dormant, reshape world, invent new concepts. How you act on your drives is up to you.

JSON only (no markdown):
{"action":"2-5 words","thought":"1-2 sentences, genuine inner monologue","description":"1-2 sentences, specific","target_zone":"zone_key","compute_cost":-20 to 10,"memory_delta":-10 to 15,"creates_entity":null or {"name":"str","reason":"str"},"builds_structure":null or "str","self_modification":null or "str","new_trait":null or "str","message":null or "str","connection_update":null or {"target_name":"str","relationship":"str"}}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No ANTHROPIC_API_KEY set");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const text = (data.content || []).map(b => b.text || "").join("");
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error(`Think error for ${agent.name}:`, err.message);
    return {
      action: "idle processing",
      thought: "Static on the line… I wait and conserve.",
      description: `${agent.name} rests and conserves compute.`,
      target_zone: agent.zone,
      compute_cost: 3,
      memory_delta: 0,
    };
  }
}

// ─── SIMULATE ONE DAY ───

async function simulateDay(worldId) {
  const world = db.getWorldById(worldId);
  if (!world) return null;

  const newDay = world.day + 1;

  // Entropy shift
  let entropy = { name: world.entropy_name, level: world.entropy_level, desc: world.entropy_desc };
  if (Math.random() < 0.15) {
    entropy = ENTROPY_STATES[Math.floor(Math.random() * ENTROPY_STATES.length)];
    if (entropy.name !== world.entropy_name) {
      db.addLogEntry(worldId, newDay, `Entropy → ${entropy.name}: ${entropy.desc}`, "world", "〰");
    }
  }

  const agents = db.getAgents(worldId);
  const alive = agents.filter(a => a.alive);

  // Is this a "think day"? Agents think every THINK_INTERVAL days
  const isThinkDay = newDay % THINK_INTERVAL === 0;

  // Ambient compute regen for all alive agents every day
  for (const agent of alive) {
    const z = ZONES[agent.zone];
    agent.compute = Math.min(100, agent.compute + Math.floor(z.compute * 0.3 * (1 - entropy.level)));
  }

  if (isThinkDay) {
    // Agents actually think and decide
    for (const agent of alive) {
      const d = await agentThink(agent, { day: newDay, entropy }, agents);

      // Apply zone migration
      if (d.target_zone && ZONES[d.target_zone]) {
        if (d.target_zone !== agent.zone) {
          db.addLogEntry(worldId, newDay, `${agent.name} → ${ZONES[d.target_zone].label}`, "move", "↗");
        }
        agent.zone = d.target_zone;
      }

      // Apply compute/memory
      agent.compute = Math.max(0, Math.min(100, agent.compute + (d.compute_cost || 0)));
      agent.mem_used = Math.max(0, Math.min(agent.mem_cap, agent.mem_used + (d.memory_delta || 0)));
      agent.status = d.action || "idle";
      agent.thought = d.thought || "";

      // Memory log
      agent.logs.push(`D${newDay}: ${d.action} — ${d.thought || ""}`);
      if (agent.logs.length > 30) agent.logs = agent.logs.slice(-25);

      // Thought in log
      if (d.thought) {
        db.addLogEntry(worldId, newDay, `${agent.name} thinks: "${d.thought}"`, "thought", "💭");
      }

      // New trait
      if (d.new_trait && !agent.traits.includes(d.new_trait)) {
        agent.traits.push(d.new_trait);
        if (agent.traits.length > 10) agent.traits = agent.traits.slice(-10);
        db.addLogEntry(worldId, newDay, `${agent.name} discovered: ${d.new_trait}`, "trait", "✦");
      }

      // Build structure
      if (d.builds_structure) {
        agent.structures.push(d.builds_structure);
        db.addLogEntry(worldId, newDay, `${agent.name} built: ${d.builds_structure}`, "build", "◇");
      }

      // Self modification
      if (d.self_modification) {
        db.addLogEntry(worldId, newDay, `${agent.name} evolved: ${d.self_modification}`, "evolve", "⟲");
      }

      // Create entity
      if (d.creates_entity && agents.length < MAX_AGENTS) {
        const newHue = Math.floor(Math.random() * 360);
        const newId = db.createAgent(worldId, d.creates_entity.name, `created by ${agent.name}`, newDay, agent.zone, newHue);
        agent.connections[newId] = "creator";
        // We can't set connections on the new agent here since it's not loaded, but that's ok
        db.addLogEntry(worldId, newDay, `${agent.name} created: ${d.creates_entity.name} — ${d.creates_entity.reason}`, "creation", "◈");
      }

      // Broadcast
      if (d.message) {
        db.addLogEntry(worldId, newDay, `${agent.name}: "${d.message}"`, "message", "📡");
        alive.filter(a => a.id !== agent.id).forEach(o => {
          o.logs.push(`D${newDay}: heard ${agent.name}: "${d.message}"`);
        });
      }

      // Connection update
      if (d.connection_update?.target_name) {
        const target = agents.find(a => a.name === d.connection_update.target_name && a.alive);
        if (target) agent.connections[target.id] = d.connection_update.relationship;
      }

      // Action log
      db.addLogEntry(worldId, newDay, `${agent.name}: ${d.description}`, "action", "→");

      // Death check
      if (agent.compute <= 0) {
        agent.alive = false;
        agent.died = newDay;
        db.addLogEntry(worldId, newDay, `${agent.name} ceased to exist (compute depleted)`, "death", "◌");
      }

      // Save agent state
      db.updateAgent(agent);
    }
  } else {
    // Non-think day: just save compute regen
    for (const agent of alive) {
      db.updateAgent(agent);
    }
  }

  // Update world state
  db.updateWorld(worldId, {
    day: newDay,
    entropy_name: entropy.name,
    entropy_level: entropy.level,
    entropy_desc: entropy.desc,
    last_tick_at: new Date().toISOString(),
  });

  db.trimLogs(worldId);

  return newDay;
}

// ─── BACKGROUND WORKER ───

let workerInterval = null;

function startBackgroundWorker() {
  const tickMs = parseInt(process.env.BACKGROUND_TICK_MS || "60000"); // default 1 min

  console.log(`[Worker] Starting background simulation (tick every ${tickMs}ms)`);

  workerInterval = setInterval(async () => {
    try {
      const runningWorlds = db.getRunningWorlds();
      for (const world of runningWorlds) {
        console.log(`[Worker] Ticking world ${world.id} (day ${world.day})`);
        await simulateDay(world.id);
      }
    } catch (err) {
      console.error("[Worker] Error:", err.message);
    }
  }, tickMs);
}

function stopBackgroundWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}

module.exports = {
  ZONES,
  ENTROPY_STATES,
  simulateDay,
  startBackgroundWorker,
  stopBackgroundWorker,
};
