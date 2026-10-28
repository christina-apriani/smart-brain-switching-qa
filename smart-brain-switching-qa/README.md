<div align="center">

# Smart Brain Switching QA

### AI-assisted Quality Assurance for payment switching

**Two production-grade platforms that cover the full QA lifecycle of a core switch - from generating the test data, to investigating failures in the live network.**

![Full-stack](https://img.shields.io/badge/stack-full--stack-8b7bff?style=for-the-badge)
![Zero deps](https://img.shields.io/badge/runtime-Node.js%20zero--dependency-16100a?style=for-the-badge)

![ISO 8583](https://img.shields.io/badge/ISO%208583-codec-ff9f1c?style=flat-square)
![Multi-Agent](https://img.shields.io/badge/multi--agent-RCA-8b7bff?style=flat-square)
![Tests](https://img.shields.io/badge/tests-13%2F13%20passing-2ee6a0?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-20233b?style=flat-square)

*Authored by **Christina Apriani***

</div>

---

## Dua pilar QA switching

QA sebuah sistem switching pembayaran punya dua sisi yang sama berat: **menyiapkan data uji** sebelum rilis, dan
**menginvestigasi kegagalan** setelah live. Repository ini menyediakan keduanya sebagai aplikasi full-stack yang
berdiri sendiri.

### ⚗️ [1 · Autonomous ISO 8583 Scenario & Data Generator](./iso8583-scenario-generator)

**Functional & Regression QA.** Membaca perubahan kode core switching, lalu secara mandiri menciptakan ribuan
skenario uji ISO 8583 / QRIS siap tembak — boundary (nominal tepat 1 rupiah di bawah / di / di atas limit),
negatif, dan edge case (koneksi terputus di tengah transmisi untuk menguji auto-reversal). Dilengkapi ISO 8583
codec sungguhan (pack/unpack), source-code analyzer, dan message inspector.

### 🧠 [2 · Multi-Agent AI Monitoring & Root Cause Analysis Platform](./multi-agent-rca-platform)

**Performance & Production QA.** Menyadap aliran transaksi live, lalu mengerahkan tiga agen (anomaly detector,
topology mapper, investigator) yang berkolaborasi menemukan akar masalah lonjakan transaksi gagal dalam hitungan
detik — dan mengeluarkan narasi solusi langsung di dashboard, lengkap dengan peta jaringan interbank real-time.

---

## Peta lifecycle

```
   SEBELUM RILIS                                       SETELAH LIVE
 ┌───────────────────────────┐                   ┌───────────────────────────┐
 │  ISO 8583 Generator       │   kode uji        │  Multi-Agent RCA          │
 │  • analisis perubahan kode│  ─────────────▶  │  • sadap transaksi live   │
 │  • sintesis skenario      │   divalidasi      │  • Agent A/B/C investigasi│
 │  • raw message + edge case│                   │  • narasi akar masalah    │
 └───────────────────────────┘                   └───────────────────────────┘
        Functional / Regression QA               Performance / Production QA
```

## Menjalankan

Setiap project berdiri sendiri, butuh **Node.js ≥ 20**, dan **tanpa dependency eksternal**.

```bash
# Project 1 — generator
cd iso8583-scenario-generator && npm start     # http://localhost:4001

# Project 2 — monitoring & RCA
cd multi-agent-rca-platform && npm start        # http://localhost:4002
```

Unit test tiap project: `npm test` (13 test total, semua lolos). Tanpa Node, buka `public/index.html` tiap
project untuk **mode DEMO** di browser.

## Prinsip rekayasa

- **Zero dependency.** Keduanya berjalan dengan modul inti Node (`http`, `node:sqlite`). Mudah di-deploy,
  mudah diaudit, tidak ada rantai dependency.
- **Engine bersama.** Logika inti (ISO 8583 codec, decision agents) ditulis sekali sebagai modul UMD dan dipakai
  identik di backend dan browser - tidak pernah berbeda.
- **Mode adaptif.** Deteksi backend otomatis: mode LIVE (SQLite + SSE) bila server aktif, mode DEMO
  (engine lokal) bila dibuka sebagai halaman statis.
- **Data sintetis & etis.** Semua data kartu, PIN, dan transaksi bersifat uji; tidak ada data nasabah asli
  maupun material kriptografi produksi. Untuk QA atas sistem yang Anda miliki/uji secara sah.

## Struktur

```
smart-brain-switching-qa/
├── iso8583-scenario-generator/     # Project 1 — generator (port 4001)
├── multi-agent-rca-platform/       # Project 2 — monitoring & RCA (port 4002)
├── README.md
└── LICENSE
```

---

<div align="center">


**Christina Apriani** · Full-Stack Developer Profesional

*Payment switching QA · ISO 8583 · Multi-agent observability*

<sub>Semua data uji sintetis. Untuk penggunaan yang sah atas sistem Anda sendiri.</sub>

</div>
