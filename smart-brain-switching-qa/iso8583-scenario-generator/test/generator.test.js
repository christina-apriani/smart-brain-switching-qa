/* ISO 8583 Scenario Generator — tests. Author: Christina Apriani. */
"use strict";
const assert = require("assert");
const ISO = require("../src/iso8583.js");
const TD = require("../src/testdata.js");
const AN = require("../src/analyzer.js");
const SY = require("../src/synth.js");

let pass = 0, fail = 0;
function t(n, fn) { try { fn(); pass++; console.log("  ✓ " + n); } catch (e) { fail++; console.log("  ✗ " + n + "\n      " + e.message); } }

console.log("\nISO 8583 generator");

t("pack/unpack round-trip preserves MTI and fields", () => {
  const pan = TD.genPAN("gpn", 16, 1);
  const f = { 2: pan, 3: "000000", 4: TD.amount(123456), 11: TD.genSTAN(1), 39: "00" };
  const p = ISO.pack({ mti: "0210", fields: f });
  const u = ISO.unpack(p.raw);
  assert.strictEqual(u.mti, "0210");
  assert.strictEqual(u.fields[2], pan);
  assert.strictEqual(u.fields[4], "000000123456");
  assert.strictEqual(u.fields[39], "00");
});

t("synthetic PAN is Luhn valid", () => {
  for (const s of ["gpn", "visa", "mastercard"]) assert.ok(TD.luhnValid(TD.genPAN(s, 16, 2)), s + " not Luhn valid");
});

t("amount encodes to n12 minor units", () => {
  assert.strictEqual(TD.amount(1), "000000000001");
  assert.strictEqual(TD.amount(2000000), "000002000000");
});

t("analyzer detects limit change and prefers added value", () => {
  const a = AN.analyze(AN.SAMPLES.qris_limit.code);
  const lim = a.signals.find((s) => s.family === "boundary");
  assert.ok(lim, "no boundary signal");
  assert.strictEqual(lim.literals[0], 2000000); // new (+) value first
});

t("boundary synth produces limit-1/at/limit+1 with correct expected RC", () => {
  const cases = SY.boundary(2000000, {});
  assert.strictEqual(cases.length, 3);
  assert.strictEqual(ISO.unpack(cases[0].raw).fields[4], TD.amount(1999999));
  assert.strictEqual(ISO.unpack(cases[2].raw).fields[4], TD.amount(2000001));
  assert.strictEqual(cases[2].expected_rc, "61");
});

t("reversal suite yields interrupted case + 0400 auto-reversal", () => {
  const r = SY.reversal({});
  assert.ok(r.find((c) => c.transmission === "interrupted"), "no interrupted case");
  const rev = r.find((c) => c.mti === "0400");
  assert.ok(rev, "no 0400");
  assert.ok(rev.fields[90], "reversal missing DE-90 original data");
});

t("analyzer detects new DE field", () => {
  const a = AN.analyze(AN.SAMPLES.new_de.code);
  const f = a.signals.find((s) => s.family === "field_presence");
  assert.ok(f, "no field_presence signal");
  assert.ok(f.literals.indexOf(62) >= 0, "DE62 not detected");
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
