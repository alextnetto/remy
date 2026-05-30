# PRM Voice

A mobile-first **Personal Relation Manager** — like a CRM, but for personal relationships. Remember details about the people in your life, nurture relationships, and recall what matters at the right moment.

The app is fully usable on its own. Connecting the **voice agent docked at the bottom** adds a hands-free layer that both manages your data (people, notes, dates, organizations, moments, reminders) and drives the app (navigate, answer "what's on screen").

> v1 is a live, open, no-login demo over a single shared world of seeded data.

## Monorepo

- **`web/`** — Next.js (App Router) + shadcn/ui + Prisma. The standalone app and its CRUD API (the single data layer).
- **`server/`** — Python Pipecat voice agent (optional overlay).
- **`docs/`** — design spec + research.

## Stack

Next.js · shadcn/ui · Postgres (Supabase) · Pipecat · NVIDIA Parakeet (STT) · NVIDIA Nemotron (LLM) · Gradium (TTS) — with an OpenAI + Gradium fallback path.

## Docs

- **Design spec:** [`docs/superpowers/specs/2026-05-30-prm-voice-v1-design.md`](docs/superpowers/specs/2026-05-30-prm-voice-v1-design.md)
- **Research:** [`docs/research/`](docs/research/)
- **Setup, keys & deploy:** `HANDOFF.md` (generated during build)
