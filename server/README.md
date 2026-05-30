# PRM Voice — voice server (Python / Pipecat)

The optional voice overlay for the PRM web app (spec §2, Approach B). Two
Pipecat workers on one bus:

- **`bot.py` — main `PipelineWorker`** (`transport.in → STT → LLM(router) →
  TTS → transport.out`, RTVI on). Its single tool `handle_request(query)`
  forwards each utterance to the action worker and speaks the reply verbatim.
- **`action_worker.py` — `PRMActionWorker` (`UIWorker`)** owns the PRM tools.
  It mutates data through the web app's Next.js API (`prm/api_client.py`),
  drives the live client with UI commands (`navigate`/`refresh`/`highlight`/
  `toast`), and grounds deixis ("the first one", "her") against the
  client-reported screen injected as `<ui_state>`.

The voice server holds **no** data state — the Next.js API
(`PRM_API_BASE_URL`) is the single source of truth.

## Running

Prereqs: [`uv`](https://docs.astral.sh/uv/), and the web app running so its
API is reachable (default `http://localhost:3000`).

```bash
# 1. Install deps (fetches Python 3.12 per .python-version).
uv sync

# 2. Configure env.
cp .env.example .env   # then fill in keys (see below)

# 3. Run the bot. Binds http://localhost:7860 (SmallWebRTC /start endpoint).
uv run bot.py
```

Then connect from the web app's voice dock (it POSTs to the `/start` URL and
negotiates WebRTC). On connect the client sends a `hello` event and reports
its `screen`; the worker greets and is ready.

### Minimum env to run (dev default: OpenAI + Gradium)

The default providers are **OpenAI** (LLM) + **Gradium** (STT and TTS), so the
demo runs without the NVIDIA endpoints (which may be offline — spec §10).

| Var | Needed for | Notes |
|---|---|---|
| `PRM_API_BASE_URL` | always | Next.js app origin, e.g. `http://localhost:3000`. |
| `OPENAI_API_KEY` | `LLM_PROVIDER=openai` (default) | |
| `OPENAI_MODEL` | optional | defaults to `gpt-4.1`. |
| `GRADIUM_API_KEY` | always (STT fallback + TTS) | |
| `GRADIUM_VOICE_ID` | optional | TTS voice. |

### Provider swaps (spec §7)

- **LLM** — `LLM_PROVIDER`: `openai` (default) or `nvidia` (Nemotron‑3‑Super
  via a vLLM OpenAI‑compatible endpoint; set `NEMOTRON_LLM_URL`,
  `NEMOTRON_LLM_MODEL`, `NEMOTRON_LLM_API_KEY`; thinking off by default —
  `NEMOTRON_ENABLE_THINKING=true` to enable). Branch lives in `llm.py`.
- **STT** — `STT_PROVIDER`: `gradium` (default) or `nvidia` (Parakeet over
  WebSocket; set `NVIDIA_ASR_URL`). Switch lives in `bot.py:_create_stt()`.
- **TTS** — Gradium (primary). **Transport** — SmallWebRTC (v1) / Daily.

> The NVIDIA Nemotron/Parakeet endpoints are hackathon‑hosted and may be
> offline; keep the OpenAI + Gradium fallback as the public demo default and
> treat NVIDIA as a toggle.

## What needs live keys / transport to run end‑to‑end

Everything imports and the worker graph constructs offline (see *Verify*
below), but a real conversation needs:

- **Gradium API key** — STT + TTS audio.
- **An LLM key/endpoint** — `OPENAI_API_KEY` (default) or a reachable
  Nemotron vLLM endpoint.
- **The web API up** at `PRM_API_BASE_URL` — every data tool calls it.
- **A WebRTC client** (the web app's voice dock) to connect to `/start`.

## Verify (offline — no keys/transport)

```bash
# Clean import of every module.
uv run python -c "import bot, action_worker; from prm import api_client, protocol; from prm.services import nemotron_llm, nvidia_stt"

# Lint.
uv run ruff check .
```

## Protocol (keep in sync with `web/src/lib/rtvi-protocol.ts`)

- Client → server `UIEvent`: `hello`, `screen` (`{route, title, visible[]}`).
- Server → client `UICommand`: `navigate {route}`, `refresh {}`,
  `highlight {targetId}`, `toast {message, level?}`.

## Deploy

`pcc-deploy.toml` targets Pipecat Cloud (`min_agents=1` to stay warm). Set
secrets from `.env`, then deploy. Alt: Railway.
