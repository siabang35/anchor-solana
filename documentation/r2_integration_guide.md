# ExoDuZe — Cloudflare R2 Storage Integration & Database Optimization Guide

This documentation details the architecture, code implementations, environment configurations, and database optimization strategies applied to keep the ExoDuZe backend and database lightweight, high-performance, and fully compliant with the resource constraints of Supabase Free Tier (500MB DB Limit).

---

## 🏗️ Architecture Overview

To prevent write-locks, replication lag, and rapid disk consumption in PostgreSQL, ExoDuZe offloads all large structured payloads, binary media, and cold historical logs to Cloudflare R2 (S3-compatible API). 

### Data Flow Architecture

```mermaid
graph TD
    subgraph "NestJS Application Modules"
        A[SportsSyncService]
        B[NotificationsService]
        C[UsersService]
        D[StorageOptimizationService]
    end

    subgraph "Cloudflare R2 Bucket (exoduze)"
        R1["/sports_sync_raw/ (Scraper payloads)"]
        R2["/notifications/ (Metadata > 10KB)"]
        R3["/avatars/ (User profile media)"]
        R4["/archives/ (Historic curves)"]
    end

    subgraph "PostgreSQL (Supabase)"
        DB1[(sports_sync_logs)]
        DB2[(notifications)]
        DB3[(profiles)]
        DB4[(probability_history)]
    end

    A -->|"upload raw JSON"| R1
    A -->|"write R2 URL ref"| DB1
    
    B -->|"offload metadata >10KB"| R2
    B -->|"write small JSON ref"| DB2
    
    C -->|"upload image"| R3
    C -->|"write public CDN URL"| DB3
    
    D -->|"archive curve batches"| R4
    D -->|"delete old curve rows"| DB4
```

---

## ⚙️ Environment Variables

### Backend Configuration (`api/.env` & `api/.env.production`)
Add the following credentials to your environment configuration files. When these keys are present, the application automatically activates R2 mode; if absent, it falls back gracefully to Supabase Storage and inline DB logging.

```env
# ============================================================================
# Cloudflare R2 Storage Configuration (S3-compatible API)
# ============================================================================
# Cloudflare Account ID (Found on your CF Dashboard sidebar)
CLOUDFLARE_R2_ACCOUNT_ID=your_cloudflare_account_id

# S3-compatible API Token Credentials (R2 -> Manage R2 API Tokens)
CLOUDFLARE_R2_ACCESS_KEY_ID=your_cloudflare_r2_access_key_id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_cloudflare_r2_secret_access_key

# Public CDN URL for serving public media (e.g. avatars, banners)
# Format: https://pub-xxxxxx.r2.dev or a custom domain like https://media.exoduze.com
CLOUDFLARE_R2_PUBLIC_URL=https://pub-ganti-dengan-hash-r2-anda.r2.dev

# Bucket Name Config (Consolidated single bucket setup)
CLOUDFLARE_R2_BUCKET_ARCHIVES=exoduze
CLOUDFLARE_R2_BUCKET_MEDIA=exoduze
CLOUDFLARE_R2_BUCKET_ETL_RAW=exoduze
```

### Frontend Configuration (`app/.env.local` & `app/.env.production`)
```env
NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL=https://pub-ganti-dengan-hash-r2-anda.r2.dev
```

---

## 🛠️ Code Implementations & Optimizations

### 1. The Global R2 Service (`src/database/r2.service.ts`)
This service acts as the wrapper for the S3 Client, exposing high-level methods for object storage management:
* **`uploadObject(bucket, key, body, contentType)`**: Uploads a buffer or string to R2.
* **`getObject(bucket, key)`**: Retrieves an object as a string or readable buffer.
* **`deleteObject(bucket, key)`**: Deletes an object.
* **`getPresignedUploadUrl(...)`**: Generates a pre-signed URL allowing the frontend client to upload media directly to R2, bypassing backend resource usage.
* **`isActive()`**: Evaluates whether the application is configured to run Cloudflare R2.

### 2. Scraper Offloading (`src/modules/sports/sports-sync.service.ts`)
Scraper operations retrieve high-volume, repetitive JSON files from sports APIs. Instead of inserting large text blobs into DB tables:
* Payloads are stringified and written to `sports_sync_raw/${yearMonth}/${id}.json`.
* PostgreSQL logs the metadata execution summary and the lightweight reference URL (`r2_raw_payload_url`).
* Scraped modules optimized: `syncAllLeagues`, `syncUpcomingEvents`, `syncLiveScores`, `syncTeamsByLeague`, `syncOdds`, and `syncFromAPISports`.

