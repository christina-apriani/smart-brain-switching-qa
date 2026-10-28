/* ============================================================================
 * ISO 8583 Scenario & Data Generator — Synthetic Test Data
 * Author: Christina Apriani
 *
 * Generates QA-only synthetic values. Nothing here is real cardholder data or
 * production cryptographic material:
 *   - PANs use documented TEST BIN ranges and a valid Luhn check digit so the
 *     switch accepts the format, but they are not issued cards.
 *   - The "PIN block" is a format-0 CLEAR block assembled from a test PIN and
 *     test PAN (public ISO 9564 structure) and the "encrypted" field is a
 *     clearly-labelled MOCK token — no production key is used or derivable.
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ISOTestData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Documented test BINs (sandbox ranges commonly used for QA).
  var TEST_BINS = {
    visa: "411111",
    mastercard: "555555",
    jcb: "356000",
    gpn: "508000", // GPN / domestic test range
    amex: "378282",
  };

  function luhnCheckDigit(partial) {
    var sum = 0, alt = true;
    for (var i = partial.length - 1; i >= 0; i--) {
      var d = parseInt(partial[i], 10);
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d; alt = !alt;
    }
    return (10 - (sum % 10)) % 10;
  }
  function luhnValid(pan) {
    var sum = 0, alt = false;
    for (var i = pan.length - 1; i >= 0; i--) {
      var d = parseInt(pan[i], 10);
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d; alt = !alt;
    }
    return sum % 10 === 0;
  }

  var _seq = 1;
  function rngDigits(n, seed) {
    // deterministic-ish pseudo digits for reproducible suites
    var s = (seed || Date.now()) + _seq++;
    var out = "";
    for (var i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      out += (s % 10).toString();
    }
    return out;
  }

  // Generate a Luhn-valid synthetic PAN for a scheme (length default 16).
  function genPAN(scheme, length, seed) {
    var bin = TEST_BINS[scheme] || TEST_BINS.visa;
    length = length || 16;
    var body = bin + rngDigits(length - bin.length - 1, seed);
    body = body.slice(0, length - 1);
    return body + luhnCheckDigit(body);
  }

  function genSTAN(seed) { return rngDigits(6, seed); }
  function genRRN(seed) {
    // RRN: yddhhmmssNN style (12 an) — synthetic
    return rngDigits(12, seed);
  }
  function now14() {
    var d = new Date();
    var p = function (x, n) { return String(x).padStart(n, "0"); };
    return p(d.getFullYear(), 4) + p(d.getMonth() + 1, 2) + p(d.getDate(), 2) +
      p(d.getHours(), 2) + p(d.getMinutes(), 2) + p(d.getSeconds(), 2);
  }
  function transmissionDTTM() {
    // DE7: MMDDhhmmss
    var d = new Date();
    var p = function (x) { return String(x).padStart(2, "0"); };
    return p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function localTime() { var d = new Date(); var p = function (x) { return String(x).padStart(2, "0"); }; return p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
  function localDate() { var d = new Date(); var p = function (x) { return String(x).padStart(2, "0"); }; return p(d.getMonth() + 1) + p(d.getDate()); }

  // DE4 amount is n12, minor units (no decimal). 1 rupiah = "000000000001"
  function amount(rupiah) {
    var v = Math.max(0, Math.round(Number(rupiah) || 0));
    return String(v).padStart(12, "0");
  }

  // Format-0 CLEAR PIN block (ISO 9564-1) from test PIN + PAN. SYNTHETIC ONLY.
  // Returns {clear, mockEncrypted} — mockEncrypted is a labelled placeholder,
  // never a real cryptogram.
  function pinBlockMock(pin, pan) {
    pin = String(pin || "1234");
    var p1 = "0" + pin.length + pin;
    p1 = (p1 + "FFFFFFFFFFFFFF").slice(0, 16);
    // PAN block: 0000 + 12 rightmost PAN digits excluding check digit
    var panDigits = String(pan || "0000000000000000").replace(/\D/g, "");
    var p2core = panDigits.slice(-13, -1);
    var p2 = ("0000" + p2core).slice(0, 16);
    var clear = "";
    for (var i = 0; i < 16; i++) {
      clear += (parseInt(p1[i], 16) ^ parseInt(p2[i], 16)).toString(16).toUpperCase();
    }
    // Mock "encrypted" field: deterministic scramble, explicitly non-cryptographic.
    var mock = "";
    for (var j = 0; j < 16; j++) {
      mock += ((parseInt(clear[j], 16) + 7 + j) % 16).toString(16).toUpperCase();
    }
    return { clear: clear, mockEncrypted: mock, note: "MOCK PIN block — synthetic, no production key" };
  }

  // Mock token (QRIS/3DS style) — clearly synthetic.
  function tokenMock(seed) {
    var hex = "0123456789ABCDEF", s = (seed || Date.now()) + _seq++, out = "MOCK-";
    for (var i = 0; i < 20; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; out += hex[s % 16]; }
    return out;
  }

  return {
    TEST_BINS: TEST_BINS,
    luhnCheckDigit: luhnCheckDigit, luhnValid: luhnValid,
    genPAN: genPAN, genSTAN: genSTAN, genRRN: genRRN,
    amount: amount, transmissionDTTM: transmissionDTTM, localTime: localTime, localDate: localDate, now14: now14,
    pinBlockMock: pinBlockMock, tokenMock: tokenMock,
  };
});
