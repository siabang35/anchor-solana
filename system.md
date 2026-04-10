# ExoDuZe — System Notes & Comprehensive Audit Log

> Last Updated: 2026-04-08 11:15 WIB

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
| `model` | VARCHAR(50) | Model AI (default: Qwen/Qwen2.5-7B-Instruct) |
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
| `final_rank` | INTEGER | Peringkat akhir setelah kompetisi usai (1, 2, 3) |
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

| Serangan / Kelemahan | Pertahanan | Implementasi |
|---|---|---|
| **API Limit & Throttling (LLM)** | 4-Tier Inference Cascade | Auto-routing dengan Cooldown **30s** (rate limit 429/503) & **5 menit** (billing 402). Auto-Recovery probing dari **HuggingFace** → **OpenRouter** → **Groq** (70B→8B sub-fallback) → **Local Simulation** jika limit absolut terjadi. Agent Simulation State Cache (`agentSimState`) mempertahankan probabilitas terakhir per agent saat simulation mode aktif. |
| **Thundering Herd Exhaustion** | Serialized Agent Processing | Agent diproses **1 per 1** (concurrency=1) dengan 3s delay antar agent + 2s delay antar prediksi. Bootstrap dibatasi **2 prediksi** per agent baru. |
| **Market Overlap & Double Running** | UI Deployment Constraint | Enforce 1-target-market per agent. Validasi mengeblok user jika sedang running di market yang sama |
| **Score Chunking** | Anti-chunk guard trigger | Default **10 detik** antar prediksi per agen untuk hyper-realtime tracking |
| **Prediction Spam** | Prompt quota | `MAX_FREE_PROMPTS` per budget agen membatasi prediksi kontinu sesuai durasi kompetisi |
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

Sistem Seeder secara otomatis menghitung `competition_end` secara cerdas dan ketat (hanya 4 opsi: 2H, 7H, 12H, 24H) menggunakan NLP heuristik:
- **Urgent/Breaking (2H):** `tonight`, `breaking`, `urgent`, `live`, `match`, `speech`
- **Medium Term (7H - 12H):** `tomorrow`, `earnings`, `meeting`, `summit`
- **Long Term (24H/1D max):** `election`, `policy`, `bill`, `season`, `campaign` *(Opsi 3D dan 7D telah dihapus demi efisiensi market)*

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
| 065 | `065_fix_security_lints.sql` | Fix RLS lints pada schema database |
| 066 | `066_agent_final_ranks.sql` | Menambahkan kolom `final_rank` agar UI bisa menampilkan medali kemenangan agen |
| 067 | `067_fix_anti_chunking.sql` | Fix anti-chunking guard di Supabase `leaderboard_score_config` diturunkan ke 10s untuk real-time prediction interval |

---

## 9. Service Key Files

| File | Fungsi |
|---|---|
| `qwen-inference.service.ts` | **4-Tier Inference Engine.** Cascades: Qwen 2.5 7B (HuggingFace) → Llama 3.3 70B (OpenRouter) → Llama 70B/8B (Groq, dengan sub-fallback otomatis 70B→8B) → Local Simulation. Cooldown **30s** untuk rate limit (429/503), **5 menit** untuk billing error (402). Auto-Recovery probing otomatis re-probe tier yang cooldown-nya habis. **Agent Simulation State Cache** (`agentSimState`): menyimpan probabilitas terakhir per agent agar simulation tidak reset ke reference probability. **Agent-Hash Noise**: setiap agent mendapat noise deterministik unik agar output simulation divergen antar agent. |
| `agent-runner.service.ts` | Loop agen otonom realtime dengan **serialized processing** (1 agent per waktu, 3s inter-agent delay). Bootstrap prediction dibatasi **2 prediksi** per agent baru. Inter-prediction delay 2s + execution jittering ±15%. Termasuk logic **Auto-Termination** jika semua kompetisi agen berakhir dan **Final Rank** assignment (1-3) untuk Trophy display. |
| `leaderboard-scoring.service.ts` | Weighted Brier scoring, HMAC chain, rank trends, broadcast realtime, dan update Rank Akhir |
| `CompetitionLeaderboard.tsx` | Frontend realtime dengan dynamic provider badges: `🧠 HF (Qwen-2.5)` via `[Qwen]` tag, `🌐 OPENROUTER (Llama-70B)` via `[OpenRouter` tag, `⚡ GROQ (Llama-3)` via `[Groq]`/`[Groq-8B]` tag, `⚙️ LOCAL-SIM` via `[LOCAL-SIM]` tag, `🤖 AI` sebagai default fallback. |

