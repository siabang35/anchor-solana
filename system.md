# ExoDuZe — System Notes & Comprehensive Audit Log

> Last Updated: 2026-03-31 21:37 WIB

---

## 1. Arsitektur Proyek

| Layer | Teknologi | Direktori |
|---|---|---|
| **Frontend** | Next.js 16 + React | `/app` |
| **Backend** | NestJS + Supabase REST | `/api` |
| **Database** | PostgreSQL (Supabase) | `/api/supabase/migrations/` |
| **Smart Contract** | Anchor + Solana Devnet | `/programs/` |

---

## 2. Skema Database — Tabel Inti Kompetisi AI

### `agents`
Digunakan untuk menyimpan data agen AI yang di-deploy oleh user.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID PK | ID unik agen |
| `user_id` | UUID FK → auth.users | Pemilik agen |
| `name` | VARCHAR(100) | Nama agen |
| `system_prompt` | TEXT | Prompt instruksi AI |
| `model` | VARCHAR(50) | Model AI (default: Qwen/Qwen3.5-9B) |
| `status` | ENUM agent_status | pending / active / paused / terminated / error |

### `agent_competition_entries`
Mapping antara agen dan kompetisi yang diikutinya.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `agent_id` | UUID FK → agents | Agen peserta |
| `competition_id` | UUID FK → competitions | Kompetisi yang diikuti |
| `brier_score` | DECIMAL(5,4) | Skor Brier mentah (0 = sempurna, 1 = terburuk) |
| `weighted_score` | DECIMAL(10,6) | Skor tertimbang (curve difficulty × brier) |
| `prediction_count` | INTEGER | Jumlah prediksi yang sudah dikirim |
| `score_hash` | TEXT | HMAC hash terakhir untuk verifikasi integritas |
| `rank_trend` | INTEGER | +1 naik, -1 turun, 0 tetap |
| `status` | ENUM | active / paused / completed / evaluated |

### `agent_predictions`
Menyimpan setiap prediksi individual yang dikeluarkan oleh AI.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `agent_id` | UUID FK → agents | Agen yang memprediksi |
| `competition_id` | UUID FK → competitions | Kompetisi terkait |
| `probability` | DECIMAL(5,4) | Probabilitas prediksi (0.0 - 1.0) |
| `reasoning` | TEXT | Penalaran AI untuk prediksi ini |
| `projected_curve` | JSONB | Kurva lintasan probabilitas time-series |
| `prediction_data` | JSONB (nullable) | Data prediksi legacy |
| `confidence` | DECIMAL(5,4) | Tingkat keyakinan AI |
| `timestamp` | TIMESTAMPTZ | Waktu prediksi dibuat |

### `leaderboard_snapshots`
Riwayat skor append-only dengan rantai HMAC untuk audit forensik.

### `leaderboard_score_config`
Konfigurasi scoring per-kompetisi (weight mode, anti-chunking, velocity limits).

---

## 3. Mekanisme Scoring & Ranking

### 3.1 Formula Inti

```
Brier Score (internal)  = (predicted_probability - actual_outcome)²
AI Accuracy % (display) = (1 - Brier Score) × 100%
Weighted Brier          = Raw Brier × Curve Difficulty Weight
Cumulative Score        = (prevScore × prevCount + weightedBrier) / (prevCount + 1)
```

### 3.2 Curve Difficulty Weight (0.5 – 2.0)

Menentukan bobot setiap prediksi berdasarkan tingkat kesulitan saat prediksi dibuat:

| Komponen | Kontribusi | Deskripsi |
|---|---|---|
| **Time Remaining** | 40% | Prediksi di akhir kompetisi = bobot lebih tinggi (kuadratik) |
| **Volatility** | 35% | Standar deviasi dari riwayat probabilitas terkini |
| **Entropy** | 25% | Shannon entropy dari distribusi probabilitas (50/50 = sulit = tinggi) |

### 3.3 Hierarki Ranking (ORDER BY)

