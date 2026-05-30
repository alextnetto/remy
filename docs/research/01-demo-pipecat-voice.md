# Research: Demo Pipecat Voice Agent — Architecture & Reuse Plan

**Repo studied:** `/Users/netto/work/hackathons/yc-voice-agents-pipecat/yc-voice-agents-hackathon`
**Date:** 2026-05-30
**Goal:** Understand the demo's voice agent and decide exactly what to reuse for our v1 PRM (Personal Relation Manager) with a docked voice agent that calls tools AND drives the UI.

---

## TL;DR

- The repo contains **two parallel things**:
  1. **`server/` (Field & Flower flower-shop bot)** — a telephony/WebRTC voice ordering agent. Two variants: **GPT-4.1** (`bot-gpt.py`) and **NVIDIA Nemotron** (`bot-nemotron.py`). This is a *pure voice* bot (no app UI to drive).
  2. **`server/pipecat-music-player/`** — a **voice-driven UI app** (server + React/Vite client) that demonstrates the *voice + UI separation-of-concerns* pattern: the agent navigates screens, plays items, shows toasts, etc. **This is the closest match to what we're building** and is the most valuable part of the repo for the PRM.
- **STT/LLM/TTS stack is NOT Gladia.** The provider is **Gradium** (`gradium.ai`) for both STT and TTS in the flower bot. **NVIDIA Nemotron** is used as both the **LLM** (Nemotron-3-Super-120B via vLLM) and the **STT** (NVIDIA "Parakeet"/Nemotron Speech Streaming over a custom WebSocket). The music-player demo instead uses **OpenAI + Soniox (STT) + Cartesia (TTS)**.
- **Tool/function calling** is clean and exactly the abstraction we need: plain async Python functions with type hints + docstrings, registered with `llm.register_direct_function(fn)` and described to the model via `ToolsSchema(standard_tools=[...])`. The music player adds a `@tool` decorator on a `UIWorker` subclass for UI-driving tools.
- **Transport** for the browser is **SmallWebRTC** (peer WebRTC, default `http://localhost:7860`), with Twilio WebSocket for telephony and Daily as an alternative in the music player. The client connects via the official `@pipecat-ai/client-js` + `@pipecat-ai/client-react` + `@pipecat-ai/voice-ui-kit`.

> **NOTE / caveat:** During this investigation the nested `server/pipecat-music-player/` directory was present at first and I read its key files (server `bot.py`, `ui_agent.py`, `llm.py`, README, and the client `App.tsx`, `main.tsx`, `config.ts`, the two hooks, `package.json`, `pyproject.toml`), but the directory was then **removed from disk mid-session** (it appears to be a transient/git-ignored nested checkout). All music-player findings below are from files I actually read; a few music-player files I did not get to (e.g. `catalog_agent.py`, `discovery_agent.py`, `deezer.py`, `descriptions.py`, client screens/components, `pcc-deploy.toml`, its `.env.example`) are described from the README's architecture section and import sites. If that subproject is needed verbatim, re-clone `github.com/pipecat-ai/pipecat-music-player` (the README links a live demo at `pipecat-music-player.vercel.app`).

---

## 1. Overall architecture

### 1a. Server layout

```
yc-voice-agents-hackathon/
├── README.md                         # two-version overview, run + deploy + Cekura testing
└── server/
    ├── bot-gpt.py                    # Variant 1: Gradium STT + OpenAI Responses (GPT-4.1) + Gradium TTS
    ├── bot-nemotron.py              # Variant 2: NVIDIA STT + Nemotron-3-Super LLM + Gradium TTS
    ├── nemotron_llm.py             # VLLMOpenAILLMService: OpenAILLMService subclass, fixes TTFB metric for reasoning models
    ├── nvidia_stt.py               # NVidiaWebSocketSTTService: custom WebSocket STT (Parakeet / Nemotron Speech Streaming)
    ├── mock_backend.py             # BOUQUETS catalog + KNOWN_CUSTOMERS dicts (the "DB" to swap out)
    ├── test_nemotron_llm.py        # unit tests for the TTFB-arming logic
    ├── pyproject.toml              # uv project; pipecat-ai[gradium,openai,runner,silero,webrtc,websocket]>=1.3.0
    ├── uv.lock
    ├── Dockerfile                  # FROM dailyco/pipecat-base:latest (Pipecat Cloud build)
    ├── pcc-deploy.toml             # Pipecat Cloud deploy config (agent_name=flower-bot)
    ├── .env / .env.example
    └── pipecat-music-player/       # (transient) voice-driven UI demo: server/ + client/
```

### 1b. Entry points & how the bot process starts

Both `bot-gpt.py` and `bot-nemotron.py` end with:

```python
if __name__ == "__main__":
    from pipecat.runner.run import main
    main()
```

`pipecat.runner.run.main()` is Pipecat's **dev runner**. It starts a small FastAPI/uvicorn server (default port **7860**) that:
- serves a SmallWebRTC signaling endpoint + a basic test page at `http://localhost:7860`,
- exposes a `/start` endpoint the JS client calls to negotiate a connection,
- and for each connection calls the module-level **`async def bot(runner_args: RunnerArguments)`** callback.

`bot(runner_args)` is the real entry point (Pipecat Cloud also calls this). It pattern-matches on the runner-args type to build the right transport, then calls `run_bot(transport, ...)`:

