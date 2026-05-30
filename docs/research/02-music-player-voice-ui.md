# Research: `pipecat-music-player` — Voice / UI separation-of-concerns architecture

**Date:** 2026-05-30
**Repo:** `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player`
**Why:** Architectural template for a v1 "Personal Relation Manager" (PRM) with a docked voice agent that (a) manages PRM data via tools, (b) drives the app UI, and (c) answers questions about what's on screen. This repo demonstrates exactly that pattern using Pipecat **workers**. Pinned to **`pipecat-ai==1.3.0`** (from `server/uv.lock`).

> Verification note: dependencies were not installed in the repo (`node_modules`/`.venv` absent), but the **full pipecat 1.3.0 source** is in the local uv cache, so all framework primitives below are quoted from the actual installed source at `~/.cache/uv/archive-v0/GSpWKFvK3I2mXfMT/pipecat/...`, and all app code is quoted from the repo.

---

## TL;DR for the PRM

- The pattern is **three workers on one bus**: a `PipelineWorker` (voice: STT→LLM→TTS + transport + RTVI), a `UIWorker` (owns screen/nav state, drives the client, runs its own LLM with **no chat history** but **fresh screen state injected each turn**), and a `BaseWorker` data worker (the catalog; analog of our PRM data store). Plus 3 optional discovery `BaseWorker`s.
- **Screen-awareness** = the UIWorker overrides `render_ui_state()` to return a textual description of the current screen (`self._screen_state`); a built-in hook auto-injects that as a `<ui_state>` developer message before every inference. With `keep_history=False` the UI LLM sees *only* the current screen + the one query — never stale conversation. This is the single most reusable idea.
- **Two latency classes:** voice requests = exactly **2 LLM inferences** (voice route → UI act, which speaks verbatim via `tts_speak=True`). UI clicks = **0 inferences** (client `sendUIEvent` → `@ui_event` handler mutates state directly).
- **Service swap points are tiny and centralized:** STT/TTS in `server/bot.py:run_bot` (lines 168–181), LLM behind a factory `server/llm.py` (`create_llm_service`), transport in `server/bot.py:bot` (lines 257–270). Nemotron → add a branch in `llm.py`; Gladia → swap one class in `bot.py`.
- **No DB today.** Catalog + favorites live in process memory. The PRM needs persistence — straightforward to add inside the data worker.

---

# A. Server / Pipecat architecture

## A1. The Pipecat "worker" primitives

This is a **newer Pipecat layer** that sits above the classic `Pipeline`. Instead of one pipeline, you run several **workers** that talk over a shared **`WorkerBus`**, coordinated by a `PipelineRunner`. Each primitive, with exact signatures from the installed source:

### `BaseWorker` (`pipecat/workers/base_worker.py`)
The root class for everything. `class BaseWorker(BaseObject, BusSubscriber)`. A worker attaches to a bus + registry, registers itself "ready", and exchanges **jobs** with other workers. Key methods used by this app:

- **`@job(name=...)` handlers** — collected at init (`self._job_handlers = _collect_job_handlers(self)`). When a `BusJobRequestMessage` arrives whose `job_name` matches, `_handle_job_request` dispatches it. Crucially, **each handler runs in its own asyncio task** (`self.create_task(self._run_job_handler(...))`), so a handler can `await` other jobs/network without blocking the bus. `@job(name="respond", sequential=True)` adds a per-name lock so those run one-at-a-time (FIFO).
- **`worker.job(worker_name, *, name, payload, timeout)`** — returns a `JobContext` you use as `async with ... as t:`. It waits for the target worker to be ready, sends the request, and on block-exit fills `t.response` (or raises `JobError`/`JobGroupError` on error/timeout). You can `async for event in t:` to receive streaming updates. This is how **worker→worker calls** are made.
- **`send_job_response(job_id, response=..., status=...)`** and **`send_job_update(job_id, update)`** — how a handler returns results / progress.
- **`job_group(*worker_names, ...)`** / `request_job_group(...)` — fan a single job out to N workers concurrently; `tg.responses` is `{worker_name: response}`. Used for the related-artists fan-out.

### `PipelineWorker` (`pipecat/pipeline/worker.py`)
`class PipelineWorker(BaseWorker)`. Wraps a classic `Pipeline` and is the only worker with audio I/O. Constructor default **`enable_rtvi=True`** (line 235) — so it auto-creates an `RTVIProcessor` + observer and becomes the bridge between the bus and the RTVI client. Two translation methods matter for us:

