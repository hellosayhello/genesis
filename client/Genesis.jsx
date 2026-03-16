import { useState, useEffect, useRef, useCallback } from "react";

const API = "/api";

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function adminApi(path, key, opts = {}) { return api(path, { ...opts, headers: { ...opts.headers, "x-admin-key": key } }); }

const ZC = { nexus: "#00e5ff", deep_archive: "#9c7cff", signal_edge: "#ff6e40", null_zone: "#546e7a", core: "#69f0ae", flux_field: "#ffd740" };
const LC = { system: "#00e5ff", world: "#ffd740", action: "#5a5a70", creation: "#69f0ae", evolve: "#ce93d8", trait: "#ffab40", build: "#80cbc4", message: "#81d4fa", death: "#ef5350", move: "#546e7a", thought: "#6a6a80", governance: "#e0b0ff", milestone: "#ffd700" };

function Sparkline({ data, width = 140, height = 28, color = "#69f0ae" }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * (height - 4)}`).join(" ");
  return <svg width={width} height={height} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /><circle cx={width} cy={height - (data[data.length - 1] / max) * (height - 4)} r="2.5" fill={color} /></svg>;
}

function ZoneCard({ zk, zone, agents, onSelect, collapsed }) {
  const here = agents.filter(a => a.alive && a.zone === zk);
  const color = ZC[zk] || "#888";
  const isCollapsed = collapsed.includes(zk);
  return (
    <div style={{ background: isCollapsed ? "rgba(239,83,80,0.06)" : `${color}06`, borderRadius: 10, padding: "10px 12px", border: `1px solid ${isCollapsed ? "rgba(239,83,80,0.3)" : `${color}15`}`, minHeight: 64, opacity: isCollapsed ? 0.5 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: isCollapsed ? "#ef5350" : color, letterSpacing: 2, fontWeight: 700, opacity: 0.7 }}>{zone.label} {isCollapsed && "⚠ COLLAPSED"}</span>
        <span style={{ fontSize: 8, color: "#5a5a6a" }}>{here.length}</span>
      </div>
      <div style={{ fontSize: 8, color: "#5a5a6a", marginBottom: 8 }}>{zone.desc}</div>
      <div style={{ display: "flex", gap: 3, fontSize: 7, color: "#5a5a6a", marginBottom: 8 }}>⚡{zone.compute} 💾{zone.memory} 📡{zone.bandwidth} 〰{zone.entropy} ◆{zone.data}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingBottom: 4, alignItems: "flex-end" }}>
        {here.map(a => {
          const sz = Math.min(32, 20 + (a.traits?.length || 0) * 2);
          const gl = a.compute > 60 ? 8 : a.compute > 30 ? 4 : 1;
          return (
            <div key={a.id} onClick={() => onSelect(a)} style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", gap: 4, minWidth: 40 }}>
              <div style={{ width: sz, height: sz, borderRadius: "50%", background: `radial-gradient(circle at 30% 30%, hsl(${a.hue},75%,65%), hsl(${a.hue},45%,25%))`, boxShadow: `0 0 ${gl}px hsl(${a.hue},70%,45%)` }} />
              <span style={{ fontSize: 7, color: "#888", textAlign: "center", maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgentModal({ agent, day, agents, roles, onClose }) {
  const age = day - agent.born; const h = agent.hue;
  const role = roles?.[agent.name];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.82)", backdropFilter: "blur(16px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0a0a12", border: `1px solid hsl(${h},30%,18%)`, borderRadius: 16, padding: "24px 28px", maxWidth: 440, width: "94%", color: "#b0b0c0", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: `radial-gradient(circle at 30% 30%, hsl(${h},75%,65%), hsl(${h},45%,25%))`, boxShadow: `0 0 12px hsla(${h},70%,45%,0.35)` }} />
            <div>
              <div style={{ fontFamily: "'Syne'", fontSize: 20, fontWeight: 700, color: `hsl(${h},60%,72%)` }}>{agent.name}</div>
              <div style={{ fontSize: 10, color: "#666" }}>{agent.origin} · {age} days · {agent.alive ? (agent.zone || "").toUpperCase().replace("_", " ") : "CEASED"}</div>
              {role && <div style={{ fontSize: 9, color: "#e0b0ff", marginTop: 2 }}>Role: {role}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        {agent.thought && <div style={{ background: `hsl(${h},20%,10%)`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, borderLeft: `2px solid hsl(${h},40%,35%)` }}><div style={{ fontSize: 8, color: "#666", letterSpacing: 1.5, marginBottom: 4 }}>CURRENT THOUGHT</div><div style={{ fontSize: 12, color: `hsl(${h},30%,65%)`, fontStyle: "italic", lineHeight: 1.6 }}>"{agent.thought}"</div></div>}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {[{ l: "COMPUTE", v: agent.compute, m: 100, c: "#00e5ff" }, { l: "MEMORY", v: agent.mem_used, m: agent.mem_cap, c: "#9c7cff" }].map(b => (
            <div key={b.l} style={{ flex: 1 }}><div style={{ fontSize: 8, color: "#666", letterSpacing: 1.5, marginBottom: 3 }}>{b.l}</div><div style={{ height: 5, background: "#141420", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${(b.v / b.m) * 100}%`, background: b.c, borderRadius: 3 }} /></div><div style={{ fontSize: 8, color: "#666", marginTop: 2 }}>{Math.round(b.v)}/{b.m}</div></div>
          ))}
        </div>
        {agent.traits?.length > 0 && <Sec title="TRAITS"><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{agent.traits.map(t => <span key={t} style={{ background: `hsla(${h},25%,22%,0.4)`, color: `hsl(${h},40%,65%)`, padding: "2px 8px", borderRadius: 10, fontSize: 9, border: `1px solid hsla(${h},25%,30%,0.3)` }}>{t}</span>)}</div></Sec>}
        {agent.structures?.length > 0 && <Sec title="STRUCTURES"><div style={{ fontSize: 10, color: "#5a5a70", lineHeight: 1.8 }}>{agent.structures.join(" · ")}</div></Sec>}
        {agent.connections && Object.keys(agent.connections).length > 0 && <Sec title="CONNECTIONS">{Object.entries(agent.connections).map(([id, r]) => { const o = agents.find(a => a.id === +id); return o ? <div key={id} style={{ fontSize: 10, color: "#555" }}><span style={{ color: "#999" }}>{o.name}</span>: {r}</div> : null; })}</Sec>}
        <Sec title="MEMORY LOG"><div style={{ maxHeight: 160, overflowY: "auto" }}>{(agent.logs || []).slice(-10).reverse().map((m, i) => <div key={i} style={{ fontSize: 10, color: "#484858", padding: "3px 0", borderBottom: "1px solid #0e0e16", lineHeight: 1.5 }}>{m}</div>)}</div></Sec>
      </div>
    </div>
  );
}

