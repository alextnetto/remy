# PRM Voice — Voice Agent Refinements (v1.1)

- **Date:** 2026-05-30
- **Status:** Approved (building)
- **Owner:** alex (alextnetto / blockful)
- **Parent spec:** `2026-05-30-prm-voice-v1-design.md`

## Context

Live-feedback refinements to the voice agent after the v1 build. Three changes,
one new API contract. Stack stays **NVIDIA Nemotron + Parakeet + Gradium (no
OpenAI)**. The two-LLM design is unchanged: a *router* LLM (`bot.py`) whose only
tool `handle_request(query)` delegates to a stateless, screen-grounded *action*
worker (`action_worker.py`).

## 1. Greeting → bare "Hey!"

`bot.py`'s `on_client_connected` developer message currently tells the LLM to
welcome the user and enumerate capabilities, producing a long, self-introducing
greeting. Replace it so the agent says **only a brief, warm one-word hello**
("Hey!") — no self-introduction, no capability list. The on-screen "Connected —
ask me about anyone, or add a note" toast (`action_worker.on_hello`) stays; the
affordance lives in the UI, not the agent's mouth.

## 2. Conversation memory → router remembers + rewrites

The router already keeps a persistent `LLMContext` for the session (user
utterances + the exact `handle_request` queries it issued). The gap is purely in
the prompt. Retarget `VOICE_PROMPT` with a short "Conversation memory" section:

- Use the running conversation to resolve cross-turn references.
- Expand terse follow-ups/continuations into a **self-contained** request before
  calling `handle_request` — e.g. after *"who lives in San Francisco?"*, then
  *"…and who plays tennis?"* → `handle_request("who plays tennis")`.
- Still leave **on-screen** deixis ("this", "the first one", "her", "him",
  "their") verbatim — the action layer resolves those against the live screen.

The action/tool layer stays stateless + screen-grounded (unchanged).

## 3. "Who lives in X / who plays Y" → LLM reasons over a people directory

A new cross-person question tool that reasons over a compact directory of
everyone, so it handles location ("who lives in San Francisco"), interests
("who plays tennis"), and generalizations ("who lives in the USA" — the LLM
knows CA → USA).

**New contract (TS ↔ Python in lockstep):**
- `types.ts`: `PersonDirectoryEntry = { id, name, relationshipToMe, base, interests }`.
- `api-contract.ts`: `GET /api/people/directory → PersonDirectoryEntry[]` + `api.people.directory()`.
- `prm/api_client.py`: `list_directory()`.

A dedicated endpoint (rather than widening `PersonSummary`, which omits
`interests`).

**New route** `web/src/app/api/people/directory/route.ts`: returns every person
as a `PersonDirectoryEntry`, ordered by name. Modeled on the existing
`api/people/route.ts` (Next.js 16 conventions per `web/AGENTS.md`).

**One-shot LLM helper** `llm.py::complete_text(system, user)`: single
non-streaming Nemotron completion reusing `create_llm_service`'s env/config
(thinking off), via the OpenAI-compatible client pointed at the Nemotron
endpoint.

**New tool** `action_worker.py::find_people(question)`: fetch the directory →
build a compact text block → `complete_text(...)` composes a one-sentence spoken
answer naming the matches (or "no one matches") → speak it. **Read-only** — no
navigation/refresh. `SYSTEM_PROMPT` gets one routing line: cross-person attribute
questions → `find_people`; a single named person → `answer_about_person`;
filter/show-the-list commands → `search_people`.

## Change map

- **Contracts (locked first):** `web/src/lib/types.ts`, `web/src/lib/api-contract.ts`, `server/prm/api_client.py`.
- **Web:** `web/src/app/api/people/directory/route.ts` (new).
- **Server:** `server/llm.py` (+`complete_text`), `server/action_worker.py` (+`find_people` + routing line), `server/bot.py` (greeting + `VOICE_PROMPT`).

## Verification

One live faked-mic run with **synthesized speech** (macOS `say`, fed through a
fake `getUserMedia` so the bot hears only the injected audio — no echo): connect
→ confirm bare "Hey!" → *"who lives in San Francisco?"* (`find_people`) →
*"and who plays tennis?"* (memory rewrite) → *"add a note to David that he loves
climbing"* (`add_note` → UI refresh), watching both the bot log and the web UI.
Proves the three new behaviors **and** exercises the previously-unverified tools
(closing the deferred ★ from `AGENT_HANDOFF.md`).

## Deferred (not v1.1)

- Recording the *answers* (not just the questions) into router memory — only if
  the live test shows the router needs it.
- Showing `find_people` matches on screen (filtered results view / multi-highlight).
- "Who lives in the USA"-class questions depend on LLM world-knowledge over the
  directory; no region mapping is built.

## Revision (v1.2) — search manifests in the UI (supersedes §3)

Per live feedback, cross-person discovery must **manifest in the app's search
bar**, not be spoken by the LLM. "The LLM is guiding and manifesting through the
UI." This supersedes the speak-only `find_people` / directory approach in §3:

- **New `search` UICommand** (`{query}`): the client navigates Home, fills the
  search box with `query`, and filters the people list via the app's own search.
  Locked in `rtvi-protocol.ts` ↔ `protocol.py`; bridged via `voiceBridge`
  (`onSearch`/`emitSearch` + a one-shot pending slot for the navigate-then-mount
  case) and a `useVoiceSearch` hook on Home.
- **`search_people(query)`** now emits `search {query}` (instead of navigating to
  the unfiltered list). The action LLM extracts the search *term* ("who lives in
  San Francisco" → `query="San Francisco"`; "who plays tennis" → `"tennis"`).
- The people filter now also matches **`base`** (location), so location queries work.
- **Removed:** `find_people`, `llm.complete_text`, `api_client.list_directory`,
  `GET /api/people/directory`, and `PersonDirectoryEntry` (the §3 machinery).
- Model: the LLM fills the real search bar (vs. curating an arbitrary result
  set). Limit: "who lives in the USA"-class questions don't reduce to one search
  term — deferred.
