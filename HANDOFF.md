# HANDOFF — running & deploying PRM Voice

This is everything you need to run the app locally and ship the live demo. The
design rationale lives in [`docs/superpowers/specs/2026-05-30-prm-voice-v1-design.md`](docs/superpowers/specs/2026-05-30-prm-voice-v1-design.md).

## What's built & verified

| Piece | Status |
|---|---|
| **Web app** (`web/`) — 3 mobile screens + 24 CRUD API routes + Prisma + seed | ✅ Built & **verified end-to-end** against a live Postgres (migrate + seed + all screens rendering real data, 0 console errors). See [`docs/screenshots/`](docs/screenshots/). |
| **Voice server** (`server/`) — Pipecat main + action workers, 16 tools | ✅ NVIDIA Nemotron + Parakeet + Gradium (no OpenAI). Boots on :7860 (`/start`); all services construct against the live endpoints; Nemotron tool-calling verified. ⏳ Live audio round-trip needs a real browser + mic. |
| **Shared contracts** — typed API client, RTVI protocol (TS↔Python) | ✅ Locked & mirrored. |

The app is **Architecture B**: a standalone Next.js app (works with no voice) + an optional Pipecat voice agent that drives it. The voice agent and the UI both go through the **same Next.js API**, so they can't desync.

## Prerequisites
- Node ≥ 20 + `pnpm` (repo uses pnpm 10)
- Python 3.12 + `uv` (the server pins 3.12 — Pipecat doesn't support 3.14 yet)
- Postgres — local via Docker, or a Supabase project

## Keys / accounts you must provide

| Need | For | Env var(s) | Notes |
|---|---|---|---|
| **Postgres** | the shared world | `DATABASE_URL` (web) | Local Docker (below) or Supabase. |
| **LLM** | voice reasoning + tool-calling | `NEMOTRON_LLM_URL` / `_MODEL` (+ `_API_KEY`) | NVIDIA Nemotron-3-Super (vLLM, OpenAI-compatible `/v1`). Tool-calling verified live. |
| **STT** | speech → text | `NVIDIA_ASR_URL` | NVIDIA Parakeet streaming ASR (16-bit PCM, 16 kHz, mono). |
| **TTS** | text → speech | `GRADIUM_API_KEY` (+ optional `GRADIUM_VOICE_ID`) | Gradium. |

> ✅ As of 2026-05-30 the NVIDIA endpoints (Parakeet ASR + Nemotron LLM) and the Gradium key from `yc-voice-agents-hackathon/server/.env` are **live**, and `server/.env` is already configured with them. The stack is **NVIDIA + Gradium only — no OpenAI**.

## Local dev

```bash
# 0. Postgres (or skip and point DATABASE_URL at Supabase)
docker compose up -d db          # postgres:16 on :5432 (user/pass/db = prm)

# 1. Web app (the standalone PRM — works without voice)
cd web
cp .env.example .env             # set DATABASE_URL (default already matches docker-compose)
pnpm install
pnpm exec prisma migrate deploy  # apply the schema
pnpm run db:seed                 # load the demo world (12 people, dates, moments, reminders)
pnpm dev                         # → http://localhost:3000

# 2. Voice agent (optional overlay) — in a second terminal
cd server
cp .env.example .env             # set NEMOTRON_LLM_URL, NVIDIA_ASR_URL, GRADIUM_API_KEY; PRM_API_BASE_URL=http://localhost:3000
uv sync
uv run bot.py                    # → WebRTC bot-start endpoint on http://localhost:7860/start
# then in web/.env set NEXT_PUBLIC_BOT_START_URL=http://localhost:7860/start and restart `pnpm dev`
```

The seed is **deterministic and anchored to 2026-05-30** (so the Today surface is populated on that date). Re-seed anytime via `pnpm run db:seed` or `POST /api/admin/reset`.

## Deploy

**Database → Supabase**
1. Create a project; copy the Postgres connection string into `DATABASE_URL`.
2. `cd web && DATABASE_URL=<supabase-url> pnpm exec prisma migrate deploy && DATABASE_URL=<supabase-url> pnpm run db:seed`.

**Web → Vercel**
1. Import the repo; set **Root Directory = `web`** (framework auto-detected as Next.js).
2. Env: `DATABASE_URL` (Supabase), `NEXT_PUBLIC_API_BASE_URL=` (empty = same-origin), `NEXT_PUBLIC_BOT_START_URL` (the deployed bot-start URL, once the server is up).

**Voice server → Pipecat Cloud** (`server/pcc-deploy.toml` + `server/Dockerfile` are ready)
1. Create the secret set `prm-voice-secrets` with the `server/.env` values (set `PRM_API_BASE_URL` to your Vercel URL).
2. Deploy with the Pipecat Cloud CLI; `min_agents = 1` keeps one agent warm so the demo connects instantly.

## Voice ⇄ UI protocol (if you extend it)
- **Server → client** `UICommand`: `navigate {route}` (route `"back"` = `router.back()`), `refresh {}`, `highlight {targetId}`, `toast {message, level?}`.
- **Client → server** `UIEvent`: `hello {}`, `screen {route, title, visible:[{kind,id?,label}]}` (sent on `BotReady`, then on every screen change). Powers `answer_about_screen` + deixis ("open the first one").
- Defined once in `web/src/lib/rtvi-protocol.ts` and mirrored in `server/prm/protocol.py`.

## Open items / risks
1. **NVIDIA endpoints are hackathon-hosted** — currently live, but ephemeral; if they go down, point `NEMOTRON_LLM_URL` / `NVIDIA_ASR_URL` at managed or self-hosted Nemotron + Parakeet. Gradium TTS is a hosted SaaS.
2. **Nemotron tool-calling fidelity** — validate single-tool-per-turn before relying on the NVIDIA path (the 2-inference design depends on it).
3. **Shared-world drift** — it's a single open dataset; reset via `POST /api/admin/reset` (consider a daily cron). Seed reminder timestamps are absolute (anchored to 2026-05-30).
4. **A real voice call hasn't been run** (no keys/mic in the build env) — first live test: connect the dock and try "What do I know about Sarah?" and "Add a note to David: …".