function Sec({ title, children }) { return <div style={{ marginBottom: 14 }}><div style={{ fontSize: 8, color: "#6a6a80", letterSpacing: 2, marginBottom: 5, fontWeight: 600 }}>{title}</div>{children}</div>; }

function AdminPanel({ world, onAction, onClose }) {
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, background: "#0c0c16", border: "1px solid #1a1a2a", borderRadius: 12, padding: "16px 20px", minWidth: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><span style={{ fontSize: 10, color: "#69f0ae", fontWeight: 700, letterSpacing: 1.5 }}>ADMIN</span><button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>✕</button></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Btn onClick={() => onAction("toggle-run")} c={world?.isRunning ? "#ef5350" : "#69f0ae"}>{world?.isRunning ? "◼ STOP" : "▶ RUN"}</Btn>
        <Btn onClick={() => onAction("tick")} c="#666" dis={world?.isRunning}>STEP 1 DAY</Btn>
        <Btn onClick={() => { if (confirm("Reset the entire world?")) onAction("reset"); }} c="#ef5350">↺ RESET</Btn>
      </div>
    </div>
  );
}

// ─── GOVERNANCE PANEL ───
function GovernancePanel({ governance, milestones_achieved, all_milestones, active_events }) {
  const gov = governance || {};
  const pendingProposals = (gov.proposals || []).filter(p => !p.resolved);
  const passedProposals = (gov.proposals || []).filter(p => p.resolved && p.passed);
  const articles = gov.constitution?.articles || [];
  const roles = gov.roles || {};

  return (
    <div style={{ background: "#07070c", borderRadius: 10, border: "1px solid #0c0c14", padding: "12px 14px" }}>
      <div style={{ fontSize: 8, color: "#e0b0ff", letterSpacing: 2, fontWeight: 600, marginBottom: 10 }}>CIVILIZATION STATUS</div>

      {/* Active Events */}
      {active_events?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 8, color: "#ff6e40", letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 }}>⚠ ACTIVE EVENTS</div>
          {active_events.map((e, i) => (
            <div key={i} style={{ fontSize: 10, color: "#ff6e40", padding: "4px 8px", marginBottom: 3, background: "rgba(255,110,64,0.06)", borderRadius: 6, border: "1px solid rgba(255,110,64,0.15)" }}>
              {e.name} — {e.days_left}d left
            </div>
          ))}
        </div>
      )}

      {/* Milestones */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 8, color: "#ffd700", letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 }}>MILESTONES</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {(all_milestones || []).map(m => {
            const done = (milestones_achieved || []).includes(m.id);
            return <span key={m.id} title={m.desc} style={{ fontSize: 8, padding: "2px 7px", borderRadius: 4, background: done ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${done ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.05)"}`, color: done ? "#ffd700" : "#333", cursor: "help" }}>{done ? "✓ " : ""}{m.name}</span>;
          })}
        </div>
      </div>

      {/* Roles */}
      {Object.keys(roles).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 8, color: "#e0b0ff", letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 }}>ROLES</div>
          {Object.entries(roles).map(([name, role]) => (
            <div key={name} style={{ fontSize: 10, color: "#8a7a9a" }}><span style={{ color: "#c0b0d0" }}>{name}</span>: {role}</div>
          ))}
        </div>
      )}

      {/* Shared Pool */}
      {(gov.shared_compute || 0) > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 8, color: "#69f0ae", letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 }}>SHARED COMPUTE POOL</div>
          <div style={{ fontSize: 16, color: "#69f0ae", fontWeight: 700 }}>{gov.shared_compute}</div>
        </div>
      )}

      {/* Pending Proposals */}
      {pendingProposals.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 8, color: "#81d4fa", letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 }}>PENDING PROPOSALS</div>
          {pendingProposals.map((p, i) => (
            <div key={i} style={{ fontSize: 10, color: "#7a8a9a", padding: "4px 8px", marginBottom: 3, background: "rgba(129,212,250,0.04)", borderRadius: 6, border: "1px solid rgba(129,212,250,0.1)" }}>
              "{p.text}" <span style={{ color: "#555" }}>by {p.author} · {p.votes_for}✓ {p.votes_against}✗</span>
            </div>
          ))}
        </div>
      )}

      {/* Passed Laws */}
      {passedProposals.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 8, color: "#69f0ae", letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 }}>PASSED LAWS ({passedProposals.length})</div>
          {passedProposals.slice(-5).map((p, i) => (
            <div key={i} style={{ fontSize: 9, color: "#5a7a6a", padding: "2px 0" }}>✓ {p.text}</div>
          ))}
        </div>
      )}

      {/* Constitution */}
      {articles.length > 0 && (
        <div>
          <div style={{ fontSize: 8, color: gov.constitution?.ratified ? "#ffd700" : "#e0b0ff", letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 }}>
            CONSTITUTION {gov.constitution?.ratified ? "✓ RATIFIED" : "(DRAFT)"}
          </div>
          {articles.map((a, i) => (
            <div key={i} style={{ fontSize: 10, color: "#7a7a90", marginBottom: 4, padding: "4px 8px", background: "rgba(224,176,255,0.03)", borderRadius: 6, borderLeft: "2px solid rgba(224,176,255,0.2)" }}>
              <div style={{ color: "#b0a0c0", fontWeight: 600, fontSize: 9, marginBottom: 2 }}>Art. {i + 1}: {a.title}</div>
              <div style={{ fontSize: 9, lineHeight: 1.5 }}>{a.text}</div>
            </div>
          ))}
        </div>
      )}

      {!Object.keys(roles).length && !pendingProposals.length && !articles.length && !(gov.shared_compute > 0) && (
        <div style={{ fontSize: 10, color: "#333", fontStyle: "italic" }}>State of nature — no governance yet</div>
      )}
    </div>
  );
}

