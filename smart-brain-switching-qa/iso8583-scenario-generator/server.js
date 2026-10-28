/* ============================================================================
 * Smart Brain Switching QA — ISO 8583 Scenario Generator Backend
 * Author: Christina Apriani
 * Zero-dependency Node HTTP server: static assets + REST API.
 * ==========================================================================*/
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ISO = require("./src/iso8583.js");
const AN = require("./src/analyzer.js");
const SY = require("./src/synth.js");
const db = require("./src/db.js");

const PORT = process.env.PORT || 4001;
const PUBLIC = path.join(__dirname, "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise(function (r) { let d = ""; req.on("data", function (c) { d += c; if (d.length > 4e6) req.destroy(); }); req.on("end", function () { try { r(d ? JSON.parse(d) : {}); } catch (e) { r({}); } }); });
}
function serveStatic(res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  const fp = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!fp.startsWith(PUBLIC)) return res.writeHead(403).end("Forbidden");
  fs.readFile(fp, function (err, buf) {
    if (err) return res.writeHead(404, { "Content-Type": "text/plain" }).end("404");
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(buf);
  });
}

const server = http.createServer(async function (req, res) {
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname, m = req.method;
  if (m === "OPTIONS") return res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }).end();

  try {
    if (p.startsWith("/api/")) {
      if (p === "/api/health") return sendJSON(res, 200, { ok: true, service: "ISO8583 Scenario Generator", author: "Christina Apriani" });
      if (p === "/api/samples") return sendJSON(res, 200, AN.SAMPLES);
      if (p === "/api/dict") return sendJSON(res, 200, { DICT: ISO.DICT, MTI: ISO.MTI, RC: ISO.RC });

      if (p === "/api/analyze" && m === "POST") {
        const b = await body(req);
        return sendJSON(res, 200, AN.analyze(b.code || ""));
      }
      if (p === "/api/generate" && m === "POST") {
        const b = await body(req);
        // b: { code? , signal?, family?, limit?, de?, persist? }
        let suites = [];
        if (b.code) {
          const a = AN.analyze(b.code);
          suites = SY.fromAnalysis(a, b.opts || {});
        } else if (b.signal) {
          suites = [SY.fromSignal(b.signal, b.opts || {})];
        } else if (b.family) {
          suites = [SY.fromSignal({ label: b.family + " suite", family: b.family, literals: b.limit ? [b.limit] : (b.de ? [b.de] : []) }, b.opts || {})];
        }
        if (b.persist) suites.forEach(function (s) { db.saveSuite(s); });
        return sendJSON(res, 200, { suites: suites });
      }
      if (p === "/api/parse" && m === "POST") {
        const b = await body(req);
        try { return sendJSON(res, 200, ISO.decodeDetailed((b.raw || "").trim())); }
        catch (e) { return sendJSON(res, 400, { error: "parse failed", detail: String(e) }); }
      }
      if (p === "/api/suites" && m === "GET") return sendJSON(res, 200, db.listSuites());
      if (p === "/api/suites" && m === "POST") {
        const b = await body(req);
        if (b.suite) { db.saveSuite(b.suite); return sendJSON(res, 200, { saved: b.suite.id }); }
        return sendJSON(res, 400, { error: "no suite" });
      }
      let mm;
      if ((mm = p.match(/^\/api\/suites\/(.+)$/))) {
        const id = decodeURIComponent(mm[1]);
        if (m === "GET") return sendJSON(res, 200, db.getSuite(id) || {});
        if (m === "DELETE") { db.deleteSuite(id); return sendJSON(res, 200, { deleted: id }); }
      }
      if (p === "/api/stats") return sendJSON(res, 200, db.stats());
      return sendJSON(res, 404, { error: "unknown endpoint" });
    }
    return serveStatic(res, p);
  } catch (e) {
    return sendJSON(res, 500, { error: "internal", detail: String(e) });
  }
});

server.listen(PORT, function () {
  console.log("────────────────────────────────────────────────────────");
  console.log("  ISO 8583 Scenario & Data Generator · by Christina Apriani");
  console.log("  http://localhost:" + PORT);
  console.log("────────────────────────────────────────────────────────");
});
module.exports = { server };
