/* ============================================================================
 * Smart Brain Switching QA — Interbank Topology
 * Author: Christina Apriani
 *
 * The switching network: a central core switch plus connected issuer/acquirer
 * banks across Indonesia, each with live infrastructure metrics. Shared by the
 * Node backend and the browser (UMD) so the map and the agents see one model.
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RCATopology = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // role: hub = internal core switch; issuer = destination bank.
  var NODES = [
    { id: "CORE", name: "Core Switch (Pusat)", city: "Jakarta", lat: -6.2146, lng: 106.8451, role: "hub", weight: 0 },
    { id: "BNK-NUS", name: "Bank Nusantara", city: "Jakarta", lat: -6.1751, lng: 106.865, role: "issuer", weight: 26 },
    { id: "BNK-SBY", name: "Bank Mandiri Jaya", city: "Surabaya", lat: -7.2575, lng: 112.7521, role: "issuer", weight: 18 },
    { id: "BNK-MDN", name: "Bank Andalas", city: "Medan", lat: 3.5952, lng: 98.6722, role: "issuer", weight: 12 },
    { id: "BNK-BDG", name: "Bank Parahyangan", city: "Bandung", lat: -6.9175, lng: 107.6191, role: "issuer", weight: 15 },
    { id: "BNK-MKS", name: "Bank Celebes", city: "Makassar", lat: -5.1477, lng: 119.4327, role: "issuer", weight: 9 },
    { id: "BNK-DPS", name: "Bank Dewata", city: "Denpasar", lat: -8.6705, lng: 115.2126, role: "issuer", weight: 10 },
    { id: "BNK-PLG", name: "Bank Sriwijaya", city: "Palembang", lat: -2.9761, lng: 104.7754, role: "issuer", weight: 10 },
  ];

  // Baseline healthy metrics per node.
  function baseMetrics() {
    return {
      cpu: 35 + Math.random() * 15, // %
      mem: 40 + Math.random() * 15, // %
      latency: 60 + Math.random() * 40, // ms to the bank
      hsmQueue: Math.floor(Math.random() * 4), // pending HSM ops
    };
  }

  function issuers() {
    return NODES.filter(function (n) { return n.role === "issuer"; });
  }
  function byId(id) {
    return NODES.find(function (n) { return n.id === id; });
  }

  return { NODES: NODES, baseMetrics: baseMetrics, issuers: issuers, byId: byId };
});
