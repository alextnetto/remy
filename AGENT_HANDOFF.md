# AGENT HANDOFF — continuing PRM Voice

You're picking up orchestration of **PRM Voice**, a mobile-first Personal Relation Manager with an optional voice agent. This doc is self-contained: read it + the spec and you can continue without the prior conversation.

- **Repo:** github.com/alextnetto/prm-voice (private). Local: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/prm-voice`
- **Spec (source of truth):** `docs/superpowers/specs/2026-05-30-prm-voice-v1-design.md`
- **Ops / setup / deploy:** `HANDOFF.md` (this doc is about *what's done + what's next*, not setup)
- **Research on the reference repos:** `docs/research/`
- **Owner:** alextnetto / blockful. Stack is **NVIDIA + Gradium** (no OpenAI).

## TL;DR status (2026-05-30)

The **whole thing works end-to-end, locally, verified**:
- Standalone web app (Next.js + shadcn + Prisma/Postgres): 3 screens render the seeded world, all 24 CRUD routes work. Screenshots in `docs/screenshots/`.
- Voice agent (Pipecat, NVIDIA Nemotron + Parakeet + Gradium): a real WebRTC session connects and the bot **speaks a greeting** — STT → LLM → TTS chain confirmed in the bot logs.

**Not deployed yet** (local only), and **the voice *tools* aren't verified in a live conversation yet** (see Next Steps #1). That's the most important open item.

## What this is (90 seconds)

A CRM for personal relationships. Hero loop = **remember & recall by voice**: "Add a note to David that he loves climbing" / "What do I know about Sarah?". It's a live, open, no-login demo over a **single shared seeded world**.

**Architecture B:** the Next.js app is fully usable on its own; the voice agent is an *optional overlay* that calls the **same Next.js API** for data and drives the UI over an RTVI protocol. One source of truth (the DB) → no desync.

## Monorepo map

```
prm-voice/
├── web/                      # Next.js 16 (App Router) + shadcn (Base UI) + Prisma 7
│   ├── prisma/schema.prisma  # 9 tables (people, contact_methods, important_dates, notes,
│   │                         #   organizations, person_organizations, moments, moment_people, reminders)
│   ├── prisma/seed.ts        # deterministic demo world, anchored to 2026-05-30
│   └── src/
│       ├── lib/              # ★ THE CONTRACTS — read these first
│       │   ├── types.ts          # DTOs (Person, PersonDetail, …)
│       │   ├── api-contract.ts    # typed `api` client + endpoint catalogue
│       │   ├── rtvi-protocol.ts   # UICommand/UIEvent (mirrors server/prm/protocol.py)
│       │   ├── voice-bridge.ts    # decouples screens ↔ voice client (refresh/highlight/screen report)
│       │   └── db.ts              # Prisma 7 singleton (import { db })
│       ├── app/api/**        # CRUD route handlers (real Prisma queries)
│       ├── app/{page,people/[id]/page,reminders/page}.tsx   # the 3 screens
│       └── components/voice/{rtvi-provider,voice-dock}.tsx  # the voice client + docked widget
└── server/                   # Python 3.12 + Pipecat 1.3 voice agent
    ├── bot.py                # main voice worker: Parakeet STT → Nemotron LLM → Gradium TTS + RTVI
    ├── llm.py                # create_llm_service() → Nemotron (VLLMOpenAILLMService)
    ├── action_worker.py      # PRMActionWorker (UIWorker): 16 tools, screen-state injection
    └── prm/{protocol.py, api_client.py, services/{nemotron_llm,nvidia_stt}.py}
```

## How to run + verify (all verified this session)

```bash
# 1. DB (docker)
docker compose up -d --wait db                       # postgres:16, container prm-voice-db, :5432

# 2. Web (the standalone app)
pnpm -C web install                                  # (already installed)
pnpm -C web exec prisma migrate deploy               # apply schema
pnpm -C web run db:seed                               # 12 people, dates, moments, reminders
pnpm -C web dev                                       # → http://localhost:3000

# 3. Voice agent (optional overlay)
uv run --directory server bot.py                      # → http://localhost:7860 (/start)
```

`server/.env` and `web/.env` already hold working creds (gitignored). `server/.env` uses the **live** NVIDIA Nemotron + Parakeet endpoints and the Gradium key from `../yc-voice-agents-hackathon/server/.env`.

### Verifying the voice agent without a real mic (important trick)

A headless browser can't grant a microphone, so to test the voice path with Playwright, **fake the mic** before clicking Connect:

```js
// run in the page (e.g. Playwright browser_evaluate), then click "Talk to your assistant"
const ctx = new AudioContext(), osc = ctx.createOscillator(), dst = ctx.createMediaStreamDestination();
osc.connect(dst); osc.start();
navigator.mediaDevices.getUserMedia = async () => dst.stream;
```

Then watch the bot log (the `uv run bot.py` output) for `NVidiaWebSocketSTTService TTFB`, `VLLMOpenAILLMService Generating chat`, `GradiumTTSService Generating TTS`, `Bot started speaking`. A real conversation needs a real mic + **headphones** (otherwise the bot hears its own TTS).

## Hard-won gotchas (DO NOT relearn these)

1. **Voice connection mode (the big one).** Construct the transport **bare** and pass connect params to `client.connect()` — NOT via the transport's `webrtcRequestParams`. The latter is "direct-offer" mode (POSTs offer + PATCHes ICE to `/start` → **405**). `client.connect({endpoint, requestData})` is the "start-bot" flow the demo uses: `POST /start` → `sessionId` → `POST`/`PATCH /sessions/<id>/api/offer`. See `rtvi-provider.tsx`.
2. **NVIDIA only — no OpenAI.** The source `.env` has no OpenAI key. `llm.py` builds Nemotron directly; `bot.py` uses Parakeet STT directly. Don't reintroduce provider switching.
3. **Nemotron specifics:** it *does* handle the `developer` role (verified) and does correct OpenAI-style tool-calling. `bot.py` sets `audio_in_sample_rate=16000` / `audio_out_sample_rate=24000` (Parakeet needs 16 kHz) + `FilterIncompleteUserTurnStrategies()` — match the hackathon `bot-nemotron.py`.
4. **Prisma 7:** DB URL lives in `web/prisma.config.ts` (not the schema). Client generates to `web/src/generated/prisma` (gitignored — run `prisma generate`). Import `{ db }` from `@/lib/db` (uses `@prisma/adapter-pg`). `seed.ts` needs `import "dotenv/config"` to run under `tsx`.
5. **Next.js 16 / React 19 / shadcn-on-Base-UI:** route `params` is a `Promise` (`await ctx.params`). shadcn here is **Base UI**, not Radix (dialogs controlled; no `Select` primitive → native select). Read `web/AGENTS.md`.
6. **Seed is anchored to 2026-05-30** — reminders/Today only look "alive" near that date. Recurring important_dates always work. Reset via `POST /api/admin/reset` or `pnpm -C web run db:seed`.

## Next steps (prioritized)

1. **★ Verify the voice TOOLS in a live conversation.** Only the connect + greeting + STT/LLM/TTS chain is proven. Exercise the actual tools end-to-end with a real mic + headphones: "Add a note to David…" (→ `add_note` → API → UI refresh), "What do I know about Sarah?" (→ `answer_about_person`), "Open Sarah" / "Go to reminders" (→ navigation UICommands). Watch both the bot log and the web UI updating. Fix tool/prompt issues as found (the 16 tools live in `action_worker.py`).
2. **Deploy** (see `HANDOFF.md`): Web → Vercel (root dir `web`), DB → Supabase, voice server → Pipecat Cloud (`server/Dockerfile` + `pcc-deploy.toml` ready; Pipecat Cloud's Krisp filter handles echo). Set `NEXT_PUBLIC_BOT_START_URL`, `PRM_API_BASE_URL`, `DATABASE_URL`.
3. **Demo hardening:** echo cancellation for local/non-Krisp use, a reset cron for the shared world, basic rate-limit/profanity guard on the API, and reconsider the seed date anchoring (or auto re-anchor on reset).
4. **Deferred product features** (out of v1 scope, see spec §non-goals): interaction timeline, org detail screens, tags/groups, richer search, dedup/merge of people, auth/multi-user.

## Risks
- **NVIDIA endpoints are hackathon-hosted** (AWS) — currently live but ephemeral. If they drop, repoint `NEMOTRON_LLM_URL` / `NVIDIA_ASR_URL` (managed/self-hosted) — see `HANDOFF.md`. Gradium TTS is hosted SaaS (key from the hackathon `.env`, could expire).
- **Single shared world, no auth** — anyone can edit; rely on reset + guardrails.

## How this was built (so you can continue the same way)

Claude as **orchestrator** + **parallel Opus 4.8 subagents** against pre-locked contracts:
1. Research subagents read the reference repos (`../pipecat-music-player`, `../yc-voice-agents-hackathon`) → `docs/research/`.
2. Brainstormed the spec with the user → `docs/superpowers/specs/...`.
3. A foundation pass scaffolded the monorepo + locked the contracts (`web/src/lib/*`, `server/prm/protocol.py`).
4. **4 parallel agents** built disjoint slices against those contracts: (a) DB+API+seed, (b) screens, (c) voice client, (d) Python voice server.
5. The orchestrator integrated, verified (build, seeded DB, Playwright screenshots, faked-mic voice test), and fixed seams.

To extend: lock any new contract first (types/API/protocol), then fan out agents on disjoint files, then integrate + verify. The reference repos remain the ground truth for "how Pipecat is supposed to work" — when in doubt, match them.

## Git
Latest: `18e2177`. Journey: scaffold → foundation+contracts → 4-agent build → integration (verified) → NVIDIA-only simplification → voice connection fixes. `git log --oneline` for the full trail. `server/.env` and `web/.env` are gitignored (never commit them).
