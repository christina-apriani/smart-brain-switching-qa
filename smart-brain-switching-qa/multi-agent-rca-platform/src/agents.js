/* ============================================================================
 * Smart Brain Switching QA — Multi-Agent Analysis Engine
 * Author: Christina Apriani
 *
 * Three cooperating agents that investigate failure spikes like a digital
 * detective team:
 *   Agent-A  Log Anomaly Detector  — EWMA + z-score on per-node error rate.
 *   Agent-B  Topology Mapper       — scores every node's infrastructure health.
 *   Agent-C  Investigator          — correlates A + B into a root-cause
 *                                     narrative with a concrete recommendation.
 *
 * Deterministic and explainable. In production Agent-A can be swapped for an
 * Isolation Forest / LSTM and Agent-C for a banking LLM; the contract is the
 * same. Shared by backend and browser (UMD).
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RCAAgents = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RC_NAMES = {
    "05": "Do Not Honor", "14": "Invalid Card", "51": "Insufficient Funds", "55": "Incorrect PIN",
    "61": "Exceeds Limit", "68": "Timeout (Response Too Late)", "91": "Issuer/Switch Inoperative", "96": "System Malfunction",
  };

  /* --- Agent-A: anomaly detection on per-node error rate ------------------ */
  // history = array of snapshots (each has perNode{ id:{total,err,rc} })
  function agentA(history) {
    var findings = [];
    if (history.length < 6) return findings;
    var nodes = {};
    history.forEach(function (snap) {
      Object.keys(snap.perNode || {}).forEach(function (id) {
        if (!nodes[id]) nodes[id] = [];
        var p = snap.perNode[id];
        nodes[id].push({ rate: p.total ? p.err / p.total : 0, rc: p.rc, total: p.total });
      });
    });
    Object.keys(nodes).forEach(function (id) {
      var series = nodes[id];
      if (series.length < 8) return;
      var rates = series.map(function (s) { return s.rate; });
      var n = rates.length;
      // Baseline = earliest portion of the window (pre-incident normal);
      // current = most recent 3 ticks. A sustained fault stands out against
      // the earlier normal; once it becomes the steady state it self-resolves.
      var baseWin = rates.slice(0, Math.max(3, Math.floor(n / 2)));
      var base = avg(baseWin);
      var sd = std(baseWin, base) || 0.01;
      var recent = series.slice(-3);
      var current = avg(recent.map(function (s) { return s.rate; }));
      var recentVol = recent.reduce(function (s, x) { return s + x.total; }, 0);
      var z = Math.round(((current - base) / sd) * 10) / 10;
      // Dwell time: a real fault stays elevated across ticks; a one-tick noise
      // cluster does not. Require the spike to persist, not just average high.
      var sustained = recent.filter(function (s) { return s.rate > 0.045; }).length;
      // Volume guard removes small-sample noise from low-traffic nodes.
      var absHigh = current > 0.06;
      var relHigh = current > base * 2.0 && current - base > 0.04;
      if (recentVol >= 45 && absHigh && relHigh && sustained >= 3) {
        // dominant RC in the recent window
        var rcAgg = {};
        series.slice(-3).forEach(function (s) { Object.keys(s.rc || {}).forEach(function (k) { rcAgg[k] = (rcAgg[k] || 0) + s.rc[k]; }); });
        var domRc = Object.keys(rcAgg).sort(function (a, b) { return rcAgg[b] - rcAgg[a]; })[0] || "68";
        findings.push({
          node: id,
          dominant_rc: domRc,
          rc_name: RC_NAMES[domRc] || domRc,
          current_rate: current,
          baseline_rate: base,
          spike_pct: Math.round((current - base) * 100),
          z: Math.round(z * 10) / 10,
          severity: current > 0.2 ? "critical" : current > 0.1 ? "high" : "elevated",
        });
      }
    });
    findings.sort(function (a, b) { return b.current_rate - a.current_rate; });
    return findings;
  }

  /* --- Agent-B: topology / infrastructure health -------------------------- */
  function agentB(snapshot) {
    var findings = [];
    var nodes = snapshot.nodes || {};
    Object.keys(nodes).forEach(function (id) {
      var m = nodes[id];
      var issues = [];
      if (m.mem >= 85) issues.push({ k: "memory", v: m.mem, msg: "kapasitas memori server hampir penuh (" + m.mem + "%)" });
      if (m.cpu >= 85) issues.push({ k: "cpu", v: m.cpu, msg: "beban CPU sangat tinggi (" + m.cpu + "%)" });
      if (m.latency >= 800) issues.push({ k: "latency", v: m.latency, msg: "latensi jaringan ke bank melonjak (" + m.latency + " ms)" });
      if (m.hsmQueue >= 20) issues.push({ k: "hsm", v: m.hsmQueue, msg: "antrean HSM menumpuk (" + m.hsmQueue + " op)" });
      if (issues.length) {
        findings.push({ node: id, health: scoreHealth(m), issues: issues, metrics: m });
      }
    });
    var coreHealthy = (snapshot.core && snapshot.core.netHealth >= 90 && snapshot.core.cpu < 85);
    findings.sort(function (a, b) { return a.health - b.health; });
    return { nodes: findings, coreHealthy: coreHealthy, core: snapshot.core };
  }
  function scoreHealth(m) {
    var score = 100;
    score -= Math.max(0, m.mem - 60) * 0.8;
    score -= Math.max(0, m.cpu - 60) * 0.7;
    score -= Math.max(0, (m.latency - 150) / 20);
    score -= Math.max(0, m.hsmQueue - 5) * 1.5;
    return Math.max(0, Math.round(score));
  }

  /* --- Agent-C: investigator (root-cause narrative) ----------------------- */
  // nodeNames: id -> display name
  function agentC(aFindings, bReport, nodeNames, channelHint) {
    if (!aFindings.length) return null;
    var top = aFindings[0];
    var name = (nodeNames && nodeNames[top.node]) || top.node;
    var infra = (bReport.nodes || []).find(function (n) { return n.node === top.node; });
    var coreHealthy = bReport.coreHealthy;
    var channel = channelHint || "QRIS";

    var cause, recommendation, confidence;
    if (infra) {
      var worst = infra.issues[0];
      cause =
        "Analisis menunjukkan " + worst.msg + " pada server " + name +
        (coreHealthy ? ", sementara jaringan internal core switch 100% sehat." : ", dan core switch juga menunjukkan tekanan beban.");
      if (worst.k === "memory" || worst.k === "cpu")
        recommendation = "Aktifkan fitur pembatasan antrean otomatis (throttling) sementara untuk destinasi " + name + " dan eskalasi ke tim infrastruktur bank tujuan.";
      else if (worst.k === "latency")
        recommendation = "Turunkan timeout threshold dan aktifkan stand-in (STIP) untuk destinasi " + name + " hingga latensi normal.";
      else
        recommendation = "Tambah kapasitas HSM / alihkan sebagian beban kripto, dan pantau antrean destinasi " + name + ".";
      confidence = 0.9;
    } else {
      cause = "Lonjakan terdeteksi namun metrik infrastruktur " + name + " masih dalam ambang. Kemungkinan gangguan interkoneksi atau sisi issuer yang tidak ter-ekspos ke metrik kami.";
      recommendation = "Aktifkan throttling preventif untuk " + name + " dan buka kanal konfirmasi dengan operasional bank tujuan.";
      confidence = 0.6;
    }

    var headline =
      "Terjadi lonjakan RC " + top.dominant_rc + " (" + top.rc_name + ") sebesar " + top.spike_pct +
      "% pada transaksi " + channel + " arah " + name + ".";

    return {
      id: "INC-" + Date.now().toString().slice(-8),
      detected_at: new Date().toISOString(),
      node: top.node,
      node_name: name,
      dominant_rc: top.dominant_rc,
      severity: top.severity,
      confidence: confidence,
      headline: headline,
      cause: cause,
      recommendation: recommendation,
      narrative: headline + " " + cause + " Rekomendasi: " + recommendation,
      evidence: {
        agentA: top,
        agentB: infra || { node: top.node, note: "infra within thresholds" },
        core_healthy: coreHealthy,
      },
    };
  }

  function avg(a) { return a.reduce(function (s, x) { return s + x; }, 0) / (a.length || 1); }
  function std(a, m) { m = m == null ? avg(a) : m; return Math.sqrt(avg(a.map(function (x) { return (x - m) * (x - m); }))); }

  return { agentA: agentA, agentB: agentB, agentC: agentC, RC_NAMES: RC_NAMES, scoreHealth: scoreHealth };
});
