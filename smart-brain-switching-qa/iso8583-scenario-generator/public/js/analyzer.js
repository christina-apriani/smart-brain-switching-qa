/* ============================================================================
 * Smart Brain Switching QA — Source Code Analyzer (Reverse Engineering)
 * Author: Christina Apriani
 *
 * Scans a code change (a diff or a source snippet from the core switching
 * repository) and detects what behaviour changed: transaction-limit handling,
 * a new data element, routing logic, reversal/timeout handling, PIN/token
 * handling. Each detected signal carries a recommended test-scenario family so
 * the synthesis engine can turn it into concrete ISO 8583 messages.
 *
 * The detector is heuristic/pattern based and fully deterministic. In a
 * production deployment the same signal contract is produced by a banking LLM;
 * this module is the pluggable reference implementation.
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ISOAnalyzer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Each rule: id, label, regex signals, and the scenario family it triggers.
  var RULES = [
    {
      id: "limit",
      label: "Transaction limit / threshold logic",
      family: "boundary",
      hint: "Generate amount cases exactly 1 below, at, and 1 above the limit.",
      patterns: [
        /limit|max[_-]?amount|threshold|plafon|ceiling/i,
        /QRIS[_\s-]*(CPM|MPM)/i,
        /\bamount\s*(>=|<=|>|<|===?)/i,
        /\bDE\s*-?\s*4\b|\bfield\s*4\b/i,
      ],
      extract: function (code) {
        // Prefer limits on added (+) lines: a diff's new value is what we test around.
        var added = [], other = [];
        code.split(/\r?\n/).forEach(function (ln) {
          var re = /(?:limit|max[_-]?amount|threshold|plafon)\s*[:=]\s*([0-9_]{3,})/gi;
          var m;
          while ((m = re.exec(ln))) {
            var val = parseInt(m[1].replace(/_/g, ""), 10);
            if (/^\s*\+/.test(ln)) added.push(val);
            else other.push(val);
          }
        });
        return added.length ? added.concat(other) : other; // new value first
      },
    },
    {
      id: "newfield",
      label: "New / changed data element",
      family: "field_presence",
      hint: "Generate messages with and without the new DE, plus malformed-length cases.",
      patterns: [
        /\b(addField|setField|putDE|bitmap\.set|fields\[)\s*\(?\s*(\d{1,3})/i,
        /\bDE\s*-?\s*(48|52|55|60|61|62|63)\b/i,
        /\b(token|qr[_-]?payload|emv|icc)\b/i,
      ],
      extract: function (code) {
        var out = [];
        var re = /\b(?:DE\s*-?\s*|field\s*|fields\[)\s*(\d{1,3})/gi;
        var m;
        while ((m = re.exec(code))) {
          var de = parseInt(m[1], 10);
          if (de >= 2 && de <= 128) out.push(de);
        }
        return Array.from(new Set(out));
      },
    },
    {
      id: "routing",
      label: "Routing / issuer selection change",
      family: "routing",
      hint: "Generate messages across BIN ranges and acquirer IDs to exercise each route.",
      patterns: [
        /\b(route|routing|router|selectIssuer|binTable|switchTo|destination)\b/i,
        /\bBIN\b|\bissuer\b|\bacquir/i,
      ],
      extract: function () { return []; },
    },
    {
      id: "reversal",
      label: "Reversal / timeout / auto-reversal handling",
      family: "reversal",
      hint: "Generate interrupted-transmission and late-response cases; expect 0400 auto-reversal.",
      patterns: [
        /\b(reversal|auto[-_ ]?reversal|rollback|0400|timeout|RC\s*68|response.?too.?late)\b/i,
        /\b(advice|retransmit|stand[-_ ]?in|STIP)\b/i,
      ],
      extract: function () { return []; },
    },
    {
      id: "security",
      label: "PIN / token / crypto handling",
      family: "security",
      hint: "Generate valid and corrupted PIN-block / token cases.",
      patterns: [/\b(pinblock|pin[_-]?block|hsm|zpk|mac|token|3ds|encrypt|cvv|cvm)\b/i],
      extract: function () { return []; },
    },
  ];

  function analyze(code) {
    code = String(code || "");
    var signals = [];
    RULES.forEach(function (rule) {
      var hits = rule.patterns.filter(function (p) { return p.test(code); }).length;
      if (!hits) return;
      var literals = rule.extract(code) || [];
      signals.push({
        id: rule.id,
        label: rule.label,
        family: rule.family,
        hint: rule.hint,
        confidence: Math.min(0.98, 0.55 + hits * 0.14),
        matches: hits,
        literals: literals,
      });
    });
    // sort by confidence desc
    signals.sort(function (a, b) { return b.confidence - a.confidence; });
    return {
      analyzed_at: new Date().toISOString(),
      lines: code.split(/\r?\n/).length,
      signals: signals,
      summary: signals.length
        ? signals.length + " change signal(s) detected across " + code.split(/\r?\n/).length + " lines."
        : "No behavioural change signals detected.",
    };
  }

  // Sample diffs so the UI can demonstrate detection instantly.
  var SAMPLES = {
    qris_limit: {
      label: "QRIS CPM limit raised",
      code:
        "// core-switch/qris/cpm.js\n" +
        "- const QRIS_CPM_LIMIT = 1000000;\n" +
        "+ const QRIS_CPM_LIMIT = 2000000; // plafon dinaikkan\n" +
        "  function authorize(txn) {\n" +
        "    if (txn.amount > QRIS_CPM_LIMIT) return reject(txn, '61');\n" +
        "    return route(txn);\n" +
        "  }",
    },
    new_de: {
      label: "New token field (DE-62) added",
      code:
        "// core-switch/message/builder.js\n" +
        "  msg.setField(4, txn.amount);\n" +
        "+ msg.setField(62, txn.token); // DE-62 token baru\n" +
        "+ bitmap.set(62);\n",
    },
    reversal: {
      label: "Auto-reversal on timeout",
      code:
        "// core-switch/txn/lifecycle.js\n" +
        "+ if (response.rc === '68' || response.timedOut) {\n" +
        "+   sendReversal(buildReversal(original)); // 0400 auto-reversal\n" +
        "+ }\n",
    },
    routing: {
      label: "BIN routing table change",
      code:
        "// core-switch/routing/router.js\n" +
        "- binTable['5080'] = 'ISSUER_A';\n" +
        "+ binTable['5080'] = 'ISSUER_B'; // reroute domestic BIN\n" +
        "  function route(txn){ return binTable[txn.pan.slice(0,4)] || 'STIP'; }\n",
    },
  };

  return { RULES: RULES, analyze: analyze, SAMPLES: SAMPLES };
});
