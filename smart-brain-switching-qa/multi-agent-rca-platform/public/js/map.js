/* ============================================================================
 * Multi-Agent RCA Platform — Live Network Map (Leaflet + OpenStreetMap)
 * Author: Christina Apriani
 *
 * Plots the core switch and connected banks, draws interconnection links, and
 * updates each node's colour by live health. A faulted node pulses red. Falls
 * back to a notice if tiles cannot load; the dashboard keeps working.
 * ==========================================================================*/
(function (root) {
  "use strict";
  var map = null, markers = {}, links = {}, inited = false, core = null;

  function color(health) { return health >= 70 ? "#2ee6a0" : health >= 40 ? "#ffb020" : "#ff4d6d"; }

  function nodeIcon(node, health, faulted) {
    var c = node.role === "hub" ? "#8b7bff" : color(health);
    var size = node.role === "hub" ? 26 : 20;
    var pulse = faulted ? '<div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ' + c + ';animation:ping 1.1s infinite"></div>' : "";
    return L.divIcon({
      className: "node-pin", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      html: '<div style="position:relative">' + pulse +
        '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:' + (node.role === "hub" ? "7px" : "50%") + ';background:' + c +
        ';border:2px solid #0a0c16;box-shadow:0 0 12px ' + c + '">' + (node.role === "hub" ? '<div style="color:#0a0714;font-weight:900;font-size:11px;text-align:center;line-height:' + (size - 4) + 'px">C</div>' : "") + "</div></div>",
    });
  }

  var MapMod = {
    init: function (nodes) {
      if (inited || typeof L === "undefined") { if (typeof L === "undefined") { var el = document.getElementById("map"); if (el) el.innerHTML = '<div class="empty">Peta tidak dapat dimuat (library offline).</div>'; } return; }
      core = nodes.find(function (n) { return n.role === "hub"; });
      try {
        map = L.map("map", { zoomControl: true }).setView([-3.2, 118], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
        nodes.forEach(function (n) {
          if (n.role !== "hub" && core) {
            links[n.id] = L.polyline([[core.lat, core.lng], [n.lat, n.lng]], { color: "#2c3050", weight: 2, opacity: .7 }).addTo(map);
          }
          markers[n.id] = L.marker([n.lat, n.lng], { icon: nodeIcon(n, 100, false) }).addTo(map).bindPopup("<b>" + n.name + "</b><br>" + n.city + " · " + n.id);
          markers[n.id]._node = n;
        });
        inited = true;
        setTimeout(function () { map.invalidateSize(); }, 200);
      } catch (e) {
        var el2 = document.getElementById("map"); if (el2) el2.innerHTML = '<div class="empty">Peta tidak dapat dimuat (tile offline). Fungsi monitoring tetap berjalan.</div>';
      }
    },
    refresh: function () { if (map) setTimeout(function () { map.invalidateSize(); }, 150); },
    update: function (snapshot, agentB) {
      if (!map || !snapshot) return;
      var unhealthy = {}; ((agentB && agentB.nodes) || []).forEach(function (n) { unhealthy[n.node] = n.health; });
      var faults = {}; (snapshot.activeFaults || []).forEach(function (f) { faults[f] = 1; });
      Object.keys(markers).forEach(function (id) {
        var n = markers[id]._node;
        if (n.role === "hub") return;
        var m = snapshot.nodes[id]; if (!m) return;
        var health = agentBHealth(agentB, id, m);
        markers[id].setIcon(nodeIcon(n, health, !!faults[id]));
        if (links[id]) links[id].setStyle({ color: faults[id] ? "#ff4d6d" : "#2c3050", weight: faults[id] ? 3 : 2, opacity: faults[id] ? .9 : .6 });
      });
    },
  };
  function agentBHealth(agentB, id, m) {
    var f = agentB && agentB.nodes && agentB.nodes.find(function (n) { return n.node === id; });
    if (f) return f.health;
    // compute a quick health if not flagged
    var s = 100; s -= Math.max(0, m.mem - 60) * 0.8; s -= Math.max(0, m.cpu - 60) * 0.7; s -= Math.max(0, (m.latency - 150) / 20); return Math.max(0, Math.round(s));
  }
  // inject ping keyframes
  var style = document.createElement("style");
  style.textContent = "@keyframes ping{0%{transform:scale(1);opacity:.8}100%{transform:scale(2.2);opacity:0}}";
  document.head.appendChild(style);

  root.RCAMap = MapMod;
})(window);
