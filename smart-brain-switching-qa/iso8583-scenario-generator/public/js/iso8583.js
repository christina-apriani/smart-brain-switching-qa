/* ============================================================================
 * ISO 8583 Scenario & Data Generator — Core Message Codec
 * Author: Christina Apriani
 *
 * A real ISO 8583 (1987) packer / unpacker. Builds and parses raw messages:
 * MTI, primary/secondary bitmap, and data elements with correct length
 * discipline (fixed, LLVAR, LLLVAR). Pure module, shared by the Node backend
 * and the browser via UMD so encode/decode never diverges between them.
 *
 * Scope: test-harness data only. All PAN/PIN material produced by the sibling
 * modules is synthetic and clearly marked; this codec just structures it.
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ISO8583 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Data element dictionary (subset covering card-present, QRIS, and switching).
  // type: n numeric, a alpha, an alnum, ans alnum+special, b binary(hex), z track
  // len:  fixed length OR max length for variable
  // var:  null fixed | 2 LLVAR | 3 LLLVAR
  var DICT = {
    2: { name: "Primary Account Number (PAN)", type: "n", len: 19, var: 2 },
    3: { name: "Processing Code", type: "n", len: 6, var: null },
    4: { name: "Amount, Transaction", type: "n", len: 12, var: null },
    5: { name: "Amount, Settlement", type: "n", len: 12, var: null },
    7: { name: "Transmission Date & Time", type: "n", len: 10, var: null },
    11: { name: "System Trace Audit Number (STAN)", type: "n", len: 6, var: null },
    12: { name: "Time, Local Transaction", type: "n", len: 6, var: null },
    13: { name: "Date, Local Transaction", type: "n", len: 4, var: null },
    14: { name: "Date, Expiration", type: "n", len: 4, var: null },
    15: { name: "Date, Settlement", type: "n", len: 4, var: null },
    18: { name: "Merchant Category Code (MCC)", type: "n", len: 4, var: null },
    22: { name: "POS Entry Mode", type: "n", len: 3, var: null },
    23: { name: "Card Sequence Number", type: "n", len: 3, var: null },
    25: { name: "POS Condition Code", type: "n", len: 2, var: null },
    32: { name: "Acquiring Institution ID", type: "n", len: 11, var: 2 },
    33: { name: "Forwarding Institution ID", type: "n", len: 11, var: 2 },
    35: { name: "Track 2 Data", type: "z", len: 37, var: 2 },
    37: { name: "Retrieval Reference Number (RRN)", type: "an", len: 12, var: null },
    38: { name: "Authorization ID Response", type: "an", len: 6, var: null },
    39: { name: "Response Code", type: "an", len: 2, var: null },
    41: { name: "Card Acceptor Terminal ID", type: "ans", len: 8, var: null },
    42: { name: "Card Acceptor ID (Merchant)", type: "ans", len: 15, var: null },
    43: { name: "Card Acceptor Name/Location", type: "ans", len: 40, var: null },
    48: { name: "Additional Data (Private)", type: "ans", len: 999, var: 3 },
    49: { name: "Currency Code, Transaction", type: "n", len: 3, var: null },
    52: { name: "PIN Data (PIN Block)", type: "b", len: 16, var: null },
    53: { name: "Security Related Control Info", type: "n", len: 16, var: null },
    54: { name: "Additional Amounts", type: "an", len: 120, var: 3 },
    55: { name: "ICC / EMV Data", type: "b", len: 999, var: 3 },
    60: { name: "Private (QRIS Payload / Reserved)", type: "ans", len: 999, var: 3 },
    61: { name: "Private (CPM/MPM Indicator)", type: "ans", len: 999, var: 3 },
    62: { name: "Private (Token / Reference)", type: "ans", len: 999, var: 3 },
    63: { name: "Private Reserved", type: "ans", len: 999, var: 3 },
    70: { name: "Network Management Info Code", type: "n", len: 3, var: null },
    90: { name: "Original Data Elements (Reversal)", type: "n", len: 42, var: null },
  };

  function pad(v, n, ch, right) {
    v = String(v);
    while (v.length < n) v = right ? v + ch : ch + v;
    return v.slice(0, n);
  }

  // ---- bitmap ----
  function buildBitmap(fields) {
    var nums = Object.keys(fields).map(Number).filter(function (n) { return n >= 2; });
    var hasSecondary = nums.some(function (n) { return n > 64; });
    var bits = new Array(hasSecondary ? 128 : 64).fill(0);
    if (hasSecondary) bits[0] = 1; // DE1 flags secondary bitmap present
    nums.forEach(function (n) { if (n >= 2 && n <= bits.length) bits[n - 1] = 1; });
    return bits;
  }
  function bitsToHex(bits) {
    var hex = "";
    for (var i = 0; i < bits.length; i += 4) {
      var nib = bits[i] * 8 + bits[i + 1] * 4 + bits[i + 2] * 2 + bits[i + 3];
      hex += nib.toString(16).toUpperCase();
    }
    return hex;
  }
  function hexToBits(hex) {
    var bits = [];
    for (var i = 0; i < hex.length; i++) {
      var nib = parseInt(hex[i], 16);
      bits.push((nib >> 3) & 1, (nib >> 2) & 1, (nib >> 1) & 1, nib & 1);
    }
    return bits;
  }

  // ---- encode one field ----
  function encodeField(de, value) {
    var d = DICT[de];
    if (!d) throw new Error("Unknown DE " + de);
    var v = String(value);
    if (!d.var) {
      // fixed: numeric right-justified zero fill; others left-justified space fill
      if (d.type === "n") v = pad(v, d.len, "0", false);
      else if (d.type === "b") v = pad(v, d.len, "0", true);
      else v = pad(v, d.len, " ", true);
      return v;
    }
    var lenDigits = d.var; // 2 or 3
    var prefix = pad(v.length, lenDigits, "0", false);
    return prefix + v;
  }

  // ---- pack ----
  // msg = { mti: "0200", fields: { 2: "...", 4: "...", ... } }
  function pack(msg) {
    var bits = buildBitmap(msg.fields);
    var bitmapHex = bitsToHex(bits);
    var body = "";
    var present = Object.keys(msg.fields).map(Number).sort(function (a, b) { return a - b; });
    present.forEach(function (de) {
      if (de < 2) return;
      body += encodeField(de, msg.fields[de]);
    });
    var raw = msg.mti + bitmapHex + body;
    return { raw: raw, bitmapHex: bitmapHex, bitmapBits: bits, length: raw.length };
  }

  // ---- unpack ----
  function unpack(raw) {
    var p = 0;
    var mti = raw.slice(p, p + 4); p += 4;
    var primHex = raw.slice(p, p + 16); p += 16;
    var bits = hexToBits(primHex);
    var usedHex = primHex;
    if (bits[0] === 1) {
      var secHex = raw.slice(p, p + 16); p += 16;
      bits = bits.concat(hexToBits(secHex));
      usedHex += secHex;
    }
    var fields = {};
    for (var i = 1; i < bits.length; i++) {
      if (bits[i] !== 1) continue;
      var de = i + 1;
      var d = DICT[de];
      if (!d) { fields[de] = "<no-def>"; continue; }
      var val;
      if (!d.var) {
        val = raw.slice(p, p + d.len); p += d.len;
      } else {
        var lenStr = raw.slice(p, p + d.var); p += d.var;
        var ln = parseInt(lenStr, 10) || 0;
        val = raw.slice(p, p + ln); p += ln;
      }
      fields[de] = val;
    }
    return { mti: mti, bitmapHex: usedHex, fields: fields, consumed: p };
  }

  function describe(de) { return DICT[de] ? DICT[de].name : "Unknown DE " + de; }

  // Pretty structured decode for UI
  function decodeDetailed(raw) {
    var u = unpack(raw);
    var rows = Object.keys(u.fields).map(Number).sort(function (a, b) { return a - b; }).map(function (de) {
      return { de: de, name: describe(de), type: (DICT[de] || {}).type || "?", value: u.fields[de] };
    });
    return { mti: u.mti, bitmapHex: u.bitmapHex, fields: rows };
  }

  var MTI = {
    "0100": "Authorization Request",
    "0110": "Authorization Response",
    "0200": "Financial Request",
    "0210": "Financial Response",
    "0220": "Financial Advice",
    "0400": "Reversal Request",
    "0410": "Reversal Response",
    "0420": "Reversal Advice",
    "0800": "Network Management Request",
    "0810": "Network Management Response",
  };

  var RC = {
    "00": "Approved / Completed",
    "05": "Do Not Honor",
    "12": "Invalid Transaction",
    "13": "Invalid Amount",
    "14": "Invalid Card Number",
    "51": "Insufficient Funds",
    "54": "Expired Card",
    "55": "Incorrect PIN",
    "61": "Exceeds Withdrawal Limit",
    "68": "Response Received Too Late (Timeout)",
    "91": "Issuer or Switch Inoperative",
    "96": "System Malfunction",
  };

  return {
    DICT: DICT, MTI: MTI, RC: RC,
    pack: pack, unpack: unpack, decodeDetailed: decodeDetailed,
    describe: describe, buildBitmap: buildBitmap, bitsToHex: bitsToHex, encodeField: encodeField,
  };
});