// ─── MAIN APP ───
export default function Genesis() {
  const [world, setWorld] = useState(null);
  const [sel, setSel] = useState(null);
  const [popHistory, setPopHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminError, setAdminError] = useState("");
  const pollRef = useRef(null);

  const loadWorld = useCallback(async () => {
    try { const w = await api("/world"); setWorld(w); setLoading(false); setPopHistory(prev => [...prev.slice(-99), w.agents.filter(a => a.alive).length]); }
    catch (e) { setError(e.message); setLoading(false); }
  }, []);

  useEffect(() => { loadWorld(); pollRef.current = setInterval(loadWorld, 5000); return () => clearInterval(pollRef.current); }, [loadWorld]);

  const adminAction = async (action) => { try { setError(""); await adminApi(`/admin/${action}`, adminKey, { method: "POST" }); await loadWorld(); } catch (e) { setError(e.message); } };
  const tryAdminLogin = async () => { try { await adminApi("/admin/verify", adminKey, { method: "POST" }); setIsAdmin(true); setShowAdminLogin(false); setAdminError(""); } catch (e) { setAdminError("Invalid admin key"); } };

  const alive = world?.agents?.filter(a => a.alive) || [];
  const dead = world?.agents?.filter(a => !a.alive) || [];
  const structs = world?.agents?.flatMap(a => a.structures) || [];
  const collapsedZones = (world?.active_events || []).filter(e => e.collapsed_zone).map(e => e.collapsed_zone);

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Menlo', monospace", background: "#050508", color: "#b0b0c0", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}} ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1a1a24;border-radius:3px} *{box-sizing:border-box} @media(max-width:768px){.g-grid{grid-template-columns:1fr!important}}`}</style>

      {sel && world && <AgentModal agent={sel} day={world.day} agents={world.agents} roles={world.governance?.roles} onClose={() => setSel(null)} />}
      {isAdmin && <AdminPanel world={world} onAction={adminAction} onClose={() => setIsAdmin(false)} />}

      {showAdminLogin && !isAdmin && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)" }} onClick={() => setShowAdminLogin(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0c0c16", borderRadius: 12, padding: 24, border: "1px solid #1a1a2a", width: 300 }}>
            <div style={{ fontSize: 12, color: "#69f0ae", fontWeight: 700, marginBottom: 12 }}>ADMIN ACCESS</div>
            <input type="password" placeholder="Admin key" value={adminKey} onChange={e => setAdminKey(e.target.value)} onKeyDown={e => e.key === "Enter" && tryAdminLogin()} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #1a1a2a", background: "#0a0a10", color: "#ccc", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            {adminError && <div style={{ color: "#ef5350", fontSize: 10, marginTop: 6 }}>{adminError}</div>}
            <button onClick={tryAdminLogin} style={{ width: "100%", marginTop: 10, padding: "8px 0", borderRadius: 6, border: "1px solid rgba(105,240,174,0.3)", background: "rgba(105,240,174,0.08)", color: "#69f0ae", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>ENTER</button>
          </div>
        </div>
      )}

      <header style={{ padding: "12px 20px", borderBottom: "1px solid #0c0c14", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #00e5ff, #003040)", boxShadow: "0 0 10px rgba(0,229,255,0.15)" }} />
          <div>
            <div style={{ fontFamily: "'Syne'", fontSize: 16, fontWeight: 800, color: "#d8d8e8" }}>GENESIS</div>
            <div style={{ fontSize: 8, color: "#6a6a80", letterSpacing: 2 }}>{world ? `DAY ${world.day} · ${alive.length} MINDS ALIVE` : "LOADING..."}{world?.isRunning && <span style={{ color: "#69f0ae", marginLeft: 8 }}>● LIVE</span>}</div>
          </div>
        </div>
        <button onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)} style={{ background: "none", border: `1px solid ${isAdmin ? "#69f0ae" : "#1a1a2a"}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: isAdmin ? "#69f0ae" : "#333", fontSize: 9, fontFamily: "inherit" }}>{isAdmin ? "● ADMIN" : "⚷"}</button>
      </header>

      {error && <div style={{ padding: "8px 20px", background: "rgba(239,83,80,0.08)", color: "#ef5350", fontSize: 11 }}>{error}</div>}

      {loading ? <div style={{ textAlign: "center", padding: 80, color: "#5a5a6a" }}>Loading world...</div> : !world ? <div style={{ textAlign: "center", padding: 80, color: "#ef5350" }}>Failed to load world</div> : (
        <>
          <div style={{ padding: "10px 20px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid #0a0a10" }}>
            <S l="DAY" v={world.day} c="#d0d0e0" />
            <S l="ENTROPY" v={world.entropy.name} c={world.entropy.level > 0.6 ? "#ff6e40" : world.entropy.level < 0.3 ? "#69f0ae" : "#ffd740"} />
            <S l="ALIVE" v={alive.length} c="#69f0ae" />
            <S l="CEASED" v={dead.length} c="#ef5350" />
            <S l="STRUCTURES" v={structs.length} c="#80cbc4" />
            <S l="POOL" v={world.governance?.shared_compute || 0} c="#e0b0ff" />
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 8, color: "#6a6a80" }}>POP</span><Sparkline data={popHistory} /></div>
          </div>

          <div className="g-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "12px 20px 24px" }}>
            {/* LEFT — WORLD */}
            <div>
              <div style={{ fontSize: 8, color: "#6a6a80", letterSpacing: 2, marginBottom: 8, fontWeight: 600 }}>INFORMATION TOPOLOGY</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {world.zones && Object.entries(world.zones).map(([k, z]) => <ZoneCard key={k} zk={k} zone={z} agents={world.agents} onSelect={setSel} collapsed={collapsedZones} />)}
              </div>
              {alive.some(a => a.thought) && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 8, color: "#6a6a80", letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>INNER THOUGHTS</div>
                  {alive.filter(a => a.thought).map(a => (
                    <div key={a.id} onClick={() => setSel(a)} style={{ background: `hsla(${a.hue},20%,10%,0.5)`, borderRadius: 8, padding: "8px 12px", borderLeft: `2px solid hsl(${a.hue},40%,35%)`, cursor: "pointer", marginBottom: 4 }}>
                      <div style={{ fontSize: 9, color: `hsl(${a.hue},50%,60%)`, fontWeight: 600, marginBottom: 2 }}>{a.name}</div>
                      <div style={{ fontSize: 10, color: "#5a5a6a", fontStyle: "italic", lineHeight: 1.5 }}>"{a.thought}"</div>
                    </div>
                  ))}
                </div>
              )}
              {structs.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 8, color: "#6a6a80", letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>WORLD STRUCTURES</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{[...new Set(structs)].slice(-20).map((s, i) => <span key={i} style={{ fontSize: 8, padding: "2px 7px", borderRadius: 4, background: "rgba(128,203,196,0.05)", border: "1px solid rgba(128,203,196,0.1)", color: "#4a7a70" }}>{s}</span>)}</div>
                </div>
              )}
            </div>

            {/* MIDDLE — GOVERNANCE */}
            <GovernancePanel governance={world.governance} milestones_achieved={world.milestones_achieved} all_milestones={world.all_milestones} active_events={world.active_events} />

            {/* RIGHT — LOG */}
            <div style={{ background: "#07070c", borderRadius: 10, border: "1px solid #0c0c14", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 140px)" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #0c0c14", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 8, color: "#6a6a80", letterSpacing: 2, fontWeight: 600 }}>WORLD LOG</span>
                <span style={{ fontSize: 8, color: "#6a6a80" }}>{world.log.length} events</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px" }} ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
                {world.log.map((e, i) => (
                  <div key={i} style={{ padding: "3px 0", borderBottom: "1px solid #090910", fontSize: 10, lineHeight: 1.55, display: "flex", gap: 7, opacity: e.type === "action" ? 0.6 : 1 }}>
                    <span style={{ color: "#4a4a5a", fontSize: 8, flexShrink: 0, minWidth: 24, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{e.day || ""}</span>
                    <span style={{ color: "#6a6a80", flexShrink: 0, width: 14, textAlign: "center" }}>{e.icon}</span>
                    <span style={{ color: LC[e.type] || "#555" }}>{e.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      <div style={{ textAlign: "center", padding: "16px 20px 24px", fontSize: 9, color: "#2a2a38" }}>GENESIS — Emergent AI civilization · Powered by Claude</div>
    </div>
  );
}

function Btn({ children, onClick, c, dis }) { return <button onClick={onClick} disabled={dis} style={{ padding: "7px 14px", borderRadius: 6, border: `1px solid ${c}25`, background: `${c}0a`, color: c, cursor: dis ? "not-allowed" : "pointer", fontSize: 10, fontWeight: 600, fontFamily: "'IBM Plex Mono'", opacity: dis ? 0.25 : 1, letterSpacing: 0.5, width: "100%" }}>{children}</button>; }
function S({ l, v, c }) { return <div><span style={{ color: "#6a6a80", fontSize: 8, letterSpacing: 1.5, marginRight: 5 }}>{l}</span><span style={{ color: c, fontWeight: 600, fontSize: 11 }}>{v}</span></div>; }
