<div align="center">

# 🧠 Multi-Agent AI Monitoring & Root Cause Analysis Platform

### Live performance QA & instant failure investigation for payment switching

**Three cooperating agents work like a digital detective team — finding the source of a failure spike in seconds, not hours.**

![Part of](https://img.shields.io/badge/suite-Smart%20Brain%20Switching%20QA-8b7bff?style=flat-square)
![Agents](https://img.shields.io/badge/agents-A%20%C2%B7%20B%20%C2%B7%20C-a99bff?style=flat-square)
![Realtime](https://img.shields.io/badge/realtime-SSE%20%2B%20Leaflet-35e0e0?style=flat-square)
![Tests](https://img.shields.io/badge/tests-6%2F6%20passing-2ee6a0?style=flat-square)

*Authored by **Christina Apriani***

</div>

---

## Masalah yang diselesaikan

Saat terjadi lonjakan transaksi gagal (mis. RC 91 System Malfunction atau RC 68 Timeout) di jaringan live, tim
QA dan operasional biasanya butuh berjam-jam menelusuri ratusan ribu baris log untuk menemukan akar masalah.
Platform ini memakai arsitektur **multi-agent** untuk menemukan sumber masalah dalam hitungan detik, lalu
mengeluarkan **narasi solusi** langsung di dashboard.

## Logika sistem

**1 · Penyadapan non-intrusif.** Sistem menyadap aliran transaksi (live log streaming) tanpa mengganggu
kecepatan switching utama. Di repo ini aliran disimulasikan secara realistis dan dapat diinjeksi gangguan.

**2 · Kolaborasi tiga agen.**

| Agen | Peran | Metode |
|---|---|---|
| **Agent-A** | Log Anomaly Detector | EWMA + z-score pada error rate per node, dengan dwell-time & volume guard untuk menekan false positive |
| **Agent-B** | Topology Mapper | Skor kesehatan tiap node dari CPU, memori, latensi jaringan, dan antrean HSM |
| **Agent-C** | Investigator | Mengorelasikan temuan A + B, menilai kondisi core switch, lalu menyimpulkan akar masalah |

**3 · Narasi akar masalah.** Agent-C tidak hanya menampilkan grafik, melainkan mengeluarkan narasi siap-tindak:

> *"Terjadi lonjakan RC 68 (Timeout) sebesar 21% pada transaksi QRIS arah Bank X. Analisis menunjukkan kapasitas
> memori server Bank X hampir penuh (98%), sementara jaringan internal core switch 100% sehat. Rekomendasi:
> Aktifkan fitur pembatasan antrean otomatis (throttling) sementara untuk destinasi Bank X dan eskalasi ke tim
> infrastruktur bank tujuan."*

Narasi ini dihasilkan secara deterministik dari bukti yang benar-benar terdeteksi agen — bukan teks statis.

## Fitur

| Modul | Fungsi |
|---|---|
| **📊 Dashboard** | TPS & error rate live (chart), breakdown response code, dan tiga panel agen yang menyala real-time. |
| **🗺️ Live Network Map** | Peta OpenStreetMap: core switch + bank tujuan di seluruh Indonesia, warna per kesehatan, node bermasalah berdenyut merah. |
| **🚨 Incidents & RCA** | Feed insiden dengan narasi akar masalah, bukti antar-agen, rekomendasi, confidence, dan status. |
| **🎛️ Fault Injection** | Injeksikan gangguan (memori penuh, timeout storm, malfunction, CPU) ke bank mana pun untuk menguji respons agen. |

## Inti teknis

- `src/agents.js` — deteksi anomali (EWMA/z-score + dwell-time), skor topologi, dan sintesis narasi. Deterministik
  dan dapat dijelaskan; di produksi Agent-A dapat diganti Isolation Forest / LSTM dan Agent-C dengan LLM
  perbankan tanpa mengubah kontrak.
- `src/simulator.js` — aliran transaksi live dengan degradasi infrastruktur yang kausal (memori naik dulu, lalu
  timeout menyusul), persis seperti insiden nyata.
- Semua modul UMD: dipakai backend (loop + SSE) dan browser (mode demo) tanpa perbedaan logika.

## Menjalankan

Butuh **Node.js ≥ 20**. Tanpa dependency eksternal.

```bash
npm start        # http://localhost:4002
npm test         # 6 unit test (anomaly, topology, narrative, recovery)
```

Buka dashboard, lalu tab **Fault Injection** → pilih bank → **Injeksikan Gangguan**, dan lihat ketiga agen
mendeteksi serta menarasikan akar masalah dalam hitungan detik.

Tanpa Node? Buka `public/index.html` langsung — berjalan di **mode DEMO** (simulator + agen berjalan di browser).

## REST API

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/api/stream` | SSE: tick (snapshot + temuan agen) & incident |
| `POST` | `/api/inject` | Injeksi gangguan `{nodeId,type,magnitude}` |
| `POST` | `/api/clear` | Pulihkan semua gangguan |
| `GET` | `/api/incidents` | Daftar insiden + narasi RCA |
| `GET` | `/api/topology` · `/api/state` · `/api/stats` | Topologi, snapshot, metrik |

## Arsitektur

```
multi-agent-rca-platform/
├── server.js            # HTTP + SSE; menjalankan loop simulasi + agen
├── src/
│   ├── topology.js      # jaringan interbank (core + bank, geo)
│   ├── simulator.js     # aliran transaksi live + injeksi gangguan
│   ├── agents.js        # ⭐ Agent-A / B / C
│   └── db.js            # penyimpanan insiden (SQLite)
├── public/              # dashboard (+ salinan engine untuk demo)
└── test/                # unit test
```

## Catatan

Alat ini untuk **monitoring & QA atas sistem Anda sendiri**. Data transaksi di repo bersifat simulasi; tidak
ada data nasabah asli.

---

<div align="center">
<sub>Bagian dari Smart Brain Switching QA · dibangun oleh Christina Apriani</sub>
</div>
