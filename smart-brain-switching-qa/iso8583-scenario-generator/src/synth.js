/* ============================================================================
 * Smart Brain Switching QA — Scenario Synthesis Engine (Generative Logic)
 * Author: Christina Apriani
 *
 * Turns an analyzer signal (or a manual spec) into concrete, ready-to-fire
 * ISO 8583 test cases: happy path, boundary (1 below / at / 1 above a limit),
 * negative, and edge cases (interrupted transmission that must trigger an
 * auto-reversal). Each case carries the raw message, the decoded view, the
 * expected response code, and synthetic PIN/token material.
 *
 * Requires the iso8583 codec and the synthetic test-data module.
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./iso8583.js"), require("./testdata.js"));
  } else {
    root.ISOSynth = factory(root.ISO8583, root.ISOTestData);
  }
})(typeof self !== "undefined" ? self : this, function (ISO, TD) {
  "use strict";

  var CURRENCY_IDR = "360";
  var PROC_PURCHASE = "000000";

  function baseFields(opts) {
    opts = opts || {};
    var pan = opts.pan || TD.genPAN(opts.scheme || "gpn", 16, opts.seed);
    var f = {
      2: pan,
      3: opts.proc || PROC_PURCHASE,
      4: TD.amount(opts.amount || 0),
      7: TD.transmissionDTTM(),
      11: TD.genSTAN(opts.seed),
      12: TD.localTime(),
      13: TD.localDate(),
      18: opts.mcc || "4814",
      22: opts.entry || "071", // QR / contactless-ish test entry mode
      32: opts.acquirer || "360001",
      37: TD.genRRN(opts.seed),
      41: opts.tid || "QA000001",
      42: opts.mid || "QASANDBOXMID001",
      49: CURRENCY_IDR,
      52: TD.pinBlockMock(opts.pin || "1234", pan).mockEncrypted,
    };
    if (opts.token) f[62] = TD.tokenMock(opts.seed);
    if (opts.extraDE) Object.keys(opts.extraDE).forEach(function (k) { f[k] = opts.extraDE[k]; });
    return f;
  }

  function makeCase(title, category, mti, fields, expectedRC, note, extra) {
    var packed = ISO.pack({ mti: mti, fields: fields });
    var c = {
      id: "C" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      title: title,
      category: category,
      mti: mti,
      mti_name: ISO.MTI[mti] || mti,
      fields: fields,
      raw: packed.raw,
      bitmap: packed.bitmapHex,
      length: packed.length,
      expected_rc: expectedRC,
      expected_rc_name: ISO.RC[expectedRC] || "",
      note: note || "",
    };
    if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
    return c;
  }

  /* ---- boundary family: amounts around a limit ---- */
  function boundary(limit, opts) {
    opts = opts || {};
    limit = parseInt(limit, 10);
    var cases = [];
    cases.push(makeCase(
      "Amount 1 below limit (" + (limit - 1) + ")", "boundary", "0200",
      baseFields(Object.assign({}, opts, { amount: limit - 1, seed: 11 })), "00",
      "Tepat 1 rupiah di bawah limit — harus APPROVED."
    ));
    cases.push(makeCase(
      "Amount exactly at limit (" + limit + ")", "boundary", "0200",
      baseFields(Object.assign({}, opts, { amount: limit, seed: 12 })), "00",
      "Tepat di limit — perilaku batas, umumnya APPROVED (verifikasi spesifikasi)."
    ));
    cases.push(makeCase(
      "Amount 1 above limit (" + (limit + 1) + ")", "boundary", "0200",
      baseFields(Object.assign({}, opts, { amount: limit + 1, seed: 13 })), "61",
      "Tepat 1 rupiah di atas limit — harus DITOLAK dengan RC 61."
    ));
    return cases;
  }

  /* ---- field presence family ---- */
  function fieldPresence(de, opts) {
    opts = opts || {};
    var withDE = baseFields(Object.assign({}, opts, { amount: 50000, seed: 21, extraDE: setDE({}, de) }));
    var without = baseFields(Object.assign({}, opts, { amount: 50000, seed: 22 }));
    var malformed = baseFields(Object.assign({}, opts, { amount: 50000, seed: 23, extraDE: setDE({}, de, "X") }));
    return [
      makeCase("With DE-" + de + " present", "field_presence", "0200", withDE, "00", "DE-" + de + " (" + ISO.describe(de) + ") hadir dan valid."),
      makeCase("Without DE-" + de, "field_presence", "0200", without, "30", "DE-" + de + " absen — uji penanganan field wajib (RC 30 format error jika wajib)."),
      makeCase("Malformed DE-" + de, "field_presence", "0200", malformed, "30", "DE-" + de + " berisi nilai tidak valid — uji validasi format."),
    ];
  }
  function setDE(obj, de, override) {
    obj[de] = override != null ? override : (de === 62 ? TD.tokenMock(7) : de === 48 || de === 60 ? "QRIS-TEST-PAYLOAD" : "000");
    return obj;
  }

  /* ---- routing family ---- */
  function routing(opts) {
    opts = opts || {};
    var schemes = ["gpn", "visa", "mastercard", "jcb"];
    return schemes.map(function (s, i) {
      return makeCase(
        "Route via " + s.toUpperCase() + " BIN", "routing", "0200",
        baseFields(Object.assign({}, opts, { amount: 75000, scheme: s, seed: 30 + i })), "00",
        "Exercise routing untuk BIN " + s.toUpperCase() + "."
      );
    });
  }

  /* ---- reversal / interrupted transmission (the edge case) ---- */
  function reversal(opts) {
    opts = opts || {};
    var pan = TD.genPAN(opts.scheme || "gpn", 16, 41);
    var original = baseFields(Object.assign({}, opts, { amount: opts.amount || 150000, pan: pan, seed: 41 }));
    var orig = makeCase(
      "Original financial request (0200)", "reversal", "0200", original, "", "Transaksi awal yang akan diinterupsi."
    );
    // interrupt mid-transmission: cut the raw at a byte inside a later DE
    var cut = Math.floor(orig.raw.length * 0.72);
    var partial = orig.raw.slice(0, cut);
    var interrupted = {
      id: "C" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      title: "Interrupted transmission (connection drop)",
      category: "edge",
      mti: "0200",
      mti_name: "Financial Request (truncated)",
      raw: partial,
      full_raw: orig.raw,
      cut_at: cut,
      length: partial.length,
      expected_rc: "",
      note:
        "Koneksi terputus di tengah transmisi (byte " + cut + " dari " + orig.raw.length +
        "). Switch harus mendeteksi pesan tidak lengkap dan memicu AUTO-REVERSAL.",
      transmission: "interrupted",
    };
    // the expected auto-reversal 0400 the switch should emit
    var de90 =
      original[11] /*stan*/ + TD.amount(original[4]).slice(-12) ;
    var revFields = {
      2: original[2], 3: original[3], 4: original[4], 7: TD.transmissionDTTM(),
      11: TD.genSTAN(42), 32: original[32], 37: original[37], 39: "", 41: original[41], 49: original[49],
      90: (original[11] + "0200" + original[11] + original[7]).slice(0, 42).padEnd(42, "0"),
    };
    var rev = makeCase(
      "Expected auto-reversal (0400)", "reversal", "0400", revFields, "00",
      "Pembatalan otomatis yang harus dikirim switch setelah mendeteksi transmisi gagal. DE-90 mereferensikan transaksi asli."
    );
    return [orig, interrupted, rev];
  }

  /* ---- security family ---- */
  function security(opts) {
    opts = opts || {};
    var pan = TD.genPAN(opts.scheme || "gpn", 16, 51);
    var good = baseFields(Object.assign({}, opts, { amount: 60000, pan: pan, pin: "1357", seed: 51 }));
    var bad = baseFields(Object.assign({}, opts, { amount: 60000, pan: pan, pin: "1357", seed: 52 }));
    bad[52] = "FFFFFFFFFFFFFFFF"; // corrupted PIN block
    return [
      makeCase("Valid synthetic PIN block", "security", "0200", good, "00", "PIN block tiruan valid (format-0 sintetis)."),
      makeCase("Corrupted PIN block", "security", "0200", bad, "55", "PIN block rusak — harus RC 55 (incorrect PIN)."),
    ];
  }

  /* ---- top-level: build a suite from an analyzer signal ---- */
  function fromSignal(signal, opts) {
    opts = opts || {};
    var cases = [];
    var name = signal.label;
    switch (signal.family) {
      case "boundary":
        var limit = (signal.literals && signal.literals[0]) || opts.limit || 2000000;
        cases = boundary(limit, opts);
        name = "Boundary suite · limit " + limit;
        break;
      case "field_presence":
        var de = (signal.literals && signal.literals[0]) || opts.de || 62;
        cases = fieldPresence(de, opts);
        name = "Field-presence suite · DE-" + de;
        break;
      case "routing":
        cases = routing(opts);
        name = "Routing suite";
        break;
      case "reversal":
        cases = reversal(opts);
        name = "Reversal / auto-reversal suite";
        break;
      case "security":
        cases = security(opts);
        name = "Security (PIN/token) suite";
        break;
      default:
        cases = boundary(opts.limit || 2000000, opts);
    }
    return {
      id: "S" + Date.now().toString(36).toUpperCase(),
      name: name,
      family: signal.family,
      signal: signal,
      generated_at: new Date().toISOString(),
      author: "Christina Apriani / Synthesis Engine",
      cases: cases,
    };
  }

  // Build suites for every signal in an analysis, plus a merged happy/negative core.
  function fromAnalysis(analysis, opts) {
    var suites = (analysis.signals || []).map(function (s) { return fromSignal(s, opts); });
    return suites;
  }

  return {
    baseFields: baseFields,
    boundary: boundary,
    fieldPresence: fieldPresence,
    routing: routing,
    reversal: reversal,
    security: security,
    fromSignal: fromSignal,
    fromAnalysis: fromAnalysis,
  };
});