```python
async def bot(runner_args: RunnerArguments):
    ...
    match runner_args:
        case SmallWebRTCRunnerArguments():   # local browser / WebRTC
            transport = SmallWebRTCTransport(webrtc_connection=runner_args.webrtc_connection, params=TransportParams(audio_in_enabled=True, audio_in_filter=krisp_filter, audio_out_enabled=True))
        case WebSocketRunnerArguments():     # Twilio telephony
            ... TwilioFrameSerializer ... FastAPIWebsocketTransport ...
    await run_bot(transport, from_number=from_number, **transport_overrides)
```

`run_bot()` builds the services + pipeline, wraps it in a `PipelineWorker`, and runs it via a `WorkerRunner`.

### 1c. The Pipecat pipeline (frames, processors, transports, order)

The flower bot pipeline (identical in both `bot-gpt.py` and `bot-nemotron.py`, `run_bot`):

```python
pipeline = Pipeline([
    transport.input(),       # mic audio in (WebRTC or Twilio WS) -> AudioRawFrame
    stt,                     # AudioRawFrame -> Interim/TranscriptionFrame
    user_aggregator,         # builds the user turn into the LLM context (+ VAD + turn strategy)
    llm,                     # context -> text + tool calls (streamed)
    tts,                     # text -> audio out
    transport.output(),      # audio out to client
    assistant_aggregator,    # records the assistant turn back into the context
])

worker = PipelineWorker(pipeline, params=PipelineParams(
    enable_metrics=True, enable_usage_metrics=True,
    audio_in_sample_rate=audio_in_sample_rate,   # 16k WebRTC / 8k Twilio
    audio_out_sample_rate=audio_out_sample_rate, # 24k WebRTC / 8k Twilio
))
runner = WorkerRunner(handle_sigint=False)
await runner.add_workers(worker)
await runner.run()
```

This is the canonical Pipecat voice loop. Frames flow downstream (mic → STT → aggregator → LLM → TTS → speaker) and control frames (e.g. `EndTaskFrame`, interruptions) flow upstream. Key frame types used in code: `AudioRawFrame`, `InterimTranscriptionFrame`, `TranscriptionFrame`, `UserStartedSpeakingFrame`, `VADUserStartedSpeakingFrame`, `VADUserStoppedSpeakingFrame`, `LLMRunFrame` (kick off a turn), `EndTaskFrame` (end the call), `FunctionCallResultProperties` (control whether the LLM re-runs after a tool).

The **music-player** pipeline is the same shape but **multi-worker**:

```
main PipelineWorker (transport + RTVI):
  transport.in → STT → user_agg → LLM → TTS → transport.out → assistant_agg
    └── handle_request(query) tool  ──►  MusicUIWorker (owns nav stack + UI state)
                                              └──► CatalogWorker (Deezer data; no LLM)
```

Three workers run as peers under one `PipelineRunner`:
- `PipelineWorker` (the voice loop) — owns transport + RTVI; its **only** tool is `handle_request`.
- `MusicUIWorker(UIWorker)` — owns navigation/screen state, has its **own LLM**, exposes ~13 `@tool`s that drive the UI, and handles client clicks via `@ui_event`.
- `CatalogWorker(BaseWorker)` — a long-lived non-LLM worker that serves catalog data through `@job(name=...)` handlers.

---

## 2. Services / providers (STT, LLM, TTS) — exact classes, config, models

### Variant 1 — `bot-gpt.py` (GPT-4.1)

| Role | Class | Import | Model / config |
|---|---|---|---|
| STT | `GradiumSTTService` | `pipecat.services.gradium.stt` | `language=Language.EN`; key `GRADIUM_API_KEY` |
| LLM | `OpenAIResponsesLLMService` | `pipecat.services.openai.responses.llm` | `model=os.getenv("OPENAI_MODEL", "gpt-4.1")` (OpenAI **Responses** API); key `OPENAI_API_KEY` |
| TTS | `GradiumTTSService` | `pipecat.services.gradium.tts` | `voice=GRADIUM_VOICE_ID` (default `_6Aslh2DxfmnRLmP`); key `GRADIUM_API_KEY` |

```python
stt = GradiumSTTService(api_key=os.environ["GRADIUM_API_KEY"], settings=GradiumSTTService.Settings(language=Language.EN))
llm = OpenAIResponsesLLMService(api_key=os.environ["OPENAI_API_KEY"], settings=OpenAIResponsesLLMService.Settings(model=os.getenv("OPENAI_MODEL", "gpt-4.1"), system_instruction=system_instruction))
tts = GradiumTTSService(api_key=os.environ["GRADIUM_API_KEY"], settings=GradiumTTSService.Settings(voice=os.getenv("GRADIUM_VOICE_ID", "_6Aslh2DxfmnRLmP")))
```

### Variant 2 — `bot-nemotron.py` (NVIDIA, **this is the "reuse the voice stack" target**)

