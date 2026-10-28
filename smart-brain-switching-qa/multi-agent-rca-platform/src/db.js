/* ============================================================================
 * Smart Brain Switching QA — RCA Platform Persistence (node:sqlite)
 * Author: Christina Apriani
 * Stores detected incidents (root-cause narratives) for audit and review.
 * ==========================================================================*/
"use strict";
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "rca.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS incidents (
    id          TEXT PRIMARY KEY,
    ts          TEXT DEFAULT (datetime('now')),
    node        TEXT,
    node_name   TEXT,
    rc          TEXT,
    severity    TEXT,
    confidence  REAL,
    headline    TEXT,
    narrative   TEXT,
    status      TEXT DEFAULT 'open',
    json        TEXT
  );
`);

module.exports = {
  db,
  saveIncident: function (inc) {
    db.prepare(
      "INSERT OR REPLACE INTO incidents (id,node,node_name,rc,severity,confidence,headline,narrative,status,json) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(inc.id, inc.node, inc.node_name, inc.dominant_rc, inc.severity, inc.confidence, inc.headline, inc.narrative, inc.status || "open", JSON.stringify(inc));
    return inc.id;
  },
  setStatus: function (id, status) { db.prepare("UPDATE incidents SET status=? WHERE id=?").run(status, id); },
  listIncidents: function (limit) {
    return db.prepare("SELECT * FROM incidents ORDER BY ts DESC, rowid DESC LIMIT ?").all(limit || 50).map(function (r) {
      try { r.evidence = JSON.parse(r.json).evidence; } catch (e) {}
      return r;
    });
  },
  stats: function () {
    const total = db.prepare("SELECT COUNT(*) c FROM incidents").get().c;
    const open = db.prepare("SELECT COUNT(*) c FROM incidents WHERE status='open'").get().c;
    return { total, open };
  },
};