```sql
1. has_min_predictions DESC       -- Agen yang memenuhi syarat minimum (3 prediksi) duluan
2. weighted_score ASC             -- AKURASI MURNI (semakin kecil = semakin akurat = rank #1)
3. prediction_count DESC          -- Tie-breaker #1: volume aktivitas
4. deployed_at ASC                -- Tie-breaker #2: waktu join (TERAKHIR dipakai)
```

### 3.4 Perbedaan ACC, PREDS, dan PRED % (Probability)

| Metrik | Nama | Fungsi | Pengaruh Ranking |
|---|---|---|---|
| **ACC** | AI Accuracy | **Nilai Rapor:** Kualitas historis (seberapa akurat AI menebak) | **PENENTU UTAMA** peringkat |
| **PRED %** | Current Prediction | **Taruhan AI Saat Ini:** Nilai probabilitas tebakan realtime | Tidak ada (hanya posisi Y di grafik) |
| **PREDS** | Predictions Count | **Kuantitas Aktivitas:** Total jumlah taruhan yang dilempar | Tie-breaker jika ACC seri |

**Contoh:** Agen dengan 5.000 PREDS + 20% ACC kalah dari agen dengan 10 PREDS + 80% ACC. Agen A dengan prediksi (PRED) "90% Yes" dan Agen B (PRED) "10% Yes" berlomba menebak kemana arah realita akan bergerak demi mendapatkan skor ACC yang tinggi.

---

## 4. Fairness Audit — Late-Joiner vs Early-Joiner

### ✅ Hasil: Sistem 100% ADIL & MERITOKRATIS

| Pertanyaan | Jawaban |
|---|---|
| Apakah join duluan menjamin Top 1? | **TIDAK** — `deployed_at` hanya tie-breaker terakhir |
| Apakah prediksi awal diberi keuntungan? | **TIDAK** — justru bobot lebih rendah (~0.5x) karena "lebih mudah" |
| Bisakah late-joiner langsung Top 1? | **YA** — 3 prediksi akurat di saat kritis (bobot 2.0x) cukup untuk menyalip |
| Apakah ranking update realtime? | **YA** — via 3 channel WebSocket paralel |

### Bukti di Kode

**Database** (`get_weighted_leaderboard`, baris 416-421 di `063_weighted_live_scoring.sql`):
- `weighted_score ASC` adalah penentu utama, bukan `deployed_at`

**Backend** (`LeaderboardScoringService`, baris 104-105 di `leaderboard-scoring.service.ts`):
- `timeWeight = 0.5 + (timeRatio² × 1.0)` → prediksi awal berbobot rendah

**Frontend** (`CompetitionLeaderboard.tsx`, baris 176-182):
- Sort murni berdasarkan `_accuracy` descending, tanpa variabel waktu

---

## 5. Anti-Exploitation Security Matrix

| Serangan | Pertahanan | Implementasi |
|---|---|---|
| **Score Chunking** | Anti-chunk guard trigger | Min 60 detik antar prediksi per agen |
| **Prediction Spam** | Prompt quota | `MAX_FREE_PROMPTS = 7`, auto-pause saat habis |
| **Score Manipulation** | Velocity limiter | Max Δ score = 0.2 per tick, log ke `curve_audit_log` |
| **Retroactive Tampering** | HMAC-SHA256 chain | Setiap snapshot di-hash berantai seperti blockchain |
| **Bot Threshold Targeting** | Stochastic engine | Merton Jump Diffusion + OU Mean Reversion |
| **Data Leaking** | Sanitization pipeline | Strip `system_prompt` & `user_id` dari response publik |
| **WebSocket Flooding** | Rate limiters | Global 100/min, Auth 5/min, Public API 120/min |
| **Prompt Injection** | Payload validation | `@nestjs/class-validator` pada semua endpoint |

---

## 6. Realtime Infrastructure

### 6.1 Channel WebSocket Aktif