| Role | Class | Import | Model / config |
|---|---|---|---|
| STT | `NVidiaWebSocketSTTService` (custom, in `nvidia_stt.py`) | local module | NVIDIA Parakeet / Nemotron Speech Streaming over WebSocket. `url=os.getenv("NVIDIA_ASR_URL", "ws://192.168.7.228:8081")`, `strip_interim_prefix=True`. Expects 16-bit PCM, 16 kHz mono. |
| LLM | `VLLMOpenAILLMService` (custom, in `nemotron_llm.py`; subclass of `OpenAILLMService`) | local module | `model=os.getenv("NEMOTRON_LLM_MODEL", "nvidia/nemotron-3-super")`, `base_url=NEMOTRON_LLM_URL` (vLLM OpenAI-compatible `/v1`), `api_key=NEMOTRON_LLM_API_KEY` (default `"EMPTY"`). |
| TTS | `GradiumTTSService` | `pipecat.services.gradium.tts` | `voice` default `Eu9iL_CYe8N-Gkx_`; key `GRADIUM_API_KEY` |

**Is NVIDIA Nemotron used, and how?** Yes — twice:
1. **LLM:** Nemotron-3-Super-120B served by **vLLM** behind an OpenAI-compatible Chat Completions endpoint. Because vLLM exposes Chat Completions (not the Responses API), the code uses `OpenAILLMService` (subclassed), **not** `OpenAIResponsesLLMService`. The README's hosted endpoint:
   - `NEMOTRON_LLM_URL=http://nemotron-fleet-alb-1322439314.us-west-2.elb.amazonaws.com/v1`
   - `NEMOTRON_LLM_MODEL=nvidia/nemotron-3-super` (the live `/v1/models` reports it as `nemotron-3-super`).
   - Reasoning ("thinking") is toggled per-request via `extra_body.chat_template_kwargs.enable_thinking`, default **OFF** for low latency (env `NEMOTRON_ENABLE_THINKING`). The subclass exists purely to fix the **TTFB metric** so it measures time-to-first-*spoken* token (skips reasoning/role/empty deltas). See `nemotron_llm.py`.
2. **STT:** NVIDIA's streaming ASR ("Nemotron Speech Streaming" / Parakeet) over a bespoke WebSocket protocol (`nvidia_stt.py`). The README's hosted endpoint: `NVIDIA_ASR_URL=ws://44.241.251.184:8080`.

**Is Gladia used for STT?** **No.** The provider is **Gradium** (note spelling: `gradium.ai`, package extra `gradium`). It's used for STT (GPT variant) and TTS (both variants). The actual STT in the NVIDIA variant is NVIDIA's own ASR, not Gradium and not Gladia.

### Music-player demo services (different stack)

| Role | Class | Import | Config |
|---|---|---|---|
| STT | `SonioxSTTService` | `pipecat.services.soniox.stt` | `language_hints=[Language.EN], language_hints_strict=True`; key `SONIOX_API_KEY` |
| LLM | via `create_llm_service()` factory in `llm.py` | — | `LLM_PROVIDER` env selects `openai` (`OpenAILLMService`) or `cerebras` (`CerebrasLLMService`); reads `<PROVIDER>_API_KEY` + optional `<PROVIDER>_MODEL`. Default OpenAI. |
| TTS | `CartesiaTTSService` | `pipecat.services.cartesia.tts` | `voice=CARTESIA_VOICE_ID`, `text_aggregation_mode=TextAggregationMode.TOKEN`; key `CARTESIA_API_KEY` |
| Transport | Daily or SmallWebRTC | — | `DAILY_API_KEY` for Daily rooms |

> Note: `descriptions.py` in the music player calls the OpenAI SDK directly for catalog blurbs/Q&A, so `OPENAI_API_KEY` is needed there regardless of `LLM_PROVIDER`.

### Complete env-var / API-key inventory found in the repo

From `server/.env.example`, the populated `server/.env`, README, and the music-player README:

**Flower bot (`server/`):**
- `OPENAI_API_KEY` — OpenAI (GPT-4.1 variant; LLM)
- `OPENAI_MODEL` — optional override (default `gpt-4.1`)
- `GRADIUM_API_KEY` — Gradium STT + TTS *(populated in `.env`)*
- `GRADIUM_VOICE_ID` — Gradium TTS voice *(populated in `.env`)*
- `NVIDIA_ASR_URL` — NVIDIA STT WebSocket URL *(populated in `.env`)*
- `NEMOTRON_LLM_URL` — vLLM OpenAI-compatible base URL `/v1` *(populated in `.env`)*
- `NEMOTRON_LLM_MODEL` — e.g. `nvidia/nemotron-3-super` *(populated in `.env`)*
- `NEMOTRON_LLM_API_KEY` — optional (default `"EMPTY"`; vLLM ignores unless `--api-key` set)
- `NEMOTRON_ENABLE_THINKING` — `true`/`false` (default false)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — telephony only
- `ENV` — set to `local` to disable the Krisp noise filter (Krisp only on Pipecat Cloud)

**Music-player demo (separate `.env`):**
- `OPENAI_API_KEY`, `SONIOX_API_KEY`, `CARTESIA_API_KEY`, `DAILY_API_KEY`
- `CARTESIA_VOICE_ID`, `LLM_PROVIDER` (+ `CEREBRAS_API_KEY`/`*_MODEL` if used)
- Client: `VITE_BOT_START_URL`, `VITE_BOT_START_PUBLIC_API_KEY`, `VITE_TRANSPORT`

