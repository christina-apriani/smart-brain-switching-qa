/* ============================================================================
 * Multi-Agent RCA Platform — Dashboard Controller
 * Author: Christina Apriani
 * ==========================================================================*/
(function () {
  "use strict";
  var API = window.RCAApi, MAP = window.RCAMap, TOPO = window.RCATopology, AG = window.RCAAgents;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var NAMES = {}; TOPO.NODES.forEach(function (n) { NAMES[n.id] = n.name; });
  var tpsSeries = [], errSeries = [], lastSnapshot = null, lastB = null;

  document.querySelectorAll(".tab").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".view").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      var v = b.dataset.v === "map" ? "map-view" : b.dataset.v;
      $(v).classList.add("active");
      if (b.dataset.v === "map") { MAP.init(TOPO.NODES); MAP.refresh(); if (lastSnapshot) MAP.update(lastSnapshot, lastB); }
      if (b.dataset.v === "incidents") renderIncidents();
      if (b.dataset.v === "control") renderNodeStatus();
    };
  });

  var toastT; function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2500); }
  function setMode(mode) { var p = $("modePill"); p.className = "pill mode-" + mode; $("modeText").textContent = mode === "live" ? "LIVE · backend aktif" : "DEMO · engine lokal"; }

  /* ---- tick handler ---- */
  function onTick(d) {
    var snap = d.snapshot; lastSnapshot = snap; lastB = d.agentB;
    tpsSeries.push(snap.txnTotal); errSeries.push(snap.errRate);
    if (tpsSeries.length > 60) { tpsSeries.shift(); errSeries.shift(); }
    // stat tiles
    $("st_tps").textContent = snap.txnTotal;
    $("tps").textContent = snap.txnTotal + " TPS";
    $("st_err").textContent = (snap.errRate * 100).toFixed(1) + "%";
    $("st_err").style.color = snap.errRate > 0.08 ? "var(--stop)" : snap.errRate > 0.04 ? "var(--warn)" : "var(--go)";
    var unhealthy = (d.agentB && d.agentB.nodes) ? d.agentB.nodes.length : 0;
    var totalNodes = Object.keys(snap.nodes).length;
    $("st_health").textContent = (totalNodes - unhealthy) + "/" + totalNodes;
    $("st_health").style.color = unhealthy ? "var(--warn)" : "var(--go)";
    drawChart();
    drawRC(snap);
    renderAgents(d);
    pushTicks(d);
    if (document.getElementById("map-view").classList.contains("active")) MAP.update(snap, d.agentB);
    if (document.getElementById("control").classList.contains("active")) renderNodeStatus();
    API.stats().then(function (s) { $("st_inc").textContent = s.open; });
  }

  /* ---- chart ---- */
  function drawChart() {
    var W = 700, H = 170, pad = 6;
    var n = tpsSeries.length; if (!n) return;
    var maxT = Math.max.apply(null, tpsSeries.concat([150]));
    var x = function (i) { return pad + (W - pad * 2) * (n <= 1 ? 0 : i / (n - 1)); };
    var yT = function (v) { return H - pad - (H - pad * 2) * (v / maxT); };
    var yE = function (v) { return H - pad - (H - pad * 2) * Math.min(1, v / 0.3); };
    var tp = tpsSeries.map(function (v, i) { return x(i) + "," + yT(v); }).join(" ");
    var ep = errSeries.map(function (v, i) { return x(i) + "," + yE(v); }).join(" ");
    var svg = '<polyline points="' + tp + '" fill="none" stroke="#35e0e0" stroke-width="2"/>' +
      '<polyline points="' + ep + '" fill="none" stroke="#ff4d6d" stroke-width="2"/>';
    $("chart").innerHTML = svg;
    $("chartMeta").textContent = "window " + n + " ticks";
  }
  function drawRC(snap) {
    var rcAgg = {};
    Object.keys(snap.perNode || {}).forEach(function (id) { var rc = snap.perNode[id].rc || {}; Object.keys(rc).forEach(function (k) { rcAgg[k] = (rcAgg[k] || 0) + rc[k]; }); });
    var keys = Object.keys(rcAgg).sort(function (a, b) { return rcAgg[b] - rcAgg[a]; });
    var names = AG.RC_NAMES || {};
    var ok = snap.txnTotal - snap.errTotal;
    var max = Math.max(1, ok, rcAgg[keys[0]] || 0);
    var html = '<div class="rcbar"><span class="rn">00 · Approved</span><div class="rt"><i style="width:' + (ok / max * 100) + '%;background:var(--go)"></i></div><span class="rv">' + ok + "</span></div>";
    html += keys.map(function (k) {
      var col = k === "68" || k === "91" || k === "96" ? "var(--stop)" : "var(--warn)";
      return '<div class="rcbar"><span class="rn">' + k + " · " + esc(names[k] || "") + '</span><div class="rt"><i style="width:' + (rcAgg[k] / max * 100) + '%;background:' + col + '"></i></div><span class="rv">' + rcAgg[k] + "</span></div>";
    }).join("");
    $("rcBars").innerHTML = html || '<div class="empty">—</div>';
  }

  /* ---- agents ---- */
  function renderAgents(d) {
    var a = d.agentA || [], b = d.agentB || { nodes: [] };
    // A
    if (a.length) {
      $("aA").className = "astate alert"; $("aA").textContent = a.length + " anomali";
      $("bodyA").innerHTML = a.map(function (f) {
        return '<div class="finding-line"><span>' + esc(NAMES[f.node] || f.node) + ' · RC ' + f.dominant_rc + '</span><span><span class="sev ' + f.severity + '">+' + f.spike_pct + '% · z' + f.z + '</span></span></div>';
      }).join("");
    } else { $("aA").className = "astate idle"; $("aA").textContent = "normal"; $("bodyA").textContent = "Pola error dalam ambang normal. Memantau EWMA + z-score per node…"; }
    // B
    if (b.nodes && b.nodes.length) {
      $("aB").className = "astate alert"; $("aB").textContent = b.nodes.length + " node";
      $("bodyB").innerHTML = b.nodes.map(function (n) {
        return '<div class="finding-line"><span>' + esc(NAMES[n.node] || n.node) + '</span><span class="mono" style="font-size:11px;color:var(--muted)">health ' + n.health + ' · ' + n.issues.map(function (i) { return i.k; }).join(",") + '</span></div>';
      }).join("") + '<div style="font-size:11px;color:' + (b.coreHealthy ? "var(--go)" : "var(--stop)") + ';margin-top:8px">core switch: ' + (b.coreHealthy ? "100% sehat" : "terbebani") + "</div>";
    } else { $("aB").className = "astate idle"; $("aB").textContent = "sehat"; $("bodyB").innerHTML = "Semua node dalam ambang sehat. Core switch: <span style='color:var(--go)'>100% sehat</span>."; }
    // C
    var inc = a.length ? AG.agentC(a, b, NAMES, "QRIS") : null;
    if (inc) {
      $("aC").className = "astate alert"; $("aC").textContent = "root cause";
      $("bodyC").innerHTML = '<div style="color:var(--text);font-weight:600;margin-bottom:6px">' + esc(inc.headline) + "</div><div>" + esc(inc.cause) + '</div><div style="margin-top:6px;color:var(--violet2)">→ ' + esc(inc.recommendation) + "</div>";
    } else { $("aC").className = "astate idle"; $("aC").textContent = "standby"; $("bodyC").textContent = "Tidak ada korelasi gangguan. Menunggu temuan dari Agent-A & Agent-B…"; }
  }

  /* ---- ticker ---- */
  function pushTicks(d) {
    // show a few representative error txns from this tick via perNode rc
    var snap = d.snapshot; var items = [];
    Object.keys(snap.perNode || {}).forEach(function (id) {
      var rc = snap.perNode[id].rc || {};
      Object.keys(rc).forEach(function (k) { if (k === "68" || k === "91" || k === "96") items.push({ id: id, rc: k, n: rc[k] }); });
    });
    if (!items.length) return;
    var tk = $("ticker"); if (tk.querySelector(".empty")) tk.innerHTML = "";
    items.slice(0, 2).forEach(function (it) {
      var div = document.createElement("div"); div.className = "tick";
      var col = "#ff4d6d";
      div.innerHTML = '<span class="tdot" style="background:' + col + '"></span><span>' + new Date().toLocaleTimeString("id-ID", { hour12: false }) + "</span><span style='color:var(--muted)'>" + esc(NAMES[it.id] || it.id) + " · RC " + it.rc + " ×" + it.n + "</span>";
      tk.insertBefore(div, tk.firstChild);
    });
    while (tk.children.length > 24) tk.removeChild(tk.lastChild);
  }

  /* ---- incidents ---- */
  function renderIncidents() {
    API.incidents().then(function (list) {
      if (!list.length) { $("incPane").innerHTML = '<div class="empty">Belum ada insiden. Buka tab Fault Injection untuk menginjeksi gangguan.</div>'; return; }
      $("incPane").innerHTML = list.map(function (inc) {
        var ev = inc.evidence || (inc.json ? safe(inc.json).evidence : null);
        return '<div class="incident ' + (inc.status === "resolved" ? "resolved" : "") + '">' +
          '<div class="ih"><div class="headline">' + esc(inc.headline) + '</div><span class="sev ' + (inc.severity || "high") + '">' + esc(inc.severity || "") + "</span></div>" +
          '<div class="narr">' + esc(inc.cause || "") + "</div>" +
          '<div class="rec"><div class="lbl">Rekomendasi</div>' + esc(inc.recommendation || "") + "</div>" +
          (ev ? '<div class="ev">Agent-A: RC ' + esc(ev.agentA ? ev.agentA.dominant_rc : "") + " +" + esc(ev.agentA ? ev.agentA.spike_pct : "") + "% · Agent-B: " + esc(ev.agentB && ev.agentB.issues ? ev.agentB.issues.map(function (i) { return i.k; }).join(",") : "within thresholds") + " · core " + (ev.core_healthy ? "healthy" : "stressed") + "</div>" : "") +
          '<div class="ih" style="margin-top:10px;align-items:center"><div class="meta">' + esc(inc.id) + " · " + esc(inc.ts || inc.detected_at || "") + " · confidence " + Math.round((inc.confidence || 0) * 100) + "%</div>" +
          (inc.status !== "resolved" ? '<button class="btn ghost sm" data-res="' + esc(inc.id) + '">Tandai selesai</button>' : '<span class="mono" style="font-size:10px;color:var(--go)">RESOLVED</span>') + "</div></div>";
      }).join("");
      $("incPane").querySelectorAll("[data-res]").forEach(function (b) { b.onclick = function () { API.resolve(b.dataset.res).then(function () { renderIncidents(); toast("Insiden ditandai selesai"); }); }; });
    });
  }
  function safe(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

  /* ---- control ---- */
  function renderNodeStatus() {
    if (!lastSnapshot) return;
    var snap = lastSnapshot;
    var rows = Object.keys(snap.nodes).map(function (id) {
      var m = snap.nodes[id];
      var h = AG.scoreHealth(m);
      var col = h >= 70 ? "var(--go)" : h >= 40 ? "var(--warn)" : "var(--stop)";
      return '<div class="finding-line"><span>' + esc(NAMES[id] || id) + '</span><span class="mono" style="font-size:11px">cpu ' + m.cpu + '% · mem ' + m.mem + '% · ' + m.latency + 'ms · hsm ' + m.hsmQueue + ' <span style="color:' + col + '">●</span></span></div>';
    }).join("");
    $("nodeStatus").innerHTML = rows;
  }

  /* ---- wire ---- */
  function fillNodeSelect() {
    $("c_node").innerHTML = TOPO.issuers().map(function (n) { return '<option value="' + n.id + '">' + esc(n.name) + " · " + esc(n.city) + "</option>"; }).join("");
  }
  $("btnInject").onclick = function () {
    var node = $("c_node").value, type = $("c_type").value, mag = parseFloat($("c_mag").value);
    API.inject(node, type, mag).then(function () { toast("Gangguan diinjeksi: " + NAMES[node] + " (" + type + ")"); });
  };
  $("btnClear").onclick = function () { API.clear().then(function () { toast("Semua gangguan dipulihkan"); }); };
  $("btnRefreshInc").onclick = renderIncidents;
  API.on("incident", function (inc) { toast("🚨 Insiden: " + inc.headline.slice(0, 60) + "…"); if (document.getElementById("incidents").classList.contains("active")) renderIncidents(); });

  /* ---- boot ---- */
  API.detect().then(function (mode) {
    setMode(mode);
    fillNodeSelect();
    API.on("tick", onTick);
    API.start();
    $("mapMeta").textContent = TOPO.issuers().length + " bank · 1 core switch";
  });
})();
