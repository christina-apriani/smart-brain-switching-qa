/* ============================================================================
 * Smart Brain Switching QA — Generator Persistence (node:sqlite, zero-dep)
 * Author: Christina Apriani
 * Stores generated scenario suites and their cases for reuse and regression.
 * ==========================================================================*/
"use strict";
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "generator.db"));
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS suites (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    family      TEXT,
    signal_json TEXT,
    case_count  INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS cases (
    id        TEXT PRIMARY KEY,
    suite_id  TEXT,
    title     TEXT,
    category  TEXT,
    mti       TEXT,
    raw       TEXT,
    bitmap    TEXT,
    expected_rc TEXT,
    note      TEXT,
    json      TEXT
  );
`);

module.exports = {
  db,
  saveSuite: function (suite) {
    db.prepare(
      "INSERT OR REPLACE INTO suites (id,name,family,signal_json,case_count) VALUES (?,?,?,?,?)"
    ).run(suite.id, suite.name, suite.family, JSON.stringify(suite.signal || {}), suite.cases.length);
    const ins = db.prepare(
      "INSERT OR REPLACE INTO cases (id,suite_id,title,category,mti,raw,bitmap,expected_rc,note,json) VALUES (?,?,?,?,?,?,?,?,?,?)"
    );
    suite.cases.forEach(function (c) {
      ins.run(c.id, suite.id, c.title, c.category, c.mti, c.raw || c.full_raw || "", c.bitmap || "", c.expected_rc || "", c.note || "", JSON.stringify(c));
    });
    return suite.id;
  },
  listSuites: function () {
    return db.prepare("SELECT id,name,family,case_count,created_at FROM suites ORDER BY created_at DESC").all();
  },
  getSuite: function (id) {
    const s = db.prepare("SELECT * FROM suites WHERE id = ?").get(id);
    if (!s) return null;
    const cases = db.prepare("SELECT json FROM cases WHERE suite_id = ?").all(id).map(function (r) {
      try { return JSON.parse(r.json); } catch (e) { return null; }
    }).filter(Boolean);
    return { id: s.id, name: s.name, family: s.family, signal: JSON.parse(s.signal_json || "{}"), created_at: s.created_at, cases: cases };
  },
  deleteSuite: function (id) {
    db.prepare("DELETE FROM cases WHERE suite_id = ?").run(id);
    db.prepare("DELETE FROM suites WHERE id = ?").run(id);
  },
  stats: function () {
    const suites = db.prepare("SELECT COUNT(*) c FROM suites").get().c;
    const cases = db.prepare("SELECT COUNT(*) c FROM cases").get().c;
    const families = db.prepare("SELECT family, COUNT(*) c FROM suites GROUP BY family").all();
    return { suites, cases, families };
  },
};