**Live demo creds the hackathon actually used (from `.env`, redacted):** `GRADIUM_API_KEY`, `GRADIUM_VOICE_ID`, `NVIDIA_ASR_URL`, `NEMOTRON_LLM_URL`, `NEMOTRON_LLM_MODEL` are all set → the **NVIDIA Nemotron + Gradium** path is the configured, working one. `OPENAI_API_KEY` and `TWILIO_*` are blank in the committed `.env`.

---

## 3. Transport & client (how audio gets in/out, how the front-end connects, embedding)

### Server-side transports
- **Browser / local dev:** **SmallWebRTC** (`SmallWebRTCTransport` + `SmallWebRTCConnection`). Peer-to-peer WebRTC; no Daily/cloud required. This is the default and what we'd use for an open public web demo. Audio in 16 kHz, out 24 kHz.
- **Telephony:** Twilio Media Streams over a **FastAPI WebSocket** (`FastAPIWebsocketTransport` + `TwilioFrameSerializer`), 8 kHz μ-law both ways. The bot fetches caller info from the Twilio REST API to personalize (`KNOWN_CUSTOMERS`).
- **Music player additionally supports Daily** (`DailyParams`) selected at runtime via `create_transport(runner_args, transport_params)`.
- **Krisp noise suppression** (`KrispVivaFilter`) is auto-enabled as the `audio_in_filter` when **not** `ENV=local` (i.e. on Pipecat Cloud).

### Client-side (the React/Vite music-player client — the template to copy)
The client is a vanilla Vite + React 19 SPA using Pipecat's official JS SDK:

`client/package.json` deps:
```json
"@pipecat-ai/client-js": "^1.10.0",
"@pipecat-ai/client-react": "^1.6.0",
"@pipecat-ai/daily-transport": "^1.6.5",
"@pipecat-ai/small-webrtc-transport": "^1.10.3",
"@pipecat-ai/voice-ui-kit": "^0.11.0",
"react": "^19", "react-dom": "^19"
```

**Connection wiring** (`client/src/main.tsx`): the whole app is wrapped in `<PipecatAppBase connectParams={...} transportType={...} initDevicesOnMount>` from `@pipecat-ai/voice-ui-kit`, which hands children `{ client, handleConnect, handleDisconnect, error }`. `handleConnect`/`handleDisconnect` are wired to UI buttons.

**Connect params** (`client/src/config.ts`): picks transport from `VITE_TRANSPORT` (default `smallwebrtc`), and posts to `VITE_BOT_START_URL` (default `http://localhost:7860/start`) with `{ transport: "webrtc" | "daily", ... }` and an optional `Authorization: Bearer <VITE_BOT_START_PUBLIC_API_KEY>` (Pipecat Cloud public API key).

**Audio** is handled entirely by the transport + `voice-ui-kit` (mic capture, playback, device init). The app code never touches raw audio.

### What it takes to embed into OUR custom web frontend (PRM)
This is the important part and the demo answers it well:
- Use `@pipecat-ai/client-js` + `@pipecat-ai/client-react`. You do **not** have to use `voice-ui-kit`'s `PipecatAppBase` (it's a convenience wrapper). You can construct a `PipecatClient` with the SmallWebRTC transport directly and render your own docked mic UI; but `PipecatAppBase` is the fastest path and `voice-ui-kit` is shadcn/Tailwind-friendly, which matches our Next.js + shadcn plan.
- Server→client UI control rides on **RTVI**: the bot calls `self.send_command("screen"/"toast"/...)` and the client subscribes with `useRTVIClientEvent(RTVIEvent.UICommand, ...)`. See §4/§5.
- Client→server actions: `client.sendUIEvent(name, payload)` (a thin wrapper used in `useClickSender.ts`). The server routes these to `@ui_event(name)` handlers.
- **Next.js note:** the demo client is Vite, not Next. Porting is straightforward (the SDK is framework-agnostic React), but the Pipecat client + WebRTC must run **client-side only** (`"use client"`, dynamic import / no SSR). Env vars become `NEXT_PUBLIC_*` instead of `VITE_*`.

---

## 4. Tools / function calling (CRITICAL for PRM)

This is the most reusable concept. Pipecat supports **"direct functions"**: you write a normal async Python function, and Pipecat derives the JSON schema from its **signature + type hints + docstring** (Google-style `Args:` become parameter descriptions). No hand-written JSON schema.

### Pattern A — module-level functions on the main LLM (flower bot)
Each tool's **first parameter is `params: FunctionCallParams`**, remaining params are the model-visible arguments. The handler returns results via `await params.result_callback({...})`.

```python
async def add_to_order(params: FunctionCallParams, bouquet_name: str, quantity: int = 1) -> None:
    """Add a bouquet to the customer's order. Only call this after the
    customer has confirmed they want this bouquet.

    Args:
        bouquet_name: The name of the bouquet to add, lowercase.
        quantity: How many of this bouquet to add. Defaults to 1.
    """
    item = BOUQUETS.get(bouquet_name.lower())
    if not item:
        await params.result_callback({"ok": False, "reason": f"We don't carry '{bouquet_name}'."}); return
    order["items"].append({"bouquet": bouquet_name.lower(), "quantity": quantity, "price": item["price"]})
    await params.result_callback({"ok": True, "items": order["items"]})
```

Registration is **two steps** (both required):

