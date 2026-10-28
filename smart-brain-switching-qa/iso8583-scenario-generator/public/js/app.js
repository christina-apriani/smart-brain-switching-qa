/* ============================================================================
 * ISO 8583 Scenario Generator — Console Controller
 * Author: Christina Apriani
 * ==========================================================================*/
(function () {
  "use strict";
  var API = window.GenAPI, ISO = window.ISO8583;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var genCount = 0, lastSignalCount = 0, dict = null, lastSuites = [];

  document.querySelectorAll(".tab").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".view").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active"); $(b.dataset.v).classList.add("active");
      if (b.dataset.v === "suites") renderSaved();
      if (b.dataset.v === "ref") renderRef();
    };
  });

  var toastT;
  function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2500); }
  function setMode(mode) { var p = $("modePill"); p.className = "pill mode-" + mode; $("modeText").textContent = mode === "live" ? "LIVE · backend aktif" : "DEMO · engine lokal"; }

  /* ---- analyze ---- */
  function renderSignals(a) {
    $("anSummary").textContent = a.summary || "";
    lastSignalCount = (a.signals || []).length;
    $("st_signals").textContent = lastSignalCount;
    if (!a.signals || !a.signals.length) { $("signalsPane").innerHTML = '<div class="empty">Tidak ada sinyal perubahan terdeteksi.</div>'; return; }
    $("signalsPane").innerHTML = a.signals.map(function (s) {
      return '<div class="signal"><div class="st"><span>' + esc(s.label) + '</span><span class="conf">' + Math.round(s.confidence * 100) + "% conf</span></div>" +
        '<div class="sm">' + esc(s.hint) + '</div>' +
        '<div style="margin-top:7px"><span class="fam">family: ' + esc(s.family) + "</span>" +
        (s.literals && s.literals.length ? ' <span class="lits">literals: ' + esc(JSON.stringify(s.literals)) + "</span>" : "") + "</div>" +
        '<div style="margin-top:9px"><button class="btn sm" data-gen="' + encodeURIComponent(JSON.stringify(s)) + '">⚗️ Generate dari sinyal ini</button></div></div>';
    }).join("");
    $("signalsPane").querySelectorAll("[data-gen]").forEach(function (b) {
      b.onclick = function () { var sig = JSON.parse(decodeURIComponent(b.dataset.gen)); generate({ signal: sig }); goTab("generate"); };
    });
  }
  function doAnalyze() {
    var code = $("codeInput").value;
    if (!code.trim()) { toast("Tempel kode terlebih dahulu"); return; }
    API.analyze(code).then(renderSignals);
  }

  /* ---- generate ---- */
  function generate(payload, persist) {
    payload = payload || {};
    if (persist) payload.persist = true;
    API.generate(payload).then(function (res) {
      lastSuites = res.suites || [];
      renderSuites(lastSuites);
      var n = lastSuites.reduce(function (a, s) { return a + s.cases.length; }, 0);
      genCount += n; $("st_gen").textContent = genCount;
      $("genMeta").textContent = lastSuites.length + " suite · " + n + " case";
      if (persist) { toast("Disimpan: " + lastSuites.length + " suite"); refreshStats(); }
    });
  }
  function renderSuites(suites) {
    if (!suites.length) { $("suitesPane").innerHTML = '<div class="empty">Tidak ada suite dihasilkan.</div>'; return; }
    $("suitesPane").innerHTML = suites.map(function (su) {
      return '<div style="margin-bottom:18px"><div class="suite-head"><div><b>' + esc(su.name) + '</b> <span class="fam">' + esc(su.family) + '</span></div>' +
        '<div class="row"><button class="btn ghost sm" data-save="' + esc(su.id) + '">Simpan suite</button>' +
        '<button class="btn ghost sm" data-exp="' + esc(su.id) + '">Export JSON</button></div></div>' +
        su.cases.map(renderCase).join("") + "</div>";
    }).join("");
    bindCases();
    $("suitesPane").querySelectorAll("[data-save]").forEach(function (b) { b.onclick = function () { var su = suites.find(function (x) { return x.id === b.dataset.save; }); API.saveSuite(su).then(function () { toast("Suite disimpan"); refreshStats(); }); }; });
    $("suitesPane").querySelectorAll("[data-exp]").forEach(function (b) { b.onclick = function () { var su = suites.find(function (x) { return x.id === b.dataset.exp; }); exportJSON(su, su.name); }; });
  }
  function renderCase(c) {
    var rcClass = !c.expected_rc ? "none" : c.expected_rc === "00" ? "ok" : "bad";
    var raw = c.raw || c.full_raw || "";
    var rawHtml = raw ? '<div class="raw"><span class="lbl">RAW ISO 8583</span>' + hl(raw, c) + "</div>" : "";
    var edge = c.transmission === "interrupted"
      ? '<div class="note-edge">⚠ ' + esc(c.note) + '<br>Partial (' + c.length + ' char) dari full ' + (c.full_raw ? c.full_raw.length : "?") + ' char. Switch harus memicu auto-reversal 0400.</div>'
      : "";
    var decoded = raw && c.transmission !== "interrupted" ? decodeTable(raw) : "";
    return '<div class="case ' + esc(c.category) + '"><div class="ch"><div><div class="ct">' + esc(c.title) +
      '</div><div class="cm">' + esc(c.mti) + " · " + esc(c.mti_name || "") + " · " + esc(c.id) + '</div></div>' +
      '<div class="row"><span class="rc ' + rcClass + '">' + (c.expected_rc ? "RC " + esc(c.expected_rc) : "n/a") + '</span><span style="color:var(--faint);font-size:16px">▾</span></div></div>' +
      '<div class="cbody">' + (c.note && c.transmission !== "interrupted" ? '<div class="cm" style="margin-bottom:6px">' + esc(c.note) + "</div>" : "") +
      edge + rawHtml + decoded + "</div></div>";
  }
  function hl(raw, c) {
    // highlight MTI (4) + bitmap (16 or 32)
    var mtiLen = 4;
    var bmpLen = 16;
    // detect secondary bitmap from first nibble bit
    try { var firstNib = parseInt(raw[4], 16); if (firstNib & 8) bmpLen = 32; } catch (e) {}
    var mti = raw.slice(0, mtiLen), bmp = raw.slice(mtiLen, mtiLen + bmpLen), rest = raw.slice(mtiLen + bmpLen);
    return '<span class="mti">' + esc(mti) + '</span><span class="bmp">' + esc(bmp) + "</span>" + esc(rest);
  }
  function decodeTable(raw) {
    var d;
    try { d = ISO.decodeDetailed(raw); } catch (e) { return ""; }
    if (!d.fields || !d.fields.length) return "";
    return '<table class="tbl"><thead><tr><th>DE</th><th>Name</th><th>Value</th></tr></thead><tbody>' +
      d.fields.map(function (f) { return '<tr><td class="de-no">' + f.de + '</td><td class="name">' + esc(f.name) + '</td><td>' + esc(f.value) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function bindCases() {
    document.querySelectorAll("#suitesPane .case .ch, #parsePane .case .ch").forEach(function (h) {
      h.onclick = function () { h.parentElement.classList.toggle("open"); };
    });
  }

  /* ---- inspect ---- */
  function doParse() {
    var raw = $("rawInput").value.trim();
    if (!raw) { toast("Tempel raw message"); return; }
    API.parse(raw).then(function (d) {
      if (d.error) { $("parsePane").innerHTML = '<div class="empty">Gagal decode: ' + esc(d.detail || d.error) + "</div>"; return; }
      $("parseMeta").textContent = "MTI " + d.mti + " · " + (ISO.MTI[d.mti] || "");
      var html = '<div class="raw" style="margin-bottom:12px"><span class="lbl">STRUKTUR</span><span class="mti">' + esc(d.mti) + '</span><span class="bmp">' + esc(d.bitmapHex) + "</span></div>";
      html += '<table class="tbl"><thead><tr><th>DE</th><th>Name</th><th>Value</th></tr></thead><tbody>' +
        (d.fields || []).map(function (f) { return '<tr><td class="de-no">' + f.de + '</td><td class="name">' + esc(f.name) + '</td><td>' + esc(f.value) + "</td></tr>"; }).join("") + "</tbody></table>";
      $("parsePane").innerHTML = html;
    });
  }

  /* ---- saved suites ---- */
  function renderSaved() {
    API.listSuites().then(function (list) {
      if (!list.length) { $("savedPane").innerHTML = '<div class="empty">Belum ada suite tersimpan. Generate lalu tekan "Simpan suite".</div>'; return; }
      $("savedPane").innerHTML = '<table class="tbl"><thead><tr><th>ID</th><th>Nama</th><th>Family</th><th>Case</th><th>Dibuat</th><th></th></tr></thead><tbody>' +
        list.map(function (s) {
          return "<tr><td>" + esc(s.id) + '</td><td class="name">' + esc(s.name) + '</td><td>' + esc(s.family) + "</td><td>" + s.case_count + "</td><td>" + esc(s.created_at || "") +
            '</td><td><button class="btn ghost sm" data-load="' + esc(s.id) + '">buka</button> <button class="btn danger sm" data-del="' + esc(s.id) + '">&times;</button></td></tr>';
        }).join("") + "</tbody></table>";
      $("savedPane").querySelectorAll("[data-load]").forEach(function (b) { b.onclick = function () { API.getSuite(b.dataset.load).then(function (su) { lastSuites = [su]; renderSuites([su]); goTab("generate"); $("genMeta").textContent = "1 suite · " + su.cases.length + " case"; }); }; });
      $("savedPane").querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { if (confirm("Hapus suite " + b.dataset.del + "?")) API.deleteSuite(b.dataset.del).then(function () { renderSaved(); refreshStats(); toast("Suite dihapus"); }); }; });
    });
  }

  /* ---- reference ---- */
  function renderRef() {
    if (!dict) return;
    $("tblDict").innerHTML = "<thead><tr><th>DE</th><th>Name</th><th>Type</th><th>Len</th></tr></thead><tbody>" +
      Object.keys(dict.DICT).map(function (de) { var d = dict.DICT[de]; return '<tr><td class="de-no">' + de + '</td><td class="name">' + esc(d.name) + "</td><td>" + esc(d.type) + (d.var ? "/LL" + (d.var === 3 ? "L" : "") + "VAR" : "") + "</td><td>" + d.len + "</td></tr>"; }).join("") + "</tbody>";
    $("tblMTI").innerHTML = "<tbody>" + Object.keys(dict.MTI).map(function (m) { return "<tr><td class='de-no'>" + m + "</td><td class='name'>" + esc(dict.MTI[m]) + "</td></tr>"; }).join("") + "</tbody>";
    $("tblRC").innerHTML = "<tbody>" + Object.keys(dict.RC).map(function (r) { return "<tr><td class='de-no'>" + r + "</td><td class='name'>" + esc(dict.RC[r]) + "</td></tr>"; }).join("") + "</tbody>";
  }

  function exportJSON(obj, name) {
    var b = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (name || "suite").replace(/\s+/g, "_") + ".json"; a.click();
    toast("Diexport");
  }
  function refreshStats() { API.stats().then(function (s) { $("st_suites").textContent = s.suites; $("st_cases").textContent = s.cases; }); }
  function goTab(v) { document.querySelector('.tab[data-v="' + v + '"]').click(); }

  /* ---- wire ---- */
  $("btnAnalyze").onclick = doAnalyze;
  $("btnAnalyzeGen").onclick = function () { var code = $("codeInput").value; if (!code.trim()) { toast("Tempel kode"); return; } API.analyze(code).then(function (a) { renderSignals(a); generate({ code: code }); goTab("generate"); }); };
  $("btnGenManual").onclick = function () { generate(manualPayload()); };
  $("btnGenPersist").onclick = function () { generate(manualPayload(), true); };
  function manualPayload() {
    var fam = $("g_family").value;
    var p = { family: fam };
    if (fam === "boundary") p.limit = parseInt($("g_limit").value) || 2000000;
    if (fam === "field_presence") p.de = parseInt($("g_de").value) || 62;
    return p;
  }
  $("g_family").onchange = function () { var f = this.value; $("wrapLimit").style.display = f === "boundary" ? "" : "none"; $("wrapDE").style.display = f === "field_presence" ? "" : "none"; };
  $("btnParse").onclick = doParse;
  $("btnSampleRaw").onclick = function () {
    // build a sample via engine for a self-consistent raw
    var sig = { label: "demo", family: "boundary", literals: [2000000] };
    API.generate({ signal: sig }).then(function (res) { var c = res.suites[0].cases[0]; $("rawInput").value = c.raw; doParse(); });
  };
  $("btnRefreshSuites").onclick = renderSaved;

  /* ---- boot ---- */
  API.detect().then(function (mode) {
    setMode(mode);
    API.samples().then(function (samples) {
      var sel = $("sampleSelect");
      Object.keys(samples).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = samples[k].label; sel.appendChild(o); });
      sel.onchange = function () { if (samples[this.value]) $("codeInput").value = samples[this.value].code; };
      // preload first sample
      var first = Object.keys(samples)[0];
      if (first) { sel.value = first; $("codeInput").value = samples[first].code; }
    });
    API.dict().then(function (d) { dict = d; });
    refreshStats();
  });
})();