- **Outbound (server→client):** `on_bus_message` → if the message is a `BusUICommandMessage`, `_handle_ui_bus_message` converts it to an `RTVIUICommandFrame(command=..., payload=...)` and queues it; the RTVI observer wraps it into a `ui-command` envelope the client receives as `RTVIEvent.UICommand` (worker.py:781). Also: a `BusTTSSpeakMessage` targeted at this worker becomes a `TTSSpeakFrame` (line 763) — this is how the UIWorker makes the voice pipeline **speak a string verbatim**.
- **Inbound (client→server):** the RTVI `on_ui_message` handler calls `_republish_ui_message_on_bus`, turning a client `UIEventMessage` into a `BusUIEventMessage` on the bus (worker.py:826), which UIWorkers then dispatch to `@ui_event` handlers.

### `UIWorker` (`pipecat/workers/ui/ui_worker.py`)
`class UIWorker(LLMContextWorker)` — an LLM worker specialized to "see and drive a GUI". The pieces this app relies on:

- **Built-in `respond` job:** `@job(name="respond", sequential=True)` → `_run_llm_turn(message)`. It (1) optionally resets context, (2) appends the query as a **`user`** message, (3) runs the LLM, then (4) **blocks on a future** until a `@tool` calls `respond_to_job(...)`, then sends the job response. Spanning the full round-trip is what makes it single-flight.
- **`render_ui_state()`** — returns the `<ui_state>` text. Default renders an accessibility snapshot; **apps override it** (this app does).
- **Auto-inject hook (the magic):** in `__init__`, an `on_before_process_frame` LLM hook appends `render_ui_state()` as a `developer` message *before each user-turn inference* (gated by `_is_user_turn` so it isn't duplicated on tool-result follow-ups). See ui_worker.py:211–222.
- **`respond_to_job(answer, *, tts_speak=False)`** — completes the in-flight turn. `tts_speak=True` → publishes a `BusTTSSpeakMessage` (spoken verbatim by the voice pipeline) and responds `None` so the voice LLM stays silent. Default → responds `{"answer": answer}` for the voice LLM to phrase. **Mutually exclusive — one voice per turn.**
- **`send_command(name, payload)`** — publishes a `BusUICommandMessage` (the server→client UI command).
- **`@ui_event(name)`** decorator — marks a method as a handler for inbound client events; dispatched in its own task.
- Constructor flags used: `inject_events` (append `<ui_event>` to context), `auto_inject_ui_state` (default True), **`keep_history`** (default **False** = clear context each job), `prompt_guide` (wire-format guide appended to system prompt; `None` disables it).

### `PipelineRunner` + lifecycle
`server/bot.py:run_bot`:
```python
runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)
...
await runner.add_workers(
    CatalogWorker("catalog"),
    MusicUIWorker(),
    DeezerRelatedWorker("discovery_deezer"),
    TopTracksCrossrefWorker("discovery_tracks"),
    LLMSuggestionsWorker("discovery_llm"),
    worker,                      # the PipelineWorker, name="main"
)
await runner.run()               # runs until transport disconnects
```
All six workers come up together (so caches warm immediately); they live for the whole session. On client disconnect, `runner.cancel()` is called.

## A2. `server/bot.py` — the main `PipelineWorker`

Exact pipeline order (lines 191–201):
```python
pipeline = Pipeline([
    transport.input(),
    stt,                     # SonioxSTTService
    aggregators.user(),      # LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer())
    llm,                     # create_llm_service(system_prompt=VOICE_PROMPT)
    tts,                     # CartesiaTTSService
    transport.output(),
    aggregators.assistant(),
])
worker = PipelineWorker(pipeline, name="main",
    params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
    idle_timeout_secs=runner_args.pipeline_idle_timeout_secs)
```
RTVI is implicit (`enable_rtvi=True` default). Context holds exactly one tool:
```python
context = LLMContext(tools=ToolsSchema(standard_tools=[handle_request]))
llm.register_direct_function(handle_request, cancel_on_interruption=False, timeout_secs=30)
```

The **only tool**, `handle_request(query)` (lines 138–160), delegates to the UI worker and speaks nothing itself:
```python
async with params.pipeline_worker.job(UI_NAME, name="respond", payload={"query": query}, timeout=30) as t:
    pass
await params.result_callback(t.response)
```
The `VOICE_PROMPT` (lines 80–135) is strict: the voice LLM must call `handle_request` for *anything* UI-related, must **not** speak confirmations (the UI worker speaks via `tts_speak`), and must **pass deictic references verbatim** ("this", "the first one", "his/her/their") because only the UI layer can see the screen. On connect, a developer message tells the LLM to greet the user (lines 210–223).

Net effect: every user turn = **2 inferences** — voice route (pick `handle_request`) → UI act (pick one UI tool, which speaks). The voice LLM never re-phrases the result.

## A3. `server/ui_agent.py` — `MusicUIWorker` (the heart of the pattern)

### State ownership
A `UIState` dataclass (lines 176–191) holds the **navigation stack** (`list[NavFrame]`, starts `[home]`), favorites, current playing item, a **session artist cache**, and per-artist active tab. `NavFrame` (lines 161–170) is `{screen, artist_id, kind, item_id, trending_genre}`. Screens: `home | artist | detail | trending`. Nav helpers: `_enter()` pushes, `_top()` peeks, `_do_go_back()` pops, `_do_go_home()` resets.

### The screen-awareness mechanism (CRITICAL)
Construction disables the snapshot protocol and relies on a server-owned screen string:
```python
super().__init__("ui", llm=llm, inject_events=False, prompt_guide=None)
self._state = UIState()
self._screen_state = ""   # current screen rendered as text
```
(Note: `keep_history` is **not** passed, so it uses the default `False`.)

Every `_emit_*` method does two things: (1) `send_command("screen", {...})` to update the client, and (2) sets `self._screen_state` to a **text description** of that screen. Then:
```python
def render_ui_state(self) -> str:
    if not self._screen_state:
        return ""
    return f"<ui_state>\n{self._screen_state}\n</ui_state>"
```
Because of the auto-inject hook + `keep_history=False`, **before each UI-LLM turn the context is cleared and re-seeded with only `<ui_state>` (current screen) + the user query.** So position references ("top right", "the first one") and "go back" always resolve against *what's on screen now*, with zero risk of stale conversation. The screen descriptions are grid-aware, e.g. `_describe_grid` emits `"row R col C: <title>"` and `_describe_detail_screen` appends the full tracklist. This is exactly the "answer about what's on screen" capability the PRM needs.

### Full tool list (all `@tool` methods, with signatures)
| Tool | Signature | What it does |
|---|---|---|
| `navigate_to_artist` | `(artist_name: str)` | Resolve artist via catalog, push `artist` screen, speak ack. |
| `select_item` | `(item_title: str)` | Resolve album/song, push `detail` (navigating through the artist first so "back" works). |
| `play` | `(item_title: str)` | Resolve + navigate to detail + start playback; special-cases "play a track on the current album". |
| `show_info` | `(title: str)` | Resolve artist/album/song, fetch long description, emit a toast, speak it. |
| `add_to_favorites` | `(item_title: str)` | Resolve + add to favorites (idempotent for voice). |
| `control_playback` | `(action: str)` | `pause`/`resume`/`stop` the current preview. |
| `switch_tab` | `(tab: str)` | `albums`/`songs`/`related` on the artist page; `related` kicks off the 3-worker discovery fan-out. |
| `show_trending` | `(genre: str \| None)` | Push the trending screen (optional genre). |
| `go_back` | `()` | Pop one nav frame. |
| `go_home` | `()` | Reset to home. |
| `answer_about_catalog` | `(question: str, about: str\|None)` | Factual Q&A from structured catalog data; optional toast for `about`. |
| `answer_about_music` | `(question: str, about: str\|None)` | Opinion/trivia Q&A grounded by catalog (training knowledge). |
| `answer_about_screen` | `(answer: str)` | **Read-only**: the LLM composes the answer purely from `<ui_state>`; spoken verbatim. |

Every tool ends with `await self.respond_to_job(<text>, tts_speak=True)` then `await params.result_callback(None)`. So the **UI worker speaks**, not the voice LLM. `SYSTEM_PROMPT` (lines 51–158) documents the UI layers, the tools, decision rules, and how to resolve grid positions from `<ui_state>`.

### `send_command(...)` UI commands emitted
`screen` (one per screen kind, carrying full render data), `toast`, `playback` (`{state, item_title, item_id, preview_url}`), `playback_control` (`{action}`), `favorite_added` / `favorite_removed` (`{favorite, favorites}`). (`scroll_to` is supported client-side too.)

### `@ui_event` click handlers (no LLM)
`hello` (re-emit current screen after handshake), `nav`, `action`, `set_tab`, `play_track`, `stop_playback`. Each delegates to a `_handle_*_click` method that mutates nav state and emits commands directly — **no inference**, so clicks are instant and also keep `<ui_state>` fresh for the next voice turn. Toggle semantics live here (re-click Play = Stop, re-click a favorite = remove) while the voice tools stay idempotent.

### Worker→worker dispatch to the catalog
A thin wrapper centralizes every catalog call:
```python
async def _catalog(self, name, payload=None, *, timeout) -> dict:
    async with self.job("catalog", name=name, payload=payload, timeout=timeout) as t:
        pass
    return t.response or {}
```
with typed wrappers (`_catalog_find_artist`, `_catalog_resolve_item`, `_catalog_get_album_tracks`, …). The `name=` argument selects which `@job` handler runs on the catalog.

### Related-artist fan-out (advanced, optional for PRM)
`_run_related_discovery` uses `self.job_group("discovery_deezer","discovery_tracks","discovery_llm", name="discover_similar", ...)` and streams results into the artist's `related_sections` as each worker finishes, re-emitting the screen only if the user is still on that artist (`_emit_artist_if_visible`). Good reference for "background enrichment that updates the UI live," but not needed for v1 PRM.

## A4. `server/catalog_agent.py` — `CatalogWorker` (the data worker; analog of PRM data store)

`class CatalogWorker(BaseWorker)` — process-lifetime, **no LLM pipeline**. Owns all catalog state in memory: `_artists_by_id`, `_artists_by_name_norm`, `_home_artists`, `_description_cache`, genre maps, editorial new-releases cache. On `start()` it warms the home chart in the background (`_warm_home`). It exposes **one `@job(name=...)` per action**:

`list_home`, `list_new_releases`, `find_artist`, `get_artist`, `fetch_artist_by_id`, `resolve_item`, `get_trending`, `get_album_preview`, `get_album_tracks`, `get_description`.

Each handler reads `message.payload`, does the work, and calls `send_job_response(message.job_id, response={...})`; on exception, `_respond_error` sends a `FAILED` status so callers see `{}` rather than a raised error. Caching is pervasive (artist cache, per-key description locks to dedupe concurrent generation, TTL on the editorial feed). Data comes from **Deezer** (`server/deezer.py`, keyless HTTP via `urllib` in `asyncio.to_thread`, a global semaphore caps concurrency at 8 to respect Deezer's ~50/5s limit). Descriptions/Q&A are generated by **OpenAI directly** in `server/descriptions.py` (not via the pipecat LLM service). `_strip_internal` removes leading-underscore cache fields before responding.

This worker is the cleanest 1:1 template for a **PRMDataWorker** — replace Deezer with a DB/store and rename the job handlers.

## A5. Services & config — EXACT swap points

| Concern | Class | Where | Model / settings |
|---|---|---|---|
| **STT** | `SonioxSTTService` | `bot.py:168-174` | `language_hints=[Language.EN], language_hints_strict=True` |
| **TTS** | `CartesiaTTSService` | `bot.py:175-181` | `voice=os.getenv("CARTESIA_VOICE_ID")`, `text_aggregation_mode=TextAggregationMode.TOKEN` |
| **LLM (voice + UI workers)** | via `create_llm_service()` | `llm.py:20-62` | `LLM_PROVIDER` env → `OpenAILLMService` (default) or `CerebrasLLMService`; model from `OPENAI_MODEL`/`CEREBRAS_MODEL` |
| **LLM (descriptions/Q&A + discovery suggestions)** | `AsyncOpenAI` (raw SDK) | `descriptions.py:40-44`, `discovery_agent.py:201-204` | always OpenAI, model `OPENAI_MODEL` |
| **VAD** | `SileroVADAnalyzer` | `bot.py:188` | in user aggregator |
| **Transport** | `DailyParams` or `TransportParams` (SmallWebRTC) | `bot.py:257-270` via `create_transport` | chosen by runner args; webrtc default locally |
| **Noise filter** | `KrispVivaFilter` | `bot.py:250-255` | only when `ENV != "local"` |

**Transport is selectable: SmallWebRTC (default, local) or Daily.** `create_transport(runner_args, transport_params)` picks based on the `/start` request (`transport: "webrtc"|"daily"`). Local server binds `http://localhost:7860` (SmallWebRTC); the runner's `main()` (pipecat's `pipecat.runner.run`) exposes the `/start` endpoint.

**Every env var / key** (`server/.env.example` + README):
- `LLM_PROVIDER` (default `openai`)
- `OPENAI_API_KEY`, `OPENAI_MODEL` — **required regardless** (descriptions/Q&A always use OpenAI)
- `CEREBRAS_API_KEY`, `CEREBRAS_MODEL` — only if `LLM_PROVIDER=cerebras`
- `SONIOX_API_KEY` — STT
- `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` — TTS
- `DAILY_API_KEY` — only for the Daily transport
- (`ENV=local` disables Krisp)

**To retarget at NVIDIA Nemotron + Gladia:**
1. **LLM → Nemotron:** add an `elif provider == "nvidia"` branch in `server/llm.py` returning the appropriate pipecat LLM service (e.g. an OpenAI-compatible service pointed at NVIDIA's endpoint, or `pipecat-ai[nim]`/NVIDIA service if available; add the extra to `pyproject.toml`). Set `LLM_PROVIDER=nvidia`. **Also** replace the raw-OpenAI calls in `descriptions.py` and `discovery_agent.py` (or keep OpenAI just for those, but that defeats the swap) — for the PRM you'll likely drop `descriptions.py` entirely.
2. **STT → Gladia:** replace `SonioxSTTService` at `bot.py:168` with `GladiaSTTService` (`pipecat-ai[gladia]`), add `GLADIA_API_KEY`. One class swap.
3. **TTS:** Cartesia is fine; swap similarly if needed.
The worker code is provider-agnostic; only these instantiations change.

---

# B. Client / frontend architecture

## B6. Framework & build
- **React 19 + Vite 8 + TypeScript** (`client/package.json`, `client/vite.config.ts`). Plain Vite SPA; build is `tsc -b && vite build`.
- **Pipecat client libs:** `@pipecat-ai/client-js`, `@pipecat-ai/client-react`, `@pipecat-ai/voice-ui-kit` (provides `PipecatAppBase`, `ConnectButton`, `VoiceVisualizer`, `SpinLoader`, `ErrorCard`), plus transports `@pipecat-ai/daily-transport` and `@pipecat-ai/small-webrtc-transport`.
- **No shadcn/ui here** — styling is one hand-written stylesheet (`client/src/index.css`, ~715 lines) importing `@pipecat-ai/voice-ui-kit/styles`. (Our PRM will use shadcn instead, but the screen/command structure carries over unchanged.)
- **Entry point:** `client/src/main.tsx` → `Main` renders `<PipecatAppBase>` and passes `{client, handleConnect, handleDisconnect}` into `<App>` (`client/src/App.tsx`).
- **Directory layout:** `src/{App.tsx, main.tsx, config.ts, types.ts}`, `src/hooks/{useServerMessages,useClickSender,usePreviewPlayer}.ts`, `src/components/{Header,Grid,Toast}.tsx`, `src/screens/{Welcome,Home,Artist,Detail,Trending}.tsx`.

## B7. Connecting to the bot
`client/src/config.ts` builds the connect params from env:
- `VITE_BOT_START_URL` (default `http://localhost:7860/start`)
- `VITE_BOT_START_PUBLIC_API_KEY` (optional bearer token, e.g. Pipecat Cloud public key — added as `Authorization: Bearer …` header)
- `VITE_TRANSPORT` (`smallwebrtc` default | `daily`)

`smallWebRTCConfig` posts `{createDailyRoom:false, enableDefaultIceServers:true, transport:"webrtc"}` to the start URL; `dailyConfig` posts `{createDailyRoom:true, dailyRoomProperties:{start_video_off:true}, transport:"daily"}`. `main.tsx` passes the chosen config to `PipecatAppBase` with **`initDevicesOnMount`** (mic permission/capture is handled by the voice-ui-kit + transport — the app never touches `getUserMedia` directly). The handshake: `PipecatAppBase` creates the RTVI `client`, `handleConnect` does the `/start` POST + WebRTC/Daily negotiation; when ready, `RTVIEvent.BotReady` fires and the app sends a `hello` UI event (see B8). **Audio playback of the bot's TTS** is handled entirely by the transport/voice-ui-kit (the WebRTC audio track) — no app code.

## B8. Receiving & rendering server UI commands
All of it is in **`client/src/hooks/useServerMessages.ts`**. A single subscription:
```ts
useRTVIClientEvent(RTVIEvent.UICommand, (data) => {
  const { command, payload } = data as UICommandData;
  const msg = { type: command, ...payload } as ServerMessage;
  if (msg.type === "screen") { /* switch on msg.screen → setScreen({kind, ...}) */ }
  else if (msg.type === "toast") { showToast({...}, /*followsBot*/ true); }
  else if (msg.type === "playback") { setNowPlaying(...); player.play(preview_url) }
  else if (msg.type === "playback_control") { player.pause/resume/stop }
  else if (msg.type === "favorite_added"|"favorite_removed") { setFavorites(...) }
  else if (msg.type === "scroll_to") { document.querySelector('[data-scroll-target=...]').scrollIntoView() }
});
```
- **State management** is plain React `useState` in this one hook (`screen`, `favorites`, `toast`, `nowPlaying`). No Redux/Zustand. The hook returns `{screen, favorites, toast, nowPlaying, closeToast, reset}`.
- **Screens map to components** in `App.tsx` by a discriminated union `Screen` (`types.ts`): `home`→`<Home>`, `artist`→`<Artist>`, `detail`→`<Detail>`, `trending`→`<Trending>`. The server is the source of truth — the client renders whatever `screen` command it last received. The `screen` payload carries the full data to render (artists, albums, tracklist, flags like `is_playing`/`is_favorite`/`back_enabled`).
- **Nice touch:** toasts raised by narrated answers (`followsBot=true`) auto-dismiss on `RTVIEvent.BotStoppedSpeaking`, so the card disappears when the voice finishes. Audio previews play via `usePreviewPlayer` (a single `HTMLAudioElement`).

So the client is a **thin server-driven renderer**: server owns state, emits `screen`/`toast`/`playback` commands; client maps them to components.

## B9. Sending user clicks (no LLM round-trip)
`client/src/hooks/useClickSender.ts`:
```ts
const client = usePipecatClient();
return (event) => { const { kind, ...payload } = event; client.sendUIEvent(kind, payload); };
```
`App.tsx` wires every interactive element to `sendClick({kind, ...})`, e.g. clicking an artist → `{kind:"nav", view:"artist", artist_id}`; Play → `{kind:"action", action:"play", item_id, artist_id}`; a tab → `{kind:"set_tab", artist_id, tab}`. These become `BusUIEventMessage`s dispatched to the matching `@ui_event` handler on the server, which **mutates state and re-emits a `screen` command without invoking any LLM** — instant, cheap, and it keeps `<ui_state>` current for the next spoken turn. The `ClickEvent` union in `types.ts` is the typed contract for these.

## B10. Voice widget / mic / transcript
There is **no separate docked voice bar** in this app; the voice affordances live in the top **`Header`** (`client/src/components/Header.tsx`):
- `<ConnectButton onConnect onDisconnect />` (from voice-ui-kit) — the mic/connect control. Mic capture is implicit via the transport.
- `<VoiceVisualizer participantType="bot" .../>` — animated bars reacting to the **bot's** audio.
- A "Now playing … / Stop" area and Back/Home nav buttons.
- Pre-connect, a centered `<Welcome>` card (with example phrases and a large `ConnectButton`) replaces the header.

**There is no transcript UI** (no captions rendered). For the PRM's **docked bottom widget** we'd build a new component (mic button + visualizer + optional live transcript), but the wiring is identical: `ConnectButton`/`handleConnect` for connect, `VoiceVisualizer` for feedback, and `useRTVIClientEvent(RTVIEvent.UserTranscript/BotTranscript, …)` if we want captions. The voice-ui-kit supplies the primitives.

---

# C. Ops

## C11. Running locally
- **Server (Python 3.11+, `uv`):**
  ```bash
  cd server && uv sync && uv run bot.py     # binds http://localhost:7860 (SmallWebRTC)
  ```
  Needs `server/.env` with the keys in A5.
- **Client (Node 20+, `npm`):**
  ```bash
  cd client && npm install && npm run dev    # http://localhost:5173
  ```
  Defaults point at `localhost:7860/start`; click **Connect** and talk. `client/.env.local` overrides `VITE_*`.
- Tooling: server uses **uv** (lockfile `uv.lock`), client uses **npm** (`package-lock.json`). No pnpm.

## C12. Deployment
- **Server → Pipecat Cloud.** `server/pcc-deploy.toml`: `agent_name="music-player"`, `secret_set="music-player-secrets"`, `agent_profile="agent-1x"`, `[krisp_viva] audio_filter="tel"`, `[scaling] min_agents=1`. `server/Dockerfile` is `FROM dailyco/pipecat-base:latest` + `uv sync --locked` + `COPY ./*.py`. Deploy flow: `pc cloud secrets set music-player-secrets --file .env` then `pc cloud deploy`. **`min_agents=1` keeps one warm instance** — good for an always-on public demo (no cold start), but it's a paid, always-running agent.
- **Client → any static host** (README says Vercel/Netlify/Cloudflare Pages). `npm run build` → deploy `client/dist/`. Point `VITE_BOT_START_URL` at the hosted agent's public start URL (`https://api.pipecat.daily.co/v1/public/<agent>/start`) with `VITE_BOT_START_PUBLIC_API_KEY=pk_...`. Live demo today: `pipecat-music-player.vercel.app`.
- **Public-demo notes for us:** the design has **no auth and per-session in-memory state** — perfect for an open demo, but every visitor shares one running agent instance and **all data is lost on restart / not shared across sessions**. For seeded PRM demo data we must seed the data worker at `start()` and (ideally) back it with persistence. Pipecat Cloud is one hosting option; the server is also a plain ASGI-ish runner, so it could run on Railway/Fly/Render with a WebRTC-capable setup if we prefer.

---

# D. Reuse / adaptation plan for the PRM

## D13. Concrete mapping

**Workers:**
| Music app | PRM |
|---|---|
| `PipelineWorker` (`bot.py`, `name="main"`) | **identical** — voice pipeline + RTVI + `handle_request` delegating to the UI worker. Only services change (Nemotron/Gladia). |
| `MusicUIWorker` (`ui_agent.py`) | **`PRMUIWorker`** — owns nav stack + screen state, drives the client, runs the UI LLM with `keep_history=False` + injected `<ui_state>`. |
| `CatalogWorker` (`catalog_agent.py`) | **`PRMDataWorker`** — owns people/notes/interactions/reminders; one `@job` per data op; back it with a DB. |
| 3× discovery workers | **drop for v1** (optional later for enrichment, e.g. "suggest who to reconnect with"). |

**Screens / nav stack** (`Screen` union + `NavFrame`):
`home` (people list / dashboard) → `person` (detail; tabs: Overview / Notes / Timeline / Reminders) → optionally `note`/`interaction` detail. Plus maybe `reminders` (all upcoming) and `search` results. The nav stack + `go_back`/`go_home` carry over verbatim.

**Tool set for `PRMUIWorker`** (mirrors the music tools):
- Navigation/UI-drive: `navigate_to_person(name)`, `search_people(query)`, `switch_tab(tab)` (overview|notes|timeline|reminders), `go_back()`, `go_home()`, `open_reminders()`.
- Data mutations (these call `PRMDataWorker` jobs): `add_note(person, text)`, `log_interaction(person, type, summary, when?)`, `set_reminder(person, due, text)`, `update_person(person, fields)`, `add_person(name, fields)`.
- Q&A / screen-awareness: `answer_about_person(question, about?)` (facts from a person's record), `answer_about_screen(answer)` (read-only, from `<ui_state>` — reuse as-is).

**Data worker jobs for `PRMDataWorker`:** `list_people`, `find_person`, `get_person`, `search_people`, `add_person`, `update_person`, `add_note`, `list_notes`, `log_interaction`, `list_interactions`, `set_reminder`, `list_reminders`, `complete_reminder`. Same `@job(name=...)` + `send_job_response` shape as the catalog.

**Client commands** stay the same vocabulary: `screen` (per screen kind), `toast` (e.g. "Note saved"), and we can drop `playback`/`playback_control` (no audio previews). `scroll_to` is handy for jumping to a person's timeline section.

## D14. Copy nearly as-is vs. rewrite (effort estimates)

| Piece | Action | Effort |
|---|---|---|
| `bot.py` pipeline + `handle_request` + `VOICE_PROMPT` | **Copy almost verbatim**; tweak the prompt's domain wording. | XS (½ day) |
| `llm.py` factory | **Copy**; add Nemotron branch. | XS |
| UIWorker skeleton: nav stack, `render_ui_state`/`_describe_*`, `@ui_event` handlers, `send_command` plumbing, `respond_to_job(tts_speak=True)` pattern | **Copy the structure**, rewrite the domain specifics (screens, tools, describe-functions). | M (2–4 days) |
| `CatalogWorker` → `PRMDataWorker` | **Copy the `@job` skeleton + caching idioms**; replace Deezer with a DB/seed store. | M (2–3 days) |
| `descriptions.py`, `deezer.py`, `discovery_agent.py` | **Delete / replace.** | — |
| Client `useServerMessages`/`useClickSender`/`config` | **Copy nearly as-is**; extend `Screen`/`ServerMessage`/`ClickEvent` unions for PRM. | S (1 day) |
| Client screens/components | **Rewrite in shadcn/ui** (Home/Person/Notes/Timeline/Reminders) following the same prop-driven, server-state pattern. | M–L (3–5 days) |
| Docked voice widget (mic + visualizer + transcript) | **New component** using voice-ui-kit primitives. | S–M (1–2 days) |
| `usePreviewPlayer`, Toast | preview player **drop**; Toast **keep**. | XS |

## D15. Risks / gaps

1. **Nemotron tool-calling.** The whole architecture hinges on **reliable single-tool selection per turn** (voice route picks `handle_request`; UI worker picks exactly one tool grounded by `<ui_state>`). OpenAI does this well; **Nemotron's function-calling fidelity and adherence to "exactly one tool, no chit-chat" must be validated early.** The strict prompts help, but if tool-calling is weaker we may need few-shot examples, a constrained/JSON-mode tool schema, or a smaller routing model. Pipecat exposes Nemotron via an OpenAI-compatible `LLMService`, so wiring is easy; **behavior is the risk, not plumbing.** Mitigation: keep `descriptions`-style free-text generation off the critical path.
2. **STT swap (Gladia).** Mechanically a one-class swap. Watch: streaming/partials behavior and VAD interplay (the user aggregator uses `SileroVADAnalyzer`); confirm Gladia's interim results don't double-trigger turns. Names of people (proper nouns) are STT-hard — consider Gladia custom vocabulary / name hints.
3. **Latency.** Two inferences per spoken turn is the floor; with Nemotron + Gladia + TTS, target <1.5s perceived. The click path (0 inferences) is already instant. Keep the UI LLM prompt tight (it's large today) and `keep_history=False` (cheap context). Pre-warm the data worker.
4. **Always-on public demo.** Pipecat Cloud `min_agents=1` avoids cold starts but is a running cost, and **one agent instance is effectively single-tenant per session**; concurrent visitors need scaling (`min_agents`/profile) and, importantly, **session isolation** for state. Decide whether all demo visitors share one seeded dataset (simplest) or get per-session copies.
5. **No database (we need persistence).** Today everything is in-memory and per-process; favorites/catalog vanish on restart and aren't shared. The PRM **must** persist people/notes/interactions/reminders. Cleanest fit: give `PRMDataWorker` a real store (SQLite/Postgres) behind its `@job` handlers, seed demo data in `start()`. This is additive and localized — the rest of the architecture doesn't care.
6. **Multi-tenancy / identity.** "No login for v1" + shared demo means we must decide if writes are global (anyone can edit the demo's people) or sandboxed per session. In-memory per-session is easy but loses data; a shared DB needs a reset strategy.
7. **shadcn/ui + server-driven rendering.** The server emits data-only `screen` commands; our shadcn components just render that data. No conflict — but we must keep the **server as source of truth** and avoid client-side local state that can desync from `<ui_state>` (the music app is disciplined about this; we should be too).
8. **`answer_about_screen` accuracy** depends entirely on `render_ui_state()` being faithful. Invest in good `_describe_*` functions for each PRM screen (list ordering, person fields, upcoming reminders) so on-screen Q&A is correct.

---

## Key file index (absolute paths)
- Server pipeline + voice routing: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/server/bot.py`
- UI worker (screens/nav/tools/screen-state): `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/server/ui_agent.py`
- Data worker: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/server/catalog_agent.py`
- LLM provider factory (swap point): `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/server/llm.py`
- Descriptions/Q&A (raw OpenAI): `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/server/descriptions.py`
- Discovery fan-out workers: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/server/discovery_agent.py`
- Deezer HTTP client: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/server/deezer.py`
- Deploy/env: `server/pcc-deploy.toml`, `server/Dockerfile`, `server/.env.example`, `server/pyproject.toml`
- Client connect config: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/client/src/config.ts`
- Client app shell + click wiring: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/client/src/App.tsx`
- Receive server commands: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/client/src/hooks/useServerMessages.ts`
- Send clicks: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/client/src/hooks/useClickSender.ts`
- Voice header/widget: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/client/src/components/Header.tsx`
- Types/contracts: `/Users/netto/work/hackathons/yc-voice-agents-pipecat/pipecat-music-player/client/src/types.ts`

## Framework source consulted (pipecat 1.3.0, uv cache)
- `~/.cache/uv/archive-v0/GSpWKFvK3I2mXfMT/pipecat/workers/base_worker.py` — jobs, `job()`/`job_group()`, `send_job_response`.
- `~/.cache/uv/archive-v0/GSpWKFvK3I2mXfMT/pipecat/workers/ui/ui_worker.py` — `UIWorker`, `render_ui_state`, auto-inject hook, `send_command`, `respond_to_job`, `keep_history`.
- `~/.cache/uv/archive-v0/GSpWKFvK3I2mXfMT/pipecat/workers/ui/ui_event_decorator.py`, `workers/llm/tool_decorator.py` — `@ui_event`, `@tool`.
- `~/.cache/uv/archive-v0/GSpWKFvK3I2mXfMT/pipecat/pipeline/worker.py` — `PipelineWorker`, RTVI bridge (`BusUICommandMessage`→`RTVIUICommandFrame`, client event republish, `BusTTSSpeakMessage`→`TTSSpeakFrame`), `enable_rtvi=True` default.