```python
tool_functions = [list_bouquets, check_availability, add_to_order, get_order_summary,
                  set_delivery_details, place_order, end_call]
tools = ToolsSchema(standard_tools=tool_functions)         # describes tools to the LLM
...
for fn in tool_functions:
    llm.register_direct_function(fn)                        # wires the actual handlers
context = LLMContext(tools=tools)
```

Useful idioms in the flower bot:
- **Per-session state via closure:** `order = {...}` defined inside `run_bot`, captured by the tool closures → each call/session is isolated.
- **Returning guidance to the model:** tool results can include a `note` field telling the model how to phrase the next turn (see `list_bouquets` empty-results path).
- **Ending the call from a tool** (`end_call`): pushes `EndTaskFrame` upstream and sets `FunctionCallResultProperties(run_llm=False)` so the model doesn't speak again after the goodbye:
  ```python
  await params.llm.push_frame(EndTaskFrame(), FrameDirection.UPSTREAM)
  await params.result_callback({"ok": True}, properties=FunctionCallResultProperties(run_llm=False))
  ```
- **`register_direct_function` accepts options** (seen in music player): `cancel_on_interruption=False`, `timeout_secs=30`.

### Pattern B — `@tool` methods on a `UIWorker` (music player; the PRM-relevant pattern)
For tools that **drive the UI**, the music player puts them on a `UIWorker` subclass and decorates them with `@tool` (from `pipecat.workers.llm`). Same signature convention (`self, params, <args>`), docstring → schema. Examples (`ui_agent.py`):

```python
from pipecat.workers.llm import tool
from pipecat.workers.ui import UIWorker, ui_event

class MusicUIWorker(UIWorker):
    @tool
    async def navigate_to_artist(self, params: FunctionCallParams, artist_name: str):
        """Push the artist screen for the named artist.
        Args:
            artist_name: The artist's display name (e.g. "Nirvana").
        """
        artist = await self._catalog_find_artist(artist_name)
        await self._do_navigate_to_artist(artist)             # mutates nav state + send_command("screen", ...)
        await self.respond_to_job(f"Here's {artist['name']}.", tts_speak=True)
        await params.result_callback(None)

    @tool
    async def go_back(self, params: FunctionCallParams):
        """Pop one screen off the navigation stack."""
        ...
```

The full UI tool set (great template for PRM verbs): `navigate_to_artist`, `select_item`, `play`, `control_playback`, `show_info`, `add_to_favorites`, `switch_tab`, `show_trending`, `go_back`, `go_home`, `answer_about_catalog`, `answer_about_music`, `answer_about_screen`.

### Two-LLM "router → actor" split (worth copying for PRM)
The **main** voice LLM has a single tool `handle_request(query)` whose whole job is to forward the utterance to the UI worker and speak its reply. The **UI worker's** LLM then picks exactly one of the ~13 UI tools, grounded by the current screen. This keeps each user turn to two cheap inferences and prevents the chatty voice model from hallucinating UI state.

```python
async def handle_request(params: FunctionCallParams, query: str):
    """Delegate the user's request to the UI layer."""
    async with params.pipeline_worker.job("ui", name="respond", payload={"query": query}, timeout=30) as t:
        pass
    await params.result_callback(t.response)   # UI worker either spoke verbatim or returned text to phrase
```

For a v1 PRM you can **skip the two-LLM split** and just register all PRM tools directly on one LLM (Pattern A) — simpler. Adopt Pattern B only if you also want the model to reason about on-screen state for things like "open the first person in the list."

---

## 5. Conversation / session management

### System prompt
- Flower bot: a single large `system_instruction` string passed into the LLM `Settings(system_instruction=...)`, with a dynamic `caller_context` block appended (returning vs. new customer) and today's date injected. Heavily tuned for *spoken* output (1–2 short sentences, no markdown, numbers in words, ask one thing at a time). **Excellent template for a voice persona.**
- Music player: separate prompts for the voice router (`VOICE_PROMPT`, "always route through `handle_request`, never voice the result yourself") and the UI actor (`SYSTEM_PROMPT`, "always call exactly one tool per turn, never reply with plain text," plus a full description of each tool and grid-position resolution rules).

### Kicking off the conversation
On connect, the bot seeds a first message and runs the LLM so the bot greets first:
```python
@transport.event_handler("on_client_connected")
async def on_client_connected(transport, client):
    context.add_message({"role": "user", "content": "A customer just called. Greet them, '...'"})
    await worker.queue_frames([LLMRunFrame()])
@transport.event_handler("on_client_disconnected")
async def on_client_disconnected(transport, client):
    await worker.cancel()
```
(The music player uses a `"developer"` role message + `queue_frame(LLMRunFrame())` for the same effect.)

### Context aggregation
```python
context = LLMContext(tools=tools)
user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
    context,
    user_params=LLMUserAggregatorParams(
        vad_analyzer=SileroVADAnalyzer(),
        user_turn_strategies=FilterIncompleteUserTurnStrategies(),
    ),
)
```
The aggregator pair maintains the running chat history; the user aggregator owns VAD + turn detection.

