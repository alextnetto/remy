# PRM Voice — v1 Design Spec

- **Date:** 2026-05-30
- **Status:** Draft (awaiting review)
- **Owner:** alex (alextnetto)
- **Working dir:** `/Users/netto/work/hackathons/yc-voice-agents-pipecat`

## 1. Overview

A **Personal Relation Manager (PRM)** — like a CRM, but for personal relationships. The goal is to help you take care of the people in your life: remember details, nurture relationships, and recall what matters at the right moment.

v1 is a **mobile-first, minimal web app** with a **voice agent docked at the bottom**. The app is fully usable on its own (browse, tap, edit); connecting the voice agent adds a hands-free UX layer that can both **manage your data** (people, notes, dates, orgs, moments, reminders) and **drive the app** (navigate, answer "what's on screen").

It ships as a **live, open, no-login demo** over a **single shared world** of seeded data.

### Hero loop — Remember & recall
1. **Capture (voice):** "Add a note to Sarah — she just had a baby, Leo." / "Sarah's birthday is March 3." / "Add my friend Tom from the gym."
2. **Recall (voice):** "What do I know about Sarah?" / "Who should I follow up with this week?"

Everything (data model, screens, tools) is built around making capture effortless and recall instant.

### Goals
- A polished, minimal mobile UI (shadcn) that stands on its own.
- A voice agent that reliably manages PRM data **and** drives the UI.
- A faithful, low-rework adaptation of the proven `pipecat-music-player` voice/UI pattern.
- A live public demo anyone can try.

### Non-goals (v1)
- Auth / multi-user accounts (single shared world).
- Org detail screens, people dedup/merge, contact import, push notifications.
- Native mobile app, i18n, full-text search beyond simple filtering.
- A call/message interaction log (we use **moments** instead — see §4).

## 2. Architecture (Approach B — standalone app + voice overlay)

The app works **without** the voice agent. The voice agent is an **optional, additive** layer.

```
┌─────────────────────────────┐        RTVI / WebRTC          ┌──────────────────────────────┐
│  Web app  (Next.js + shadcn)│ ───── audio + UI events ────► │  Voice server (Python/Pipecat)│
│  - App Router routing       │ ◄──── UI commands ─────────── │  - Main voice worker          │
│  - Renders Postgres data    │                               │  - PRM action/UI worker       │
│  - Voice dock (bottom)      │                               │                               │
└───────────────┬─────────────┘                               └───────────────┬──────────────┘
                │ CRUD via Next.js API routes (single data layer)              │ same API (httpx)
                ▼                                                              ▼
        ┌───────────────────────────── Postgres (Supabase) — single shared world ──────────────┐
```

### Components
- **Web app — Next.js (App Router) + shadcn/ui.** Owns routing and rendering. Reads/writes Postgres through its **own API routes**, which are the **single CRUD layer** for the whole system. Mobile-first.
- **Voice server — Python + Pipecat** (workers pattern, pipecat ≥1.3). Optional overlay. Its tools call the **same Next.js API** for data ops (no duplicate data logic) and emit **UI commands** to drive the live client. Two workers (see §6).
- **Postgres (Supabase).** The shared world. Single source of truth. The voice server holds **no** data state.

### Voice ↔ app integration
- **Driving the UI:** the action worker emits RTVI `UICommand`s — `navigate {route}`, `refresh`, `highlight {id}`, `toast {text}`. The client executes them against its own Next.js router / data layer (`router.push`, re-fetch).
- **Screen awareness:** on every navigation or view load (whether triggered by a tap or by the agent), the client reports its current screen via `sendUIEvent('screen', {route, visible:[…]})`. The worker injects this as `<ui_state>` each turn (see §6) so "open this one" / "what's on screen" resolve against the live screen.
- **Consistency:** after any voice write, the worker calls the API then emits `refresh`; the client re-fetches. App-initiated writes are normal API calls + local refetch — the worker isn't involved, and reads fresh data next time. Postgres stays the single source of truth, so **no desync**.
- **Optionality:** taps never require the worker. If voice is disconnected, the app is fully functional.

### Trade-off (acknowledged)
B is more work than the music-player's thin-client model: the app owns its own data layer + routing, and screen-awareness flows **client → worker** (vs. the template, where the worker owns screen state). Chosen deliberately so the app is standalone-usable.

## 3. Repository & layout

Single GitHub repo under **`alextnetto`** (name TBD at creation — proposed: `prm-voice`). Monorepo:

```
prm-voice/
  web/         # Next.js (App Router) + shadcn + Prisma
  server/      # Python Pipecat voice server (adapted from pipecat-music-player)
  db/          # SQL migrations + seed (or Prisma migrations under web/)
  docs/        # this spec + research/
```

The reference clones (`pipecat-music-player`, `yc-voice-agents-hackathon`) stay **outside** the repo (kept as local siblings for reference).

