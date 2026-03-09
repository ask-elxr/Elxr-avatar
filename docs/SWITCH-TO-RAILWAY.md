# Switch from Replit to Railway

Short checklist to run the avatar app on Railway for better reliability. Full technical detail is in [railway-migration.md](./railway-migration.md).

---

## 1. Railway project

1. Go to [railway.app](https://railway.app) and sign in.
2. **New Project** → **Deploy from GitHub repo** (connect GitHub if needed).
3. Select this repo and the **`standalone`** branch (not `main`). The Railway Dockerfile, `railway.toml`, and non-Replit asset/auth paths exist only on `standalone`; `main` is Replit-oriented and has no Dockerfile.
4. Railway will detect `railway.toml` and use the **Dockerfile** for the build.

---

## 2. Environment variables

In the Railway project: **Variables** → add every variable you use on Replit.

**Copy from Replit:**  
Replit → Tools → Secrets → copy names and values into Railway Variables.

**Required (minimum to run):**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL (same as Replit) |
| `SESSION_SECRET` | Session signing (use a new random string) |
| `ADMIN_SECRET` | Admin panel auth |
| `ANTHROPIC_API_KEY` | Claude |
| `OPENAI_API_KEY` | Embeddings |
| `PINECONE_API_KEY` | Vectors |
| `HEYGEN_API_KEY` | Avatars |
| `ELEVENLABS_API_KEY` | Voice |
| `MEMBERSTACK_SECRET_KEY` | Billing |

**Do not set on Railway:**

- `REPLIT_DOMAINS` — leave unset so the app uses non-Replit auth and storage paths.
- `REPL_ID` — leave unset.
- `PORT` — Railway sets this automatically.

**Asset storage (avatars, intro videos, GIFs):**  
On Replit you use Replit Object Storage. On Railway you use Firebase/GCS:

- Set `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY` (see [railway-migration.md – Firebase / GCS Asset Storage](./railway-migration.md#firebase--gcs-asset-storage)).
- Upload your `attached_assets` folder to the GCS bucket once (e.g. `gsutil -m cp -r attached_assets/* gs://YOUR_BUCKET/attached_assets/`).

If you skip GCS for now, the app still runs; intro videos and some asset URLs may 503 until you complete GCS setup.

---

## 3. Deploy

- Push to the branch Railway watches. It will:
  - Build the Docker image (install deps, `npm run build`).
  - Run `npm run start` (serves on `PORT`).
  - Hit `/api/health` until it gets 200 (up to 120s), then mark the deploy live.

- In Railway, open **Settings** → **Networking** → **Generate Domain** to get a URL like `https://your-app.up.railway.app`.

---

## 4. Update Webflow / embeds

Replace the Replit domain with your Railway domain everywhere:

- **Webflow embed / iframe URLs:**  
  `https://YOUR-REPLIT-DOMAIN.replit.app` → `https://your-app.up.railway.app`
- **Avatar URLs:**  
  `https://your-app.up.railway.app/avatar?mentor=mark-kohl` (and same for other mentors).
- **Memberstack / postMessage:**  
  No code change; only the origin (domain) of the iframe changes.

---

## 5. Auth on Railway (no Replit login)

- **Replit:** Users could log in with Replit OIDC.
- **Railway:** There is no Replit OIDC. The app uses:
  - **Memberstack** for identity when embedded in Webflow (pass `member_id` in URL or postMessage).
  - **Admin:** `ADMIN_SECRET` (header or query) for admin routes.
  - **Dev/mock:** If not on Replit and no Memberstack, the app can use mock auth (see [railway-migration.md – Authentication](./railway-migration.md#authentication-on-railway)).

So for Webflow: users log in only via Memberstack on Webflow; the avatar app does not need a separate “Railway login.”

---

## Quick reference

| Step | Action |
|------|--------|
| 1 | Create Railway project from GitHub; connect the **`standalone`** branch (not `main`). |
| 2 | Add all env vars from Replit; do **not** set `REPLIT_DOMAINS` or `REPL_ID`. |
| 3 | (Recommended) Configure GCS and upload `attached_assets` for intro videos and assets. |
| 4 | Deploy; generate a public domain in Railway. |
| 5 | Replace Replit domain with Railway domain in Webflow and any embed URLs. |

For full details (Docker, health checks, Firebase/GCS, troubleshooting), see [railway-migration.md](./railway-migration.md).