### VAD, turn detection, interruptions
- **VAD:** `SileroVADAnalyzer` (Silero, downloaded on first run — README notes ~20 s first-launch warm-up for VAD + turn-detection models).
- **Turn detection:** `FilterIncompleteUserTurnStrategies` (from `pipecat.turns.user_turn_strategies`) — filters out incomplete user turns so the bot doesn't jump in mid-sentence.
- **STT-driven finalization (NVIDIA path):** `nvidia_stt.py` finalizes a turn on `VADUserStoppedSpeakingFrame` by sending a "hard reset" to the ASR server and emitting a `finalized=True TranscriptionFrame`, letting a turn-analyzer end the turn immediately instead of waiting on a timeout. It also keeps a 1 s audio pre-roll ring buffer so speech onsets aren't clipped.
- **Interruptions:** handled by Pipecat's standard interruptible pipeline (barge-in). The music player explicitly opts its `handle_request` tool out of interruption cancellation (`cancel_on_interruption=False`).
- **Metrics:** `PipelineParams(enable_metrics=True, enable_usage_metrics=True)`. The Nemotron LLM subclass exists specifically to make the TTFB metric meaningful for a reasoning model.

### RTVI / observers
- The flower bot does not instantiate RTVI explicitly (the dev runner / Pipecat Cloud wires the RTVI transport plumbing).
- The **music player's `PipelineWorker` owns RTVI** and translates worker `send_command(...)` calls into `RTVIUICommandFrame`s → the client receives them as `RTVIEvent.UICommand`. Client clicks (`sendUIEvent`) arrive as `BusUIEventMessage` and dispatch to `@ui_event` handlers. This RTVI UI-command channel is the mechanism our PRM voice agent needs to drive the app UI.

---

## 6. The two versions (GPT-4.1 vs NVIDIA) — what concretely differs

The two files (`bot-gpt.py`, `bot-nemotron.py`) are **~95% identical** — same tools, same system prompt, same pipeline shape, same transport handling, same connect/disconnect handlers. The **only** differences:

| | `bot-gpt.py` | `bot-nemotron.py` |
|---|---|---|
| **STT** | `GradiumSTTService` (`gradium.stt`) | `NVidiaWebSocketSTTService` (local `nvidia_stt.py`, custom WS) |
| **LLM** | `OpenAIResponsesLLMService`, model `gpt-4.1` (OpenAI **Responses** API) | `VLLMOpenAILLMService` (subclass of `OpenAILLMService`), Nemotron-3-Super via **vLLM Chat Completions**; `enable_thinking` toggle |
| **TTS** | `GradiumTTSService`, voice `_6Aslh2DxfmnRLmP` | `GradiumTTSService`, voice `Eu9iL_CYe8N-Gkx_` |
| **Extra imports** | `Language` (for STT lang) | `nemotron_llm`, `nvidia_stt` |
| **Keys needed** | `OPENAI_API_KEY`, `GRADIUM_API_KEY` | `NVIDIA_ASR_URL`, `NEMOTRON_LLM_URL` (+ optional model/thinking), `GRADIUM_API_KEY` |

Everything else (tools, prompt, VAD, turn strategy, Twilio/WebRTC handling, Krisp, metrics) is shared. So switching providers is purely a "swap three service objects" exercise — exactly the modularity we want.

---

## 7. Running & deploying

### Local (flower bot)
```bash
cd server
cp .env.example .env          # fill OPENAI_API_KEY + GRADIUM_API_KEY (GPT) or NVIDIA_*/GRADIUM (Nemotron)
uv sync                       # uv package manager; Python 3.11+ (repo venv is 3.14, pipecat 1.3.0)
uv run bot-gpt.py             # or: uv run bot-nemotron.py
# open http://localhost:7860, click Connect
```
First launch downloads Silero VAD + turn-detection models (~20 s).

### Local (music player) — two processes
```bash
# server
cd server && uv sync && uv run bot.py        # binds http://localhost:7860 (SmallWebRTC)
# client
cd client && npm install && npm run dev       # Vite on http://localhost:5173
```

### Dependencies / build system
- **Python:** `uv` (lockfile `uv.lock`). Dep spec: `pipecat-ai[gradium,openai,runner,silero,webrtc,websocket]>=1.3.0` + `pipecatcloud>=0.7.1`. (Music player extras: `[webrtc,daily,silero,soniox,cartesia,openai,runner]`.) Dev tools: `pyright`, `ruff`.
- **Node:** music-player client only — Vite 8, React 19, TypeScript ~6, the `@pipecat-ai/*` SDKs.
- **Installed/verified:** pipecat **1.3.0**; modules `pipecat.workers.ui` (`UIWorker`, `ui_event`), `pipecat.workers.llm` (`tool`), `pipecat.services.gradium.{stt,tts}`, `pipecat.services.openai.responses.llm`, `pipecat.processors.frameworks.rtvi`, `pipecat.turns.user_turn_strategies` all import cleanly.

### Deployment
- **Target:** **Pipecat Cloud** (`pipecat.daily.co`). `Dockerfile` is `FROM dailyco/pipecat-base:latest` + `uv sync --locked`. Deploy config in `pcc-deploy.toml` (`agent_name="flower-bot"`, `agent_profile="agent-1x"`, Krisp `tel` filter, `min_agents=1`).
  - `pc cloud secrets set flower-bot-secrets --file .env` then `pc cloud deploy`.
  - **Inconsistency to note:** the `server/Dockerfile` copies `bot.py` and `mock_backend.py`, but the repo's bot files are named `bot-gpt.py` / `bot-nemotron.py` — the Dockerfile would need the chosen bot renamed/added to `bot.py` (or the COPY edited) before a Cloud build succeeds. The music player's Dockerfile presumably copies its own `bot.py` (which does exist there).
