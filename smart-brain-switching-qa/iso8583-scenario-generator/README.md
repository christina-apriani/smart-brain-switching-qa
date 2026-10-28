<div align="center">

# ⚗️ Autonomous ISO 8583 Scenario & Data Generator

### Functional & Regression QA for payment switching

**Analyzes a code change, then synthesizes thousands of ready-to-fire ISO 8583 / QRIS test messages — boundary, negative, and edge cases humans forget.**

![Part of](https://img.shields.io/badge/suite-Smart%20Brain%20Switching%20QA-ff9f1c?style=flat-square)
![ISO 8583](https://img.shields.io/badge/ISO%208583-1987-ffbf5c?style=flat-square)
![Backend](https://img.shields.io/badge/backend-Node.js%20(zero--dep)-16100a?style=flat-square)
![Tests](https://img.shields.io/badge/tests-7%2F7%20passing-46d08a?style=flat-square)

*Authored by **Christina Apriani***

</div>

---

## Masalah yang diselesaikan

QA switching menghabiskan waktu berjam-jam membuat variasi data uji standar ISO 8583 / JSON QRIS: kombinasi
data kartu, nominal unik, limit saldo, dan error code. Generator ini membalik alurnya: ia **membaca perubahan
kode**, memahami apa yang berubah, lalu **menciptakan skenario uji secara mandiri** — lengkap sebagai pesan
mentah siap tembak.

> Seluruh data uji di sini **sintetis**. PAN memakai test BIN terdokumentasi dengan check digit Luhn valid,
> PIN block dan token adalah fixture mock yang diberi label jelas — tidak ada data nasabah asli maupun material
> kriptografi produksi.

## Logika sistem

**1 · Source Code Analyzer (reverse engineering).** Memindai diff/kode core switching dan mendeteksi perubahan
logika: penanganan limit, penambahan data element, perubahan routing, penanganan reversal/timeout, dan
PIN/token. Tiap sinyal membawa rekomendasi famili skenario dengan confidence.

**2 · Scenario Synthesis (generative logic).** Menerjemahkan sinyal menjadi test case konkret dan langsung ke
raw ISO 8583. Contoh: perubahan limit QRIS CPM → otomatis menghasilkan DE-4 (nominal) **tepat 1 rupiah di bawah
limit, tepat di limit, dan 1 rupiah di atas limit**, lengkap dengan PIN block tiruan yang valid formatnya.

**3 · Edge Cases (self-healing).** Tidak hanya happy path. Ia sengaja merekayasa kondisi ekstrem — misalnya
**memutus koneksi di tengah transmisi** pada posisi bitmap tertentu — untuk menguji apakah switch melakukan
**auto-reversal (0400)** dengan benar, lengkap dengan DE-90 yang mereferensikan transaksi asli.

## Fitur

| Modul | Fungsi |
|---|---|
| **🔬 Code Analyzer** | Tempel diff / kode, deteksi sinyal perubahan + famili skenario + literal (mis. nilai limit baru). |
| **⚗️ Generate Scenarios** | Hasilkan suite dari sinyal atau manual. Tiap case: raw ISO 8583 (MTI + bitmap tersorot), expected RC, catatan, dan field ter-decode. |
| **🧾 Message Inspector** | Tempel raw ISO 8583 apa pun → decode MTI, bitmap, dan tiap data element. |
| **📦 Saved Suites** | Simpan, buka, hapus suite (database SQLite di mode live, localStorage di mode demo). |
| **📚 Reference** | Kamus data element lengkap, tabel MTI, dan response code. |

## Inti teknis: ISO 8583 codec sungguhan

`src/iso8583.js` adalah packer/unpacker ISO 8583:1987 nyata — MTI, primary/secondary bitmap, dan disiplin
panjang field (fixed, LLVAR, LLLVAR). Round-trip `pack` → `unpack` dijamin konsisten (lihat `npm test`). Modul
yang sama dipakai backend (`require`) dan browser (UMD), jadi encode/decode tidak pernah berbeda.

```bash
# contoh: analisis diff lalu generate
curl -X POST http://localhost:4001/api/generate -H 'Content-Type: application/json' \
  -d '{"family":"boundary","limit":2000000}'
# => suite berisi 3 case: 1999999 (RC00), 2000000 (RC00), 2000001 (RC61)
```

## Menjalankan

Butuh **Node.js ≥ 20**. Tanpa dependency eksternal.

```bash
npm start        # http://localhost:4001
npm test         # 7 unit test (codec, Luhn, synthesis, reversal)
```

Tanpa Node? Buka `public/index.html` langsung — berjalan di **mode DEMO** (engine lokal + localStorage).

## REST API

| Method | Endpoint | Fungsi |
|---|---|---|
| `POST` | `/api/analyze` | Deteksi sinyal perubahan dari kode |
| `POST` | `/api/generate` | Sintesis suite skenario |
| `POST` | `/api/parse` | Decode raw ISO 8583 |
| `GET/POST/DELETE` | `/api/suites` | Kelola suite tersimpan |
| `GET` | `/api/dict` · `/api/stats` | Kamus & metrik |

## Arsitektur

```
iso8583-scenario-generator/
├── server.js           # HTTP server (zero-dep): static + REST
├── src/
│   ├── iso8583.js      # ⭐ ISO 8583 codec (pack/unpack, UMD)
│   ├── testdata.js     # PAN (Luhn), PIN block & token sintetis
│   ├── analyzer.js     # source-code change detector
│   ├── synth.js        # scenario synthesis engine
│   └── db.js           # persistensi suite (SQLite)
├── public/             # operator console (+ salinan engine untuk demo)
└── test/               # unit test
```

## Catatan keamanan & etika

Alat ini untuk **QA internal atas sistem yang Anda miliki/uji secara sah**. Semua data uji sintetis; tidak ada
PAN asli, dan tidak ada kunci/kriptogram produksi yang digunakan atau dapat diturunkan dari modul mock.

---

<div align="center">
<sub>Bagian dari Smart Brain Switching QA · dibangun oleh Christina Apriani</sub>
</div>