### 3. Notification Payload Clamping (`src/modules/notifications/notifications.service.ts`)
System alerts and predictions can carry extensive JSON metadata:
* If a notification's metadata payload exceeds **10KB**, it is intercepted before PostgreSQL database write.
* The backend saves the raw metadata to `notifications/${userId}/${Date.now()}_metadata.json` on Cloudflare R2.
* The database record is written with a placeholder: `{ r2_archived: true, r2_url: "..." }`.

### 4. User Profile Assets (`src/modules/users/users.service.ts`)
* Profile avatar images bypass the database transaction completely.
* Images are uploaded directly to `avatars/${userId}/${Date.now()}.${fileExt}` inside the R2 media directory.
* The database profile's `avatar_url` is updated with the public Cloudflare CDN URL.

### 5. Curves & Logs Downsampling (`src/modules/markets/storage-optimization.service.ts`)
* High-frequency realtime prediction curves are compressed and archived to `archives/` prefix inside the `exoduze` bucket.
* Historic raw database rows are purged to reclaim DB space, maintaining database lightweight status.

---

## 🔒 Security & Best Practices

1. **Least Privilege API Tokens**: 
   When generating the Cloudflare R2 API token, select **"Object Read & Write"** scoped strictly to the `exoduze` bucket rather than using full administrative privileges.
2. **Access Control Routing**:
   * Public assets (e.g. `avatars/`) are served through the public R2 domain (`CLOUDFLARE_R2_PUBLIC_URL`).
   * Private logs (e.g. `archives/`, `sports_sync_raw/`) should have restricted public HTTP access. You can configure a **Cloudflare WAF (Web Application Firewall) rule** on the R2 domain to block incoming HTTP requests targeting paths starting with `/archives` or `/sports_sync_raw`.
3. **CORS Configuration**:
   If the frontend needs direct uploads/downloads to R2, apply a CORS policy to your R2 bucket. In the Cloudflare Dashboard, go to **R2 -> exoduze -> Settings -> CORS Policy** and paste:
   ```json
   [
     {
       "AllowedOrigins": ["https://exoduze.com", "http://localhost:3000", "http://localhost:5173"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

---

## 💎 Cloudflare R2 Free Tier Protections & Cost Optimization

To ensure that the Cloudflare R2 storage remains **100% free forever** during development and scaling, the following system limitations and configurations have been put in place:

### 1. Understanding Cloudflare R2 Free Tier Quotas
* **Storage Capacity**: Up to **10 GB** per month.
* **Class A Operations** (Writes, Lists, State Changes): **1,000,000** (1 Million) per month.
* **Class B Operations** (Reads, Downloads): **10,000,000** (10 Million) per month.
* **Egress Bandwidth**: **$0.00** (Always Unlimited & Free) — *R2 has no bandwidth fees*.

### 2. Safeguards Implemented in the Codebase
* **Upload Buffers & File-Size Clamping**:
  User avatar uploads are restricted to a maximum of **5 MB** and validated using NestJS `ParseFilePipe` (`MaxFileSizeValidator` and `FileTypeValidator` for images only).
* **Batch Archiving (Class A Protection)**:
  Instead of writing individual historical logs, the `StorageOptimizationService` runs a batch scheduler once every 6 hours. It maps up to 1,000 database rows into a single structured JSON file before uploading it to the `archives/` prefix. This batching method reduces write operations from hundreds of thousands to just **4 Class A operations per day per competition**.
* **ETL Sync Logs (Class A Protection)**:
  Sports sync raw payload uploads to R2 run on low-frequency cron schedules (e.g., every 5 minutes). At maximum frequency, this generates ~8,640 writes per month, which consumes **less than 0.9%** of the 1 million free Class A operations limit.

### 3. Recommended Cloudflare Dashboard Configurations (Must-Dos)
To fully bulletproof the R2 free tier from exceeding its limits:
1. **Enable Cloudflare Edge Caching (Custom Domain)**:
   Instead of using the default R2 Account URL (`https://<account_id>.r2.cloudflarestorage.com`) directly on the client, configure a **Custom Domain** (e.g. `media.exoduze.com`) for the R2 bucket.
   * *Why?* Cloudflare caches public assets (like avatars and icons) at the edge CDN. Subsequent client requests are served directly from Cloudflare's CDN edge cache, consuming **0 Class B read operations** from R2.
2. **Configure Lifecycle Rules (Storage Cleanup)**:
   In the Cloudflare Dashboard, navigate to **R2 -> exoduze -> Settings -> Object Lifecycle Rules** and create rules to auto-delete stale temporary data:
   * **Rule 1 (ETL Raw Payload Logs)**:
     * Prefix: `sports_sync_raw/`
     * Action: **Delete** objects older than **7 Days**.
   * **Rule 2 (Historical Data Archives)**:
     * Prefix: `archives/`
     * Action: **Delete** objects older than **30 Days**.
   * *Why?* Auto-deleting temporary data keeps the total bucket size constantly below **1 GB**, ensuring the 10 GB free storage limit is never exceeded.