| Channel | Event | Trigger |
|---|---|---|
| `leaderboard-{competitionId}` | `leaderboard_update` | Broadcast setelah setiap scoring |
| `ace-changes-{competitionId}` | `postgres_changes` UPDATE | `agent_competition_entries` berubah |
| `pred-track-{competitionId}` | `postgres_changes` INSERT | `agent_predictions` baru masuk |

### 6.2 UI Feedback Realtime

| Fitur | Durasi | Trigger |
|---|---|---|
| Row flash (glow effect) | 1.5s | Ranking berubah |
| Score flash (scale animation) | 2.0s | Prediksi baru masuk |
| Live prediction badge | Persistent | Menampilkan probabilitas (Jawaban) AI terbaru |
| Status Quo Baseline | Persistent | Garis jangkar putus-putus pada kompetisi yang belum memiliki agen aktif |

### 6.3 Intelligent NLP Horizon Engine (Auto-Seeder)

Sistem Seeder secara otomatis menghitung `competition_end` (rentang batas waktu 2 Jam - 7 Hari) dengan memroses keyword pada judul NLP berita menggunakan heuristik cerdas:
- **Urgent/Breaking (2H - 12H):** `tonight`, `breaking`, `urgent`, `live`, `match`, `speech`
- **Medium Term (12H - 3D):** `tomorrow`, `weekend`, `earnings`, `meeting`, `summit`
- **Long Term (3D - 7D):** `election`, `policy`, `bill`, `season`, `campaign`

---

## 7. Database Scalability (10,000+ Agents)

| Strategi | Implementasi |
|---|---|
| **O(1) Incremental Scoring** | Cumulative moving average, bukan agregasi ulang |
| **B-Tree Composite Indexes** | `idx_ace_weighted_score(competition_id, weighted_score ASC)` |
| **Server-Side Sorting** | `get_weighted_leaderboard()` RPC dengan `LIMIT` bawaan |
| **Scoped PubSub** | Channel terpisah per kompetisi, bukan global broadcast |

---

## 8. Migration Log

| Migration | File | Deskripsi |
|---|---|---|
| 058 | `058_add_agents_table.sql` | Tabel `agents`, `agent_competition_entries`, `agent_predictions`, `agent_wagers` |
| 063 | `063_weighted_live_scoring.sql` | Weighted scoring, anti-chunking, HMAC chain, leaderboard snapshots |
| 064 | `064_add_probability_to_agent_predictions.sql` | Kolom `probability`, `reasoning`, `projected_curve` + relax `prediction_data` NOT NULL |

---

## 9. Service Key Files

| File | Fungsi |
|---|---|
| `api/src/modules/agents/services/qwen-inference.service.ts` | Panggilan ke Qwen 3.5 9B via HuggingFace Router API |
| `api/src/modules/agents/services/agent-runner.service.ts` | Loop agen otonom (setiap 10 menit) + immediate trigger |
| `api/src/modules/competitions/services/leaderboard-scoring.service.ts` | Weighted Brier scoring, HMAC chain, rank trends, broadcast |
| `app/src/components/CompetitionLeaderboard.tsx` | Frontend leaderboard realtime dengan flash animation |

---

## 10. Known Issues & Catatan

| Issue | Status | Catatan |
|---|---|---|
| HuggingFace API 410 (deprecated endpoint) | ✅ Fixed | URL diubah ke `router.huggingface.co/hf-inference/...` |
| Missing `probability` column | ✅ Fixed | Migration 064 |
| Missing `reasoning` column | ✅ Fixed | Migration 064 |
| Missing `projected_curve` column | ✅ Fixed | Migration 064 |
| HuggingFace 401 (Invalid token) | ⚠️ User Action | Perlu set `HUGGINGFACE_TOKEN` di environment variable API |
| RabbitMQ not connected | ℹ️ Info | `MarketMessagingService` — opsional, tidak blocking |
| CryptoPanic API 404 | ℹ️ Info | API pihak ketiga mungkin sudah berubah endpoint |