## 4. Data model (Postgres)

9 tables. `id` = `uuid` (`gen_random_uuid()`), timestamps = `timestamptz default now()`.

### people
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text not null | |
| avatar_url | text null | fallback: generated initials/color |
| relationship_to_me | text null | freeform: "friend", "family", "colleague", "mentor" |
| story | text null | curated bio / narrative |
| base | text null | home base / location (freeform city/region) |
| interests | text[] default '{}' | |
| created_at / updated_at | timestamptz | |

### contact_methods  *(flexible — covers phone, email, website, LinkedIn, socials)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| person_id | uuid fk → people (cascade) | |
| kind | text not null | `phone` \| `email` \| `website` \| `linkedin` \| `instagram` \| `x` \| `whatsapp` \| `telegram` \| `other` |
| value | text not null | number / url / handle |
| label | text null | e.g. "work", "personal" |

### important_dates  *(feeds the "Today" surface)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| person_id | uuid fk → people (cascade) | |
| label | text not null | "Birthday", "Work anniversary", … |
| date | date not null | |
| recurring | boolean default true | birthday = a recurring entry here |

### notes  *(separate table; person.story remains the bio)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| person_id | uuid fk → people (cascade) | |
| body | text not null | |
| pinned | boolean default false | |
| created_at | timestamptz | timestamped atomic recall |

### organizations  *(lightweight — no dedicated screen in v1)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text not null | |
| type | text null | `company` \| `school` \| `club` \| `nonprofit` \| `family` \| `other` |
| description | text null | |
| base | text null | |
| created_at / updated_at | timestamptz | |

### person_organizations  *(join: person ↔ org with a relationship)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| person_id | uuid fk → people (cascade) | |
| org_id | uuid fk → organizations (cascade) | |
| relationship | text null | "works at", "studied at", "founder of", "volunteers at" |
| role | text null | e.g. "Engineer" |
| | | unique(person_id, org_id, relationship) |

### moments  *(shared, multi-person; "where / who / description")*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| title | text null | optional short title |
| description | text not null | |
| place | text null | the "where" (freeform; `place` avoids the SQL `where` keyword) |
| occurred_at | date null | when it happened |
| org_id | uuid fk → organizations null | optional org link |
| created_at | timestamptz | |

### moment_people  *(join: the "who" — many-to-many)*
| column | type | notes |
|---|---|---|
| moment_id | uuid fk → moments (cascade) | |
| person_id | uuid fk → people (cascade) | |
| | | pk(moment_id, person_id) |

### reminders  *(manual follow-ups)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| person_id | uuid fk → people (cascade) | |
| text | text not null | |
| due_at | timestamptz not null | |
| done | boolean default false | |
| created_at | timestamptz | |

**A person's full record** = people + their contact_methods + important_dates + notes + linked organizations + moments they're in + reminders.

## 5. Screens & IA (mobile-first)

A persistent **voice dock** sits at the bottom of every screen (Connect/disconnect, mic, audio visualizer, live transcript, agent status). Optional.

1. **`/` — Home / People**
   - **Today strip** (top): due/overdue reminders + important dates in the next 7 days.
   - **Search** bar: filter people by name / interest / org.
   - **People list:** avatar, name, relationship_to_me, base, badge for next reminder/date.
   - **Add person** action.
