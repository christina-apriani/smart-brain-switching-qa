/* ============================================================================
 * Smart Brain Switching QA — Multi-Agent Monitoring & RCA Backend
 * Author: Christina Apriani
 *
 * Runs the live simulation loop server-side, applies the three agents every
 * tick, raises incidents, and streams everything to connected dashboards over
 * Server-Sent Events. Zero external dependencies.
 * ==========================================================================*/
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const TOPO = require("./src/topology.js");
const SIM = require("./src/simulator.js");
const AG = require("./src/agents.js");
const db = require("./src/db.js");

const PORT = process.env.PORT || 4002;
const PUBLIC = path.join(__dirname, "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

const NAMES = {}; TOPO.NODES.forEach(function (n) { NAMES[n.id] = n.name; });

// ---- live state ----
let state = SIM.createState();
const sseClients = new Set();
const openByNode = {}; // node -> incident id (dedupe)

function broadcast(event, data) {
  const payload = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
  for (const res of sseClients) { try { res.write(payload); } catch (e) { sseClients.delete(res); } }
}

function loop() {
  const out = SIM.tick(state);
  const a = AG.agentA(state.history);
  const b = AG.agentB(out.snapshot);
  // dominant channel this tick
  let qris = 0, card = 0; out.txns.forEach(function (t) { t.channel === "QRIS" ? qris++ : card++; });
  const incident = AG.agentC(a, b, NAMES, qris >= card ? "QRIS" : "CARD");
  let raised = null;
  if (incident) {
    if (!openByNode[incident.node]) {
      incident.status = "open";
      db.saveIncident(incident);
      openByNode[incident.node] = incident.id;
      raised = incident;
      broadcast("incident", incident);
    }
  } else {
    // clear dedupe for nodes that are now healthy
    const unhealthy = new Set((b.nodes || []).map(function (n) { return n.node; }));
    const flagged = new Set(a.map(function (f) { return f.node; }));
    Object.keys(openByNode).forEach(function (nid) {
      if (!unhealthy.has(nid) && !flagged.has(nid)) delete openByNode[nid];
    });
  }
  broadcast("tick", { snapshot: out.snapshot, agentA: a, agentB: b, raised: raised ? raised.id : null });
}
setInterval(loop, 1200);

// ---- http ----
function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function body(req) { return new Promise(function (r) { let d = ""; req.on("data", function (c) { d += c; if (d.length > 1e6) req.destroy(); }); req.on("end", function () { try { r(d ? JSON.parse(d) : {}); } catch (e) { r({}); } }); }); }
function serveStatic(res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  const fp = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!fp.startsWith(PUBLIC)) return res.writeHead(403).end("Forbidden");
  fs.readFile(fp, function (err, buf) {
    if (err) return res.writeHead(404, { "Content-Type": "text/plain" }).end("404");
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" }); res.end(buf);
  });
}

const server = http.createServer(async function (req, res) {
  const parsed = url.parse(req.url, true), p = parsed.pathname, m = req.method;
  if (m === "OPTIONS") return res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }).end();
  try {
    if (p.startsWith("/api/")) {
      if (p === "/api/health") return sendJSON(res, 200, { ok: true, service: "Multi-Agent RCA Platform", author: "Christina Apriani" });
      if (p === "/api/topology") return sendJSON(res, 200, { nodes: TOPO.NODES });
      if (p === "/api/state") {
        const snap = state.history[state.history.length - 1] || null;
        return sendJSON(res, 200, { snapshot: snap, agentA: AG.agentA(state.history), agentB: snap ? AG.agentB(snap) : null, faults: state.injections });
      }
      if (p === "/api/incidents") return sendJSON(res, 200, db.listIncidents(60));
      if (p === "/api/stats") return sendJSON(res, 200, db.stats());
      if (p === "/api/inject" && m === "POST") {
        const bq = await body(req);
        if (!bq.nodeId) return sendJSON(res, 400, { error: "nodeId required" });
        SIM.injectFault(state, bq.nodeId, bq.type || "memory", bq.magnitude || 0.14);
        return sendJSON(res, 200, { injected: bq.nodeId, type: bq.type || "memory" });
      }
      if (p === "/api/clear" && m === "POST") { SIM.clearFaults(state); Object.keys(openByNode).forEach(function (k) { delete openByNode[k]; }); return sendJSON(res, 200, { cleared: true }); }
      if (p === "/api/incident/resolve" && m === "POST") { const bq = await body(req); if (bq.id) { db.setStatus(bq.id, "resolved"); } return sendJSON(res, 200, { ok: true }); }
      if (p === "/api/stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
        res.write("event: hello\ndata: " + JSON.stringify({ nodes: TOPO.NODES }) + "\n\n");
        sseClients.add(res); req.on("close", function () { sseClients.delete(res); });
        return;
      }
      return sendJSON(res, 404, { error: "unknown endpoint" });
    }
    return serveStatic(res, p);
  } catch (e) { return sendJSON(res, 500, { error: "internal", detail: String(e) }); }
});

server.listen(PORT, function () {
  console.log("────────────────────────────────────────────────────────");
  console.log("  Multi-Agent Monitoring & RCA · by Christina Apriani");
  console.log("  http://localhost:" + PORT);
  console.log("  Agents: A (anomaly) · B (topology) · C (investigator)");
  console.log("────────────────────────────────────────────────────────");
});
module.exports = { server };
