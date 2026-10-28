/* ============================================================================
 * Multi-Agent RCA Platform — Data layer (live SSE / demo loop)
 * Author: Christina Apriani
 *
 * Live mode subscribes to the backend SSE stream. Demo mode runs the same
 * simulator + agents in the browser on a timer. Both call the subscriber with
 * identical tick/incident payloads, so the dashboard never branches on mode.
 * ==========================================================================*/
(function (root) {
  "use strict";
  var TOPO = root.RCATopology, SIM = root.RCASimulator, AG = root.RCAAgents;
  var mode = "demo";
  var subs = { tick: [], incident: [] };
  var demoState = null, demoTimer = null, demoOpen = {};
  var NAMES = {}; TOPO.NODES.forEach(function (n) { NAMES[n.id] = n.name; });
  var incidents = []; // demo store

  function emit(ev, data) { (subs[ev] || []).forEach(function (f) { f(data); }); }

  function j(method, path, b) {
    var o = { method: method, headers: { "Content-Type": "application/json" } };
    if (b) o.body = JSON.stringify(b);
    return fetch(path, o).then(function (r) { return r.json(); });
  }

  function demoLoop() {
    var out = SIM.tick(demoState);
    var a = AG.agentA(demoState.history);
    var b = AG.agentB(out.snapshot);
    var qris = 0, card = 0; out.txns.forEach(function (t) { t.channel === "QRIS" ? qris++ : card++; });
    var inc = AG.agentC(a, b, NAMES, qris >= card ? "QRIS" : "CARD");
    var raised = null;
    if (inc) {
      if (!demoOpen[inc.node]) { inc.status = "open"; inc.ts = new Date().toISOString().slice(0, 19).replace("T", " "); incidents.unshift(inc); demoOpen[inc.node] = inc.id; raised = inc.id; emit("incident", inc); }
    } else {
      var unhealthy = {}; (b.nodes || []).forEach(function (n) { unhealthy[n.node] = 1; });
      a.forEach(function (f) { unhealthy[f.node] = 1; });
      Object.keys(demoOpen).forEach(function (nid) { if (!unhealthy[nid]) delete demoOpen[nid]; });
    }
    emit("tick", { snapshot: out.snapshot, agentA: a, agentB: b, raised: raised });
  }

  var API = {
    mode: function () { return mode; },
    nodes: TOPO.NODES,
    detect: function () {
      var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 900);
      return fetch("/api/health", { signal: ctrl.signal })
        .then(function (r) { clearTimeout(to); if (!r.ok) throw 0; return r.json(); })
        .then(function () { mode = "live"; return "live"; })
        .catch(function () { mode = "demo"; return "demo"; });
    },
    start: function () {
      if (mode === "live") {
        var es = new EventSource("/api/stream");
        es.addEventListener("tick", function (e) { try { emit("tick", JSON.parse(e.data)); } catch (x) {} });
        es.addEventListener("incident", function (e) { try { emit("incident", JSON.parse(e.data)); } catch (x) {} });
        this._es = es;
      } else {
        demoState = SIM.createState();
        for (var i = 0; i < 10; i++) SIM.tick(demoState); // warm up
        demoTimer = setInterval(demoLoop, 1200);
      }
    },
    on: function (ev, fn) { (subs[ev] || (subs[ev] = [])).push(fn); },
    inject: function (nodeId, type, magnitude) {
      if (mode === "live") return j("POST", "/api/inject", { nodeId: nodeId, type: type, magnitude: magnitude });
      SIM.injectFault(demoState, nodeId, type, magnitude || 0.14); return Promise.resolve({ injected: nodeId });
    },
    clear: function () {
      if (mode === "live") return j("POST", "/api/clear");
      SIM.clearFaults(demoState); demoOpen = {}; return Promise.resolve({ cleared: true });
    },
    incidents: function () { return mode === "live" ? j("GET", "/api/incidents") : Promise.resolve(incidents.slice(0, 60)); },
    resolve: function (id) {
      if (mode === "live") return j("POST", "/api/incident/resolve", { id: id });
      var i = incidents.find(function (x) { return x.id === id; }); if (i) i.status = "resolved"; return Promise.resolve({ ok: true });
    },
    stats: function () {
      if (mode === "live") return j("GET", "/api/stats");
      return Promise.resolve({ total: incidents.length, open: incidents.filter(function (i) { return i.status === "open"; }).length });
    },
  };
  root.RCAApi = API;
})(window);