2. **`/people/[id]` — Person detail**
   - Header: avatar, name, relationship, base, quick contact icons.
   - **Story** (editable narrative).
   - **Contacts** (tappable: `tel:`, `mailto:`, links).
   - **Important dates** (birthday + others; recurring badges).
   - **Organizations** (linked orgs + relationship labels).
   - **Notes** (timestamped list; add note).
   - **Moments** (timeline of moments this person is in; each shows place/date/co-participants).
   - **Reminders** (this person's follow-ups; add / complete).
3. **`/reminders` — Reminders / Today**
   - All due/overdue/upcoming reminders + upcoming important dates across everyone; complete/snooze.

Orgs render **on the person** (no org screen in v1). Moments render **on the person timeline** (no standalone moments screen in v1).

## 6. Voice agent (Pipecat workers)

Adapted from `pipecat-music-player`. Two workers; **two inferences per spoken turn** (route → act) for low latency and clean screen grounding.

### Main voice worker (`PipelineWorker`)
- Pipeline: `transport.in → STT → user_agg → LLM(router) → TTS → transport.out → assistant_agg`. RTVI auto-enabled (bridge to client).
- **One tool: `handle_request(query)`** → opens a `respond` job on the action worker and **speaks back whatever it returns, verbatim**.
- Strict `VOICE_PROMPT`: never answer directly, never rephrase deictic words ("this", "the first one", "her").

### PRM action/UI worker (`UIWorker`, own LLM)
- **Screen-awareness:** `keep_history=False`; each turn the worker injects the client-reported screen as `<ui_state>…</ui_state>` (developer message) before inference, so the actor sees **only** the live screen + the current query.
- Data ops call the **Next.js API** (httpx). UI driving emits `UICommand`s. Every tool ends with `respond_to_job(answer, tts_speak=True)` (UI worker speaks; voice LLM stays silent) and a `refresh`/`navigate` command so the standalone app updates.

**Tools:**

*Navigation / UI*
- `navigate_to_person(query)` · `search_people(query)` · `open_reminders(filter)` · `go_back()` · `go_home()`

*Capture / mutate (hero)*
- `add_person(name, relationship?, base?, interests?)`
- `update_person(person, field, value)` — story, base, relationship, add interest
- `add_contact(person, kind, value, label?)`
- `add_note(person, body)`
- `add_important_date(person, label, date, recurring?)`
- `link_organization(person, org_name, relationship, role?)` — find-or-create org + link
- `add_moment(description, people[], place?, occurred_at?, org?)` — multi-person
- `set_reminder(person, text, due_at)` · `complete_reminder(person?, text?|id)`

*Recall (hero)*
- `answer_about_person(person, question)` — reads the person's full record via API, answers
- `answer_about_screen(question)` — answers from injected `<ui_state>`

### Provider note
Keep the two-LLM split: a focused actor LLM with only the action tools + fresh screen context calls tools more reliably (important for Nemotron) than one LLM juggling chat + many tools.

## 7. Voice service stack

Target = the demo repo's NVIDIA path, provider-selectable, with a proven fallback.

| Role | Primary (NVIDIA showcase) | Fallback / dev default |
|---|---|---|
| STT | **NVIDIA Parakeet** (`NVidiaWebSocketSTTService`) | Gradium STT |
| LLM | **Nemotron-3-Super-120B** via vLLM (OpenAI-compatible; thinking **off** for latency) | OpenAI GPT-4.1 |
| TTS | **Gradium** (`GradiumTTSService`) | Gradium |
| Transport | SmallWebRTC (v1) | Daily (scale option) |

- **Swap points** (centralized): STT/TTS/transport in `server/bot.py`; LLM provider branch in `server/llm.py` (`LLM_PROVIDER` env). Lift the Nemotron/Parakeet/Gradium service classes from `yc-voice-agents-hackathon`.
- **Env vars:** `GRADIUM_API_KEY`, `GRADIUM_VOICE_ID`, `NVIDIA_ASR_URL`, `NEMOTRON_LLM_URL`, `NEMOTRON_LLM_MODEL`, `NEMOTRON_LLM_API_KEY`, `NEMOTRON_ENABLE_THINKING`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `LLM_PROVIDER`, `PRM_API_BASE_URL` (Next.js API), `DATABASE_URL` (web).

## 8. Demo & data operations
- **Shared world:** one Postgres dataset everyone reads/edits.
- **Seed:** ~8–12 rich people with contacts, dates, orgs, a few shared moments, notes, and reminders — enough to make the hero loop demo well on first load.
- **Reset-to-seed:** a protected script/endpoint that wipes + reseeds (run manually or on a daily cron) to recover from drift/griefing.
- **Guardrails:** basic API rate limiting; length caps on writes; optional profanity filter; capped voice session length.

## 9. Hosting / deployment
- **Web** → Vercel.
- **Voice server** → Pipecat Cloud (`pcc-deploy.toml`, `min_agents=1` to stay warm). Alt: Railway.
- **DB** → Supabase (Postgres).

## 10. Open questions / risks
1. **⚠️ Live NVIDIA endpoints (biggest):** the hackathon-hosted Nemotron + Parakeet are likely offline. Decide: managed (NVIDIA NIM / build.nvidia.com), self-host, or run the public demo on the **OpenAI + Gradium** fallback and keep NVIDIA as a toggle.
2. **Nemotron tool-calling fidelity:** validate single-tool-per-turn behavior early — the 2-inference design depends on it.
3. **Voice↔app sync mechanism:** start with command-driven `refresh` + client refetch; consider Supabase realtime later.
4. **Screen-state reporting granularity** (client → worker): enough detail for `answer_about_screen` + deixis without bloating each turn.
5. **Concurrency/cost** on Pipecat Cloud (each connected visitor = one bot session). Voice being optional limits this.
6. **Shared-world reset cadence** + abuse handling.

## 11. Build order (rough — detailed plan to follow)
1. DB schema + migrations + seed (Supabase).
2. Next.js app: 3 screens + CRUD API routes (standalone, no voice yet).
3. Voice server: adapt `pipecat-music-player` (main + action worker) calling the API; UI command + screen-event channel.
4. Voice dock component + RTVI client wiring in the web app.
5. Swap in NVIDIA/Gradium services behind the provider flag; validate tool-calling.
6. Seed/reset/guardrails; deploy (Vercel + Pipecat Cloud + Supabase).
