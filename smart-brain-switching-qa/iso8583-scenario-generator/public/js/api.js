/* ============================================================================
 * ISO 8583 Scenario Generator — Data layer (live backend / demo fallback)
 * Author: Christina Apriani
 * ==========================================================================*/
(function (root) {
  "use strict";
  var ISO = root.ISO8583, AN = root.ISOAnalyzer, SY = root.ISOSynth;
  var mode = "demo";
  var LS = "iso8583_suites_v1";

  function loadLocal() { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch (e) { return []; } }
  function saveLocal(a) { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) {} }

  function j(method, path, b) {
    var o = { method: method, headers: { "Content-Type": "application/json" } };
    if (b) o.body = JSON.stringify(b);
    return fetch(path, o).then(function (r) { return r.json(); });
  }

  var API = {
    mode: function () { return mode; },
    detect: function () {
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 900);
      return fetch("/api/health", { signal: ctrl.signal })
        .then(function (r) { clearTimeout(to); if (!r.ok) throw 0; return r.json(); })
        .then(function () { mode = "live"; return "live"; })
        .catch(function () { mode = "demo"; return "demo"; });
    },
    samples: function () { return mode === "live" ? j("GET", "/api/samples") : Promise.resolve(AN.SAMPLES); },
    dict: function () { return mode === "live" ? j("GET", "/api/dict") : Promise.resolve({ DICT: ISO.DICT, MTI: ISO.MTI, RC: ISO.RC }); },
    analyze: function (code) { return mode === "live" ? j("POST", "/api/analyze", { code: code }) : Promise.resolve(AN.analyze(code)); },
    generate: function (payload) {
      if (mode === "live") return j("POST", "/api/generate", payload);
      var suites = [];
      if (payload.code) suites = SY.fromAnalysis(AN.analyze(payload.code), payload.opts || {});
      else if (payload.signal) suites = [SY.fromSignal(payload.signal, payload.opts || {})];
      else if (payload.family) suites = [SY.fromSignal({ label: payload.family + " suite", family: payload.family, literals: payload.limit ? [payload.limit] : (payload.de ? [payload.de] : []) }, payload.opts || {})];
      if (payload.persist) { var all = loadLocal(); suites.forEach(function (s) { all.unshift(sliceSuite(s)); }); saveLocal(all); }
      return Promise.resolve({ suites: suites });
    },
    parse: function (raw) {
      if (mode === "live") return j("POST", "/api/parse", { raw: raw });
      try { return Promise.resolve(ISO.decodeDetailed((raw || "").trim())); }
      catch (e) { return Promise.resolve({ error: "parse failed", detail: String(e) }); }
    },
    listSuites: function () { return mode === "live" ? j("GET", "/api/suites") : Promise.resolve(loadLocal().map(function (s) { return { id: s.id, name: s.name, family: s.family, case_count: s.cases.length, created_at: s.created_at }; })); },
    getSuite: function (id) { return mode === "live" ? j("GET", "/api/suites/" + encodeURIComponent(id)) : Promise.resolve(loadLocal().find(function (s) { return s.id === id; }) || {}); },
    saveSuite: function (suite) {
      if (mode === "live") return j("POST", "/api/suites", { suite: suite });
      var all = loadLocal(); all = all.filter(function (s) { return s.id !== suite.id; }); all.unshift(sliceSuite(suite)); saveLocal(all); return Promise.resolve({ saved: suite.id });
    },
    deleteSuite: function (id) {
      if (mode === "live") return j("DELETE", "/api/suites/" + encodeURIComponent(id));
      saveLocal(loadLocal().filter(function (s) { return s.id !== id; })); return Promise.resolve({ deleted: id });
    },
    stats: function () {
      if (mode === "live") return j("GET", "/api/stats");
      var all = loadLocal(); var cases = all.reduce(function (n, s) { return n + s.cases.length; }, 0);
      return Promise.resolve({ suites: all.length, cases: cases, families: [] });
    },
  };
  function sliceSuite(s) { s.created_at = new Date().toISOString().slice(0, 19).replace("T", " "); return s; }
  root.GenAPI = API;
})(window);