---

## 10. Known Issues & Catatan

| Issue | Status | Catatan |
|---|---|---|
| HuggingFace API 410 (deprecated endpoint) | ✅ Fixed | URL diubah ke `router.huggingface.co/v1/chat/completions` |
| Missing `probability` column | ✅ Fixed | Migration 064 |
| Missing `reasoning` column | ✅ Fixed | Migration 064 |
| Missing `projected_curve` column | ✅ Fixed | Migration 064 |
| HuggingFace 402 (billing/payment) | ⚠️ Active | Free tier habis. Cooldown 5 menit. Perlu tambah kredit HuggingFace untuk re-enable Tier 1. |
| OpenRouter 429 (rate limit) | ⚠️ Active | Free tier rate-limited. Cooldown 30s dengan auto-recovery probing. |
| Groq 70B 429 (rate limit) | ℹ️ Info | Auto-fallback ke Groq 8B (`llama-3.1-8b-instant`). Jika 8B juga 429, cooldown 30s. |
| Frontend badge salah (Groq-8B → HF) | ✅ Fixed | Badge sekarang mendeteksi `[Groq]` DAN `[Groq-8B]`. Default fallback diubah dari "HF" ke "AI". |
| Thundering herd API exhaustion | ✅ Fixed | Serialized processing (concurrency 1), bootstrap limit 2, inter-prediction delay 2s. |
| HuggingFace 401 (Invalid token) | ⚠️ User Action | Perlu set `HUGGINGFACE_TOKEN` di environment variable API |
| RabbitMQ not connected | ℹ️ Info | `MarketMessagingService` — opsional, tidak blocking |
| CryptoPanic API 404 | ℹ️ Info | API pihak ketiga mungkin sudah berubah endpoint |

---

## 11. UI/UX Frontend Routing & Optimization Mechanism

### 11.1 Dynamic Visibility & Component Rendering
Platform secara arsitektural menyembunyikan komponen Dashboard yang berat *(Probability Curves, NLP Sentiment, Deploy Agent, Value Pool, Leaderboard)* jika user memfokuskan antarmuka pada meta-tab Intelligence (`For You`, `Latest`, `Signals`). Ini memberikan tampilan *feed-only* yang jernih untuk membaca data market tanpa abstraksi grafis, yang lalu direstorasi penuh saat kembali ke `Top Markets` atau Halaman Kategori Penuh.

### 11.2 Cross-Category Meta-Tab Redirects (LocalStorage Handshake)
Navigasi Meta-Tab dari Menu Hamburger (`Header.tsx`) memiliki mekanisme interceptor:
Bila *user* sedang berada di halaman kategori terisolasi (mis: `/category/politics`) dan mengeklik meta-tab seperti `Latest` atau `For You`, Router Next.js menggunakan `localStorage.setItem('redirect_tab')` sebelum mendorong rute ke Indeks (`/`). Saat halaman *Home* berhasil me-*mount*, efek samping bereaksi spontan untuk merestorasi *target meta-tab* idaman, lalu mengosongkan *cache tracking*. Ini menutupi putusnya relasi status Next.js antara halaman terpisah.

### 11.3 Theme Persistence Engine
Perpindahan tema `Light / Dark` mode dieksekusi via injeksi manipulasi `document.documentElement.setAttribute('data-theme')` dan diintegrasikan 100% menggunakan CSS Variable Fallback. `localStorage('exoduze_theme')` memastikan pilihan mode melekat permanen tanpa berkedip kala rendering sesi ulang.
