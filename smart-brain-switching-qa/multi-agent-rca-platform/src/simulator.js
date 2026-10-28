/* ============================================================================
 * Smart Brain Switching QA — Live Transaction Simulator (non-intrusive tap)
 * Author: Christina Apriani
 *
 * Models the live transaction stream the QA platform taps from the message
 * bus, without touching the switching hot path. Each tick emits a batch of
 * transactions and advances every node's infrastructure metrics. Faults can be
 * injected to reproduce production incidents (timeout storms, malfunctions,
 * memory exhaustion). Shared by backend and browser (UMD).
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./topology.js"));
  else root.RCASimulator = factory(root.RCATopology);
})(typeof self !== "undefined" ? self : this, function (TOPO) {
  "use strict";

  var CHANNELS = ["QRIS", "CARD"];
  var RC_OK = "00";

  function createState() {
    var nodes = {};
    TOPO.NODES.forEach(function (n) {
      if (n.role !== "issuer") return;
      nodes[n.id] = { metrics: TOPO.baseMetrics(), injection: null };
    });
    return {
      t: 0,
      nodes: nodes,
      core: { cpu: 30 + Math.random() * 10, mem: 35 + Math.random() * 10, netHealth: 100 },
      injections: {}, // nodeId -> { type, ttl, magnitude }
      history: [], // per-tick aggregate snapshots (rolling)
    };
  }

  function pickDestination() {
    var issuers = TOPO.issuers();
    var total = issuers.reduce(function (s, n) { return s + n.weight; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < issuers.length; i++) {
      r -= issuers[i].weight;
      if (r <= 0) return issuers[i];
    }
    return issuers[0];
  }

  // drift a value toward a target with noise, clamped 0..100
  function drift(v, target, rate, noise) {
    v += (target - v) * rate + (Math.random() - 0.5) * noise;
    return Math.max(0, Math.min(100, v));
  }

  function injectFault(state, nodeId, type, magnitude) {
    state.injections[nodeId] = { type: type, magnitude: magnitude || 0.12, ttl: 40, startedTick: state.t };
  }
  function clearFaults(state) { state.injections = {}; }

  // advance one tick; returns { txns:[], snapshot }
  function tick(state, txnPerTick) {
    state.t++;
    txnPerTick = txnPerTick || 120 + Math.floor(Math.random() * 40);

    // update node metrics
    Object.keys(state.nodes).forEach(function (id) {
      var node = state.nodes[id];
      var inj = state.injections[id];
      var m = node.metrics;
      if (inj) {
        // Infrastructure degrades first; the error spike follows once it is high.
        if (inj.type === "memory" || inj.type === "malfunction") m.mem = drift(m.mem, 99, 0.3, 2);
        if (inj.type === "cpu" || inj.type === "malfunction") m.cpu = drift(m.cpu, 97, 0.3, 2);
        if (inj.type === "timeout") m.latency = drift(m.latency, 100, 0.2, 5) + 900 * inj.magnitude;
        if (inj.type === "memory" || inj.type === "malfunction") m.hsmQueue = Math.min(60, m.hsmQueue + 2 + Math.floor(Math.random() * 3));
        inj.ttl--; if (inj.ttl <= 0) delete state.injections[id];
      } else {
        m.cpu = drift(m.cpu, 42, 0.08, 4);
        m.mem = drift(m.mem, 48, 0.06, 3);
        m.latency = 60 + Math.random() * 50;
        m.hsmQueue = Math.max(0, Math.round(drift(m.hsmQueue, 2, 0.2, 2)));
      }
    });
    // core stays healthy unless core fault
    var coreInj = state.injections["CORE"];
    state.core.cpu = drift(state.core.cpu, coreInj ? 92 : 33, 0.1, 3);
    state.core.mem = drift(state.core.mem, 38, 0.06, 2);
    state.core.netHealth = coreInj ? Math.max(40, state.core.netHealth - 3) : Math.min(100, state.core.netHealth + 2);

    // generate transactions
    var txns = [];
    var perNode = {}; // id -> { total, err, rc:{} }
    for (var i = 0; i < txnPerTick; i++) {
      var dst = pickDestination();
      var node = state.nodes[dst.id];
      var inj = state.injections[dst.id];
      var channel = Math.random() < 0.68 ? "QRIS" : "CARD";
      var rc = RC_OK;
      // base error ~1.5%
      var roll = Math.random();
      var errBase = 0.015 + (node.metrics.mem > 85 ? 0.04 : 0) + (node.metrics.cpu > 85 ? 0.03 : 0);
      if (inj) {
        var mag = inj.magnitude;
        if (inj.type === "timeout" && roll < mag) rc = "68";
        else if (inj.type === "malfunction" && node.metrics.mem > 70 && roll < mag) rc = Math.random() < 0.5 ? "91" : "96";
        else if (inj.type === "memory" && node.metrics.mem > 72 && roll < mag) rc = "68";
        else if (roll < errBase) rc = pickBaseError();
      } else if (roll < errBase) {
        rc = pickBaseError();
      }
      var latency = Math.round(node.metrics.latency + (rc === "68" ? 2000 + Math.random() * 1500 : Math.random() * 120));
      var txn = { ts: Date.now(), dst: dst.id, dstName: dst.name, channel: channel, rc: rc, latency: latency, amount: 10000 + Math.floor(Math.random() * 2000000) };
      txns.push(txn);
      if (!perNode[dst.id]) perNode[dst.id] = { total: 0, err: 0, rc: {} };
      perNode[dst.id].total++;
      if (rc !== RC_OK) { perNode[dst.id].err++; perNode[dst.id].rc[rc] = (perNode[dst.id].rc[rc] || 0) + 1; }
    }

    var totalErr = Object.keys(perNode).reduce(function (s, id) { return s + perNode[id].err; }, 0);
    var snapshot = {
      t: state.t,
      ts: Date.now(),
      txnTotal: txns.length,
      errTotal: totalErr,
      errRate: txns.length ? totalErr / txns.length : 0,
      perNode: perNode,
      nodes: snapshotNodes(state),
      core: Object.assign({}, state.core),
      activeFaults: Object.keys(state.injections),
    };
    state.history.push(snapshot);
    if (state.history.length > 120) state.history.shift();
    return { txns: txns, snapshot: snapshot };
  }

  function pickBaseError() {
    var pool = ["05", "51", "55", "14", "61"];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function snapshotNodes(state) {
    var out = {};
    Object.keys(state.nodes).forEach(function (id) {
      var m = state.nodes[id].metrics;
      out[id] = { cpu: Math.round(m.cpu), mem: Math.round(m.mem), latency: Math.round(m.latency), hsmQueue: m.hsmQueue };
    });
    return out;
  }

  return { createState: createState, tick: tick, injectFault: injectFault, clearFaults: clearFaults };
});
