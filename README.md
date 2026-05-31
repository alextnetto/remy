# Remy — be the person who remembers

**A voice-first memory for the people you love.** Tell Remy about your day the
way you'd tell a friend — *"add a note to Sarah, she just had a baby, a boy named
Leo, remind me to send a gift next week"* — and it files every detail to the
right person and hands it back when it matters. Like a CRM, but for your personal
relationships.

▶️ **Live demo (no login): https://hey-remy.vercel.app**

<p align="center">
  <img src="docs/screenshots/prm-home.png" width="31%" alt="Home / People" />
  <img src="docs/screenshots/prm-person.png" width="31%" alt="Person detail" />
  <img src="docs/screenshots/prm-reminders.png" width="31%" alt="Reminders / Today" />
</p>

## 1. What is this?

A mobile-first web app for remembering the people in your life (notes, birthdays,
where they work, shared moments, follow-ups), with a hands-free voice agent docked
at the bottom. The app works on its own; the voice agent adds a layer that both
**captures** (“add a note to Tom”) and **recalls** (“who should I follow up with
this week?”), and **drives the app for you** — navigating, searching, and
highlighting what changed, all by voice. It runs as a live, no-login demo over a
shared world of seeded people.

## 2. Demo video (< 60s)

▶️ **https://youtu.be/coMqL6-QHvk** — capture and recall, hands-free, on the live app.

## 3. How we used Pipecat, Nemotron & Cekura

**🎙️ Pipecat** is the core. The voice layer is two workers on one bus: a main
worker (Parakeet STT → Gradium TTS over SmallWebRTC, **no router LLM**) dispatches
each finished utterance to an action worker (one Nemotron LLM + the PRM tools)
that picks one tool, mutates data via the Next.js API, drives the UI with an RTVI
`UICommand`, and speaks the reply. The client reports its screen back as
`<ui_state>` each turn, so “open the first one” and “what’s on screen?” resolve
against what you’re looking at. Postgres is the single source of truth, so taps
and voice never desync.

**🧠 Nemotron** runs in two places: (1) **voice tool-calling** in the action
worker, and (2) **semantic people search** — the Home search bar *is* an LLM, so
“who do I know in the USA” matches someone based in “San Francisco, CA”.

**🧪 Cekura** — we created an account and planned a loop to score the agent's
**tool-selection accuracy**, but the onboarding was involved enough that we ran
out of hackathon time before a real test run. Setup feedback below.

## 4. What we built during the hackathon

**All of Remy is new**, built on **Pipecat + Next.js + shadcn/ui** (NVIDIA /
Gradium wiring follows the starter examples). From scratch: a **9-table data
model**, three mobile screens + a guided add-person flow, a **~20-route CRUD API**
(Prisma/Postgres) shared by app and agent, the **entire voice agent** (both
workers, **18 PRM tools**, the `<ui_state>` protocol, and the RTVI command/event
contract across TS + Python), and the pitch ([`docs/pitch/`](docs/pitch/)).
Borrowed: the frameworks. New: everything that makes it Remy.

## 5. Feedback on the tools

**NVIDIA Nemotron** — *Good:* unforced tool-calling is solid (one correct,
well-formed tool call per turn), and it reasons over data well (the semantic
search). *Could be better:* (1) **forcing `tool_choice` made it speak the
tool-argument JSON aloud** (“open brace, query, colon…”) on the vLLM endpoint — we
had to delete our router and let one unforced LLM do the work; clearer guidance
would help. (2) **Eager endpointing cut us off mid-sentence**; tuning Pipecat's
turn-detection to wait fixed reliability but traded away latency. Getting both at
once is the hard part.

**Cekura** — we only reached setup, so this is onboarding feedback: it felt
complex enough that we couldn't get to a first scored run in time. The thing we
most wanted: a copy-pasteable path to point Cekura at a **Pipecat / WebRTC voice
agent** (not a phone number or text endpoint) and get a scored run.

## Run it yourself

```bash
docker compose up -d db
cd web && cp .env.example .env && pnpm install
pnpm exec prisma migrate deploy && pnpm run db:seed && pnpm dev   # → localhost:3000
```

Then run the voice server from [`server/`](server/README.md). Full keys & deploy
steps: [`HANDOFF.md`](HANDOFF.md). Design spec & research:
[`docs/`](docs/superpowers/specs/2026-05-30-prm-voice-v1-design.md).

**Stack:** Next.js · shadcn/ui · Prisma · Postgres (Supabase) · Pipecat · NVIDIA
Parakeet (STT) · Nemotron (LLM) · Gradium (TTS) · SmallWebRTC — OpenAI + Gradium
fallback.