- Twilio telephony: TwiML Bin streams to `wss://api.pipecat.daily.co/ws/twilio` with `_pipecatCloudServiceHost = flower-bot.<ORG>`.
- **Self-hosting note for our open public demo:** the SmallWebRTC dev runner can run anywhere (any box with a public IP / behind a TURN server). We are not forced onto Pipecat Cloud; Daily/Pipecat Cloud just simplifies scaling, Krisp, and TURN. For a hackathon demo, a single self-hosted SmallWebRTC server + static frontend is viable (the music-player README explicitly says the client is "a vanilla Vite SPA, so nothing about the build is Pipecat-Cloud-specific" and can deploy to Vercel/Netlify/etc.).

### Testing with Cekura
The README pushes **Cekura** (`dashboard.cekura.ai`) for automated voice-agent evaluation, driven from Claude Code via an MCP/skills plugin (`/cekura-report`), selecting `Pipecat` as the provider. Useful for our QA but not part of the runtime.

---

## 8. Concrete reuse plan for the PRM voice agent

### What to copy/adapt, in priority order

1. **The whole single-LLM voice loop from `bot-gpt.py` / `bot-nemotron.py` (highest value, lowest effort).**
   Copy `run_bot()` + `bot()` verbatim and change three things: the service objects (STT/LLM/TTS), the system prompt, and the tool list. The `Pipeline([transport.input(), stt, user_aggregator, llm, tts, transport.output(), assistant_aggregator])` + `PipelineWorker` + `WorkerRunner` is exactly our backbone. Keep `SileroVADAnalyzer` + `FilterIncompleteUserTurnStrategies` + `enable_metrics`.

2. **The direct-function tool pattern for all PRM data ops (highest value for us).**
   Mirror `add_to_order` etc.: write async functions `add_person`, `update_person`, `log_interaction`, `add_note`, `set_reminder`, `search_people`, `get_person`, `list_reminders`, … each `(params: FunctionCallParams, <typed args>)` with a Google-style docstring; build `ToolsSchema(standard_tools=[...])`; `register_direct_function` each. Back them with our real DB instead of `mock_backend.py`'s dicts (the file's own docstring says this is the swap point). Use the closure-state trick for any per-session context (e.g. "currently viewed person").

