/* Multi-Agent RCA — tests. Author: Christina Apriani. */
"use strict";
const assert = require("assert");
const SIM = require("../src/simulator.js");
const AG = require("../src/agents.js");
const TOPO = require("../src/topology.js");

let pass = 0, fail = 0;
function t(n, fn) { try { fn(); pass++; console.log("  ✓ " + n); } catch (e) { fail++; console.log("  ✗ " + n + "\n      " + e.message); } }
const NAMES = {}; TOPO.NODES.forEach((n) => (NAMES[n.id] = n.name));

function warmAndFault(type) {
  let st = SIM.createState();
  for (let i = 0; i < 14; i++) SIM.tick(st, 135);
  SIM.injectFault(st, "BNK-SBY", type, 0.32);
  for (let i = 0; i < 20; i++) SIM.tick(st, 140);
  const a = AG.agentA(st.history);
  const b = AG.agentB(st.history[st.history.length - 1]);
  return { a, b, inc: AG.agentC(a, b, NAMES, "QRIS") };
}

console.log("\nMulti-agent RCA engine");

t("healthy baseline keeps false-positive rate low", () => {
  // A stochastic detector will not be perfectly silent; assert the rate is low.
  let st = SIM.createState();
  for (let i = 0; i < 12; i++) SIM.tick(st, 120);
  let flags = 0;
  for (let i = 0; i < 80; i++) { SIM.tick(st, 120); flags += AG.agentA(st.history).length; }
  assert.ok(flags / 80 < 0.1, "false-positive rate too high: " + flags + "/80");
});

t("memory fault -> Agent-A spike + Agent-B memory + Agent-C narrative", () => {
  const r = warmAndFault("memory");
  assert.ok(r.a.find((f) => f.node === "BNK-SBY"), "Agent-A missed the node");
  assert.ok(r.b.nodes.find((n) => n.node === "BNK-SBY" && n.issues.some((i) => i.k === "memory")), "Agent-B missed memory");
  assert.ok(r.inc, "no incident");
  assert.ok(/throttling/i.test(r.inc.recommendation), "no throttling recommendation");
  assert.ok(/memori/i.test(r.inc.cause), "cause should cite memory");
});

t("incident names the correct bank and RC", () => {
  const r = warmAndFault("memory");
  assert.strictEqual(r.inc.node, "BNK-SBY");
  assert.strictEqual(r.inc.node_name, "Bank Mandiri Jaya");
  assert.ok(["68", "96", "91"].indexOf(r.inc.dominant_rc) >= 0);
});

t("core stays healthy when only a bank is faulted", () => {
  const r = warmAndFault("memory");
  assert.strictEqual(r.b.coreHealthy, true);
});

t("timeout fault produces an incident even with infra within thresholds", () => {
  const r = warmAndFault("timeout");
  assert.ok(r.a.length > 0, "Agent-A should catch the timeout spike");
  assert.ok(r.inc, "Agent-C should still narrate");
});

t("metrics recover to healthy range after clearFaults", () => {
  let st = SIM.createState();
  for (let i = 0; i < 8; i++) SIM.tick(st, 120);
  SIM.injectFault(st, "BNK-MDN", "memory", 0.2);
  for (let i = 0; i < 8; i++) SIM.tick(st, 120);
  const peak = st.history[st.history.length - 1].nodes["BNK-MDN"].mem;
  SIM.clearFaults(st);
  for (let i = 0; i < 20; i++) SIM.tick(st, 120);
  const recovered = st.history[st.history.length - 1].nodes["BNK-MDN"].mem;
  assert.ok(peak > 80, "fault should raise memory (peak " + peak + ")");
  assert.ok(recovered < 70, "memory should recover after clear (now " + recovered + ")");
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