3. **The RTVI UI-command channel + `@ui_event` clicks for "drive the app UI" (the PRM's headline feature).**
   This is the part the flower bot lacks and the **music player provides**. Reuse:
   - **Server→client:** a worker method like `send_command("navigate", {"to": "person", "id": ...})` / `send_command("toast", {...})` → client subscribes via `useRTVIClientEvent(RTVIEvent.UICommand, ...)` (copy `useServerMessages.ts` shape and replace the reducer cases with PRM screens: people list, person detail, reminders, etc.).
   - **Client→server:** `client.sendUIEvent(kind, payload)` (copy `useClickSender.ts`) routed to `@ui_event` handlers so taps and voice stay in sync.
   - Decide architecture: for v1, simplest is to give the **single** voice LLM both data tools *and* UI-navigation tools (e.g. `open_person(id)`, `go_to_reminders()`) that call `send_command`. Adopt the music player's **two-worker router/actor split** only if the agent needs to reason about on-screen state ("open the third person", "go back").

4. **The client bootstrap (`main.tsx` + `config.ts` + the two hooks), adapted to Next.js + shadcn.**
   Use `@pipecat-ai/client-js` + `@pipecat-ai/client-react` (+ `small-webrtc-transport`), and optionally `@pipecat-ai/voice-ui-kit` for the docked mic widget. Mark the voice components `"use client"` / no-SSR. Connect to our self-hosted `/start` with `transport: "webrtc"`. This gives us mic capture, playback, and the RTVI event bus for free.

5. **The voice-tuned system prompt conventions** (1–2 sentences, ask one thing at a time, no markdown, numbers in words, greet-first on connect via a seeded message + `LLMRunFrame`). Reuse the structure; rewrite the persona for a PRM assistant.

6. **Provider choice = swap three objects.** Start on the easiest reliable stack (OpenAI LLM + a managed STT/TTS) to de-risk the demo, and keep the **Nemotron + Gradium** objects from `bot-nemotron.py` as a drop-in alternative for the "uses NVIDIA open models" story. `nemotron_llm.py` and `nvidia_stt.py` are self-contained and copy cleanly.

### Gaps / risks to flag

- **STT provider is NVIDIA's bespoke WebSocket server, not a SaaS.** `nvidia_stt.py` talks to a specific server protocol (`{"type":"reset","finalize":...}` / `{"type":"transcript",...}`). The hosted ASR URL in the repo (`ws://44.241.251.184:8080`) was a **hackathon-only** endpoint and is almost certainly **dead now**. To reuse NVIDIA STT we'd have to host that ASR server ourselves (GPU) or point at a different ASR. For a low-friction public demo, a managed STT (Gradium, Soniox, Deepgram, etc.) is safer; keep `nvidia_stt.py` only if we control the ASR box.
- **Nemotron LLM endpoint is also hackathon-hosted** (vLLM behind an AWS ALB in `us-west-2`). Same risk: likely offline; reusing it means self-hosting Nemotron on GPUs or finding another OpenAI-compatible Nemotron endpoint. The code itself (OpenAI-compatible client + `enable_thinking`) is fine and portable.
- **Tool-calling with Nemotron:** the flower bot *does* register the same 7 tools against Nemotron, so function-calling works in principle — but Nemotron is a reasoning model and the repo's authors **default `enable_thinking=OFF` for voice latency** and warn that, without a server-side reasoning parser, chain-of-thought can leak into spoken output. For a many-tool PRM agent, validate tool-selection accuracy and latency on whatever Nemotron endpoint we use; OpenAI/GPT-4.x tool-calling is the safer baseline if Nemotron underperforms. (The README itself frames GPT-4.1 vs Nemotron as a side-by-side to evaluate with Cekura.)
- **Latency:** voice UX needs low TTFB. Reasoning models add seconds; the custom `VLLMOpenAILLMService` exists precisely because reasoning skews the metric. Keep thinking off, and prefer fast LLM + streaming TTS (`text_aggregation_mode=TOKEN` like the music player).
- **Gradium maturity/spelling:** it's "Gradium" (`gradium.ai`), not Gladia. It's a smaller provider; the hackathon supplied credits. For a durable demo, consider a more mainstream STT/TTS unless we keep Gradium creds. Our committed `.env` has working Gradium keys today.
- **`Dockerfile` expects `bot.py`** but the bots are `bot-*.py` — fix before any Pipecat Cloud build.
- **No auth / no rate limiting** in the demo (matches our "no login v1"), but an open public WebRTC bot that calls paid LLM/STT/TTS APIs is a cost/abuse risk — add at least basic throttling for a public demo.
- **The `pipecat-music-player` subtree is transient on disk** (it vanished mid-session). Re-clone `github.com/pipecat-ai/pipecat-music-player` to get the files I couldn't fully read (`catalog_agent.py`, `discovery_agent.py`, `deezer.py`, `descriptions.py`, client screens/components, its `pcc-deploy.toml`).

### Suggested minimal PRM v1 wiring (synthesis)
- 1 `PipelineWorker`: `transport.input() → STT → user_agg → LLM → TTS → transport.output() → assistant_agg`, SmallWebRTC transport, Silero VAD, `FilterIncompleteUserTurnStrategies`.
- LLM: start with OpenAI (GPT-4.x) for reliable many-tool calling; keep Nemotron objects as an alt.
- Tools (direct functions, real DB): `search_people`, `get_person`, `add_person`, `update_person`, `add_note`, `log_interaction`, `set_reminder`, `list_reminders`, plus UI tools `open_person(id)`, `go_home()`, `open_reminders()` that call `send_command(...)`.
- Client: Next.js + shadcn, `@pipecat-ai/client-react` docked mic, subscribe to `RTVIEvent.UICommand` to navigate, send taps via `sendUIEvent`.
- Seed demo data in the DB; greet-first on connect.
- Deploy: self-host the SmallWebRTC server + static Next.js frontend (or Pipecat Cloud if we want managed scaling/Krisp).

---

## Appendix — key file paths

- `server/bot-gpt.py` — GPT-4.1 variant (full voice loop + tools + prompt).
- `server/bot-nemotron.py` — NVIDIA Nemotron variant (the "reuse NVIDIA stack" target).
- `server/nemotron_llm.py` — `VLLMOpenAILLMService` (OpenAI-compatible vLLM client; TTFB fix; `enable_thinking`).
- `server/nvidia_stt.py` — `NVidiaWebSocketSTTService` (custom WebSocket ASR protocol, VAD-driven finalization, pre-roll buffer).
- `server/mock_backend.py` — `BOUQUETS` + `KNOWN_CUSTOMERS` (the data layer to replace with our DB).
- `server/test_nemotron_llm.py` — unit tests for the TTFB-arming logic.
- `server/pyproject.toml` / `uv.lock` — Python deps (pipecat extras).
- `server/Dockerfile`, `server/pcc-deploy.toml` — Pipecat Cloud build/deploy.
- `server/.env`, `server/.env.example` — env vars (NVIDIA + Gradium populated).
- `server/pipecat-music-player/server/bot.py` — voice router worker + `handle_request` + multi-worker runner (Soniox/Cartesia/OpenAI/Daily).
- `server/pipecat-music-player/server/ui_agent.py` — `MusicUIWorker(UIWorker)`: ~13 `@tool`s, `@ui_event` click handlers, `send_command` UI updates, `render_ui_state`. **The UI-driving reference.**
- `server/pipecat-music-player/server/llm.py` — `create_llm_service()` provider factory (openai/cerebras).
- `server/pipecat-music-player/client/src/main.tsx` — `PipecatAppBase` bootstrap.
- `server/pipecat-music-player/client/src/config.ts` — transport + `/start` URL + auth header config.
- `server/pipecat-music-player/client/src/hooks/useServerMessages.ts` — `RTVIEvent.UICommand` → screen/toast/playback reducer.
- `server/pipecat-music-player/client/src/hooks/useClickSender.ts` — `client.sendUIEvent(kind, payload)`.
- `server/pipecat-music-player/client/src/App.tsx` — screen routing + click → `sendClick` wiring.
- `server/pipecat-music-player/client/package.json` — `@pipecat-ai/{client-js,client-react,voice-ui-kit,small-webrtc-transport,daily-transport}`, React 19, Vite 8.
