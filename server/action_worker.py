"""PRM action / UI worker.

The action worker owns the PRM tools and drives the standalone web app. It is
a ``UIWorker`` (own LLM, ``keep_history=False``) adapted from the
music-player's ``MusicUIWorker``, but for **Approach B** (spec §2): the web
app owns its own routing + data, so screen state flows **client -> worker**.
Each turn the worker injects the client-reported screen as ``<ui_state>``
(via :meth:`render_ui_state`) so the actor LLM resolves deixis ("open this
one", "her") and "what's on screen" against the live screen.

Two entry points (same shape as the reference):
- the inherited ``respond`` job: the main voice worker delegates a
  natural-language request; this worker's LLM picks exactly one tool.
- ``@ui_event`` handlers: the client reports its screen (``screen``) and a
  connection ``hello``; these update :attr:`_screen` without an LLM turn.

Data ops go through the Next.js API via :class:`PRMApiClient` (no duplicate
data logic). UI driving uses :meth:`send_command` with the
``web/src/lib/rtvi-protocol.ts`` ``UICommand`` shapes (navigate / refresh /
highlight / toast). Every tool ends with ``respond_to_job(answer,
tts_speak=True)`` (so the UI worker speaks; the voice LLM stays silent) plus a
``refresh``/``navigate`` command so the standalone app updates.
"""

from __future__ import annotations

import os
from typing import Any

from loguru import logger
from pipecat.services.llm_service import FunctionCallParams
from pipecat.workers.llm import tool
from pipecat.workers.ui import UIWorker, ui_event

from llm import create_llm_service
from prm.api_client import PRMApiClient, PRMApiError

UI_NAME = "ui"


SYSTEM_PROMPT = """\
You are the action layer for a personal relationship manager (PRM). You never \
speak to the user directly and you never reply with plain text — you call \
exactly ONE tool per turn. The tool you call performs the data op and/or \
drives the UI and produces the spoken reply itself.

## Screen grounding
A <ui_state> block describes the screen the user is currently looking at: its \
route, title, and the visible items in display order (each with a kind, a \
label, and sometimes an id). Resolve "this", "that", "the first one", "the \
second reminder", "her", "him", and "their" against that block. "The first \
one" means the first visible item; "this person" / "her" / "him" means the \
person the screen is about (on a person screen) or the first visible person. \
Pass the person's NAME or the deictic phrase to the tool's person_query \
argument; the tool resolves it to a record.

## Choosing a tool
- Opening / showing a person -> navigate_to_person.
- Filtering or searching the people list -> search_people.
- Showing reminders / the Today view -> open_reminders.
- "go home" / "go back" -> go_home / go_back.
- Creating or changing data (a person, a note, a contact, a date, an org \
link, a moment, a reminder) -> the matching add_*/update_*/set_*/complete_* \
tool. Notes are the hero capture path: "add a note to X ..." -> add_note.
- A question ABOUT a person ("what do I know about Sarah", "when is her \
birthday", "where does Tom work") -> answer_about_person. This is the hero \
recall path; it reads the person's full record and speaks a concise answer.
- A question about what is currently displayed ("what's on screen", "who's \
the first person", "how many reminders are due") -> answer_about_screen, \
composing the answer from the <ui_state> only.

## Rules
1. Exactly one tool per turn. Never answer with plain text.
2. Keep spoken replies short, plain, and natural — one sentence. No markdown.
3. Dates/times: pass what the user said (e.g. "March 3", "next Friday at \
5pm"); the API/tools store it. Prefer ISO when the user is explicit.
4. If you cannot identify the person, still call the most relevant tool with \
your best person_query; the tool reports back if it can't find them."""


class PRMActionWorker(UIWorker):
    """Owns PRM tools + drives the web app.

    The voice layer dispatches a ``respond`` job per utterance; this worker's
    LLM picks one tool, performs the data op via :attr:`api`, drives the
    client with :meth:`send_command`, and replies via ``respond_to_job``.
    Client ``screen`` events update :attr:`_screen` directly (no LLM turn).
    """

    def __init__(self, api_base_url: str | None = None) -> None:
        llm = create_llm_service(system_prompt=SYSTEM_PROMPT)
        # Approach B: the client owns the screen and reports it, so we don't
        # keep conversation history and we override ``render_ui_state`` to
        # surface the latest client-reported screen. ``inject_events=False``:
        # client ``screen`` events update state directly (no LLM turn).
        super().__init__(
            UI_NAME,
            llm=llm,
            inject_events=False,
            keep_history=False,
            prompt_guide=None,
        )
        # The PRM API client (the single CRUD layer). Constructed here so tools
        # can use ``self.api``; closed on worker stop.
        self.api = PRMApiClient(api_base_url or os.getenv("PRM_API_BASE_URL"))
        # The latest screen the client reported, kept as the raw payload so we
        # can both render it for the LLM (``render_ui_state``) and resolve
        # positional deixis ("the first one") to ids (``_visible``).
        self._screen: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def stop(self) -> None:
        """Close the API client when the worker stops."""
        try:
            await self.api.aclose()
        except Exception:  # best-effort; never block shutdown
            logger.debug(f"{self}: error closing api client", exc_info=True)
        await super().stop()

    # ------------------------------------------------------------------
    # Client events (sent via ``sendUIEvent``; no LLM turn).
    # ------------------------------------------------------------------

    @ui_event("hello")
    async def on_hello(self, message) -> None:
        """The client finished the RTVI handshake.

        Greet the user via the voice pipeline. The client follows with a
        ``screen`` event describing the initial view.
        """
        logger.debug(f"{self}: hello from client")
        await self.send_command(
            "toast",
            {"message": "Connected. Ask me about anyone, or add a note.", "level": "info"},
        )

    @ui_event("screen")
    async def on_screen(self, message) -> None:
        """Record the client's current screen for ``<ui_state>`` injection.

        ``message.payload`` is a ``ScreenEvent`` minus its ``type`` discriminant
        (``{route, title, visible[]}``) — see ``rtvi-protocol.ts`` /
        ``prm/protocol.py``.
        """
        self._screen = message.payload or {}
        logger.debug(f"{self}: screen -> {self._screen.get('route')!r}")

    # ------------------------------------------------------------------
    # LLM context — screen injection
    # ------------------------------------------------------------------

    def render_ui_state(self) -> str:
        """Surface the client-reported screen to the LLM as ``<ui_state>``.

        The auto-inject hook calls this before each turn so the actor sees
        only the live screen + the current query (no conversation history).
        """
        described = self._describe_screen(self._screen)
        if not described:
            return ""
        return f"<ui_state>\n{described}\n</ui_state>"

    @staticmethod
    def _describe_screen(payload: dict) -> str:
        """Render a client ``ScreenEvent`` payload as text for the LLM context.

        Lists each visible item with its index so the LLM can resolve "the
        first one" / "the third reminder" against display order.
        """
        if not payload:
            return ""
        route = payload.get("route", "")
        title = payload.get("title", "")
        visible = payload.get("visible") or []
        lines = [f"Screen: {title} (route {route})."]
        if visible:
            lines.append("Visible items (in order):")
            for i, item in enumerate(visible, start=1):
                kind = item.get("kind", "item")
                label = item.get("label", "")
                ident = item.get("id")
                suffix = f" [id={ident}]" if ident else ""
                lines.append(f"  {i}. {kind}: {label}{suffix}")
        else:
            lines.append("No addressable items on screen.")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Person resolution (query -> id), with screen-aware deixis.
    # ------------------------------------------------------------------

    @property
    def _visible(self) -> list[dict]:
        return self._screen.get("visible") or []

    @property
    def _route(self) -> str:
        return self._screen.get("route") or ""

    def _person_from_screen(self, query: str | None) -> dict | None:
        """Resolve a deictic person reference against the current screen.

        Handles "this"/"her"/"him"/"them" (the person the screen is about, or
        the first visible person) and ordinals ("the first one", "the second
        person"). Returns ``{"id", "name"}`` or None.
        """
        people = [v for v in self._visible if v.get("kind") == "person" and v.get("id")]
        q = (query or "").strip().lower()

        # Ordinal / positional references.
        ordinals = {
            "first": 0, "1st": 0, "one": 0, "top": 0,
            "second": 1, "2nd": 1, "two": 1,
            "third": 2, "3rd": 2, "three": 2,
            "fourth": 3, "4th": 3, "fifth": 4, "5th": 4,
            "last": -1, "bottom": -1,
        }
        for word, idx in ordinals.items():
            if word in q:
                if people and -len(people) <= idx < len(people):
                    return self._as_person_ref(people[idx])
                break

        # Deictic / pronoun references with no name -> the person in focus.
        deictic = {"this", "that", "her", "him", "them", "they", "this one", "the person", "this person"}
        if not q or q in deictic or q.startswith(("this ", "that ", "the ")):
            # On a person detail screen the first visible person is the subject.
            if self._route.startswith("/people/") and people:
                return self._as_person_ref(people[0])
            if people and (not q or q in deictic):
                return self._as_person_ref(people[0])
        return None

    @staticmethod
    def _as_person_ref(item: dict) -> dict:
        return {"id": item.get("id"), "name": item.get("label") or ""}

    async def _resolve_person(self, query: str | None) -> dict | None:
        """Resolve a free-text person reference to a record ``{"id","name"}``.

        Order: screen deixis first (so "the first one"/"her" beat a name
        search), then an API people search with a fuzzy pick.
        """
        from_screen = self._person_from_screen(query)
        if from_screen and from_screen.get("id"):
            return from_screen

        name = (query or "").strip()
        if not name:
            return None
        try:
            people = await self.api.list_people(name)
        except PRMApiError as exc:
            logger.warning(f"{self}: list_people({name!r}) failed: {exc}")
            return None
        return self._pick_person(name, people or [])

    @staticmethod
    def _pick_person(query: str, people: list[dict]) -> dict | None:
        """Best fuzzy match of ``query`` against a people list (by name)."""
        if not people:
            return None
        q = query.strip().lower()
        # Exact, then prefix, then substring, then first result.
        for p in people:
            if (p.get("name") or "").strip().lower() == q:
                return p
        for p in people:
            if (p.get("name") or "").strip().lower().startswith(q):
                return p
        for p in people:
            if q in (p.get("name") or "").strip().lower():
                return p
        # First token (first name) match.
        first = q.split()[0] if q.split() else q
        for p in people:
            name_l = (p.get("name") or "").strip().lower()
            if name_l.split() and name_l.split()[0] == first:
                return p
        return people[0]

    async def _resolve_all_people(self, queries: list[str]) -> tuple[list[dict], list[str]]:
        """Resolve a list of person references; return (found, unresolved names)."""
        found: list[dict] = []
        missing: list[str] = []
        seen: set[str] = set()
        for q in queries:
            person = await self._resolve_person(q)
            if person and person.get("id") and person["id"] not in seen:
                found.append(person)
                seen.add(person["id"])
            elif not person:
                missing.append(q)
        return found, missing

    # ------------------------------------------------------------------
    # Tool helpers
    # ------------------------------------------------------------------

    async def _person_not_found(self, params: FunctionCallParams, query: str | None) -> None:
        await self.respond_to_job(
            f"I couldn't find {query or 'that person'}.", tts_speak=True
        )
        await params.result_callback(None)

    async def _fail(self, params: FunctionCallParams, message: str) -> None:
        await self.respond_to_job(message, tts_speak=True)
        await params.result_callback(None)

    async def _navigate(self, route: str) -> None:
        await self.send_command("navigate", {"route": route})

    async def _refresh(self) -> None:
        await self.send_command("refresh", {})

    # ==================================================================
    # Tools — Navigation / UI (spec §6)
    # ==================================================================

    @tool
    async def navigate_to_person(self, params: FunctionCallParams, query: str):
        """Find a person by name and open their detail screen.

        Args:
            query: The person's name (or a deictic reference like "the first
                one" / "her" resolved from the current screen).
        """
        logger.info(f"{self}: navigate_to_person({query!r})")
        person = await self._resolve_person(query)
        if not person or not person.get("id"):
            await self._person_not_found(params, query)
            return
        await self._navigate(f"/people/{person['id']}")
        await self._refresh()
        await self.respond_to_job(f"Here's {person['name']}.", tts_speak=True)
        await params.result_callback(None)

    @tool
    async def search_people(self, params: FunctionCallParams, query: str):
        """Search/filter people and show the results on Home.

        Args:
            query: Free-text filter (name / interest / org). Empty shows all.
        """
        logger.info(f"{self}: search_people({query!r})")
        try:
            people = await self.api.list_people(query or None)
        except PRMApiError as exc:
            await self._fail(params, "I couldn't search right now.")
            logger.warning(f"{self}: search_people failed: {exc}")
            return
        # Drive Home; the standalone app applies the filter on refresh.
        await self._navigate("/")
        await self._refresh()
        count = len(people or [])
        if not query:
            spoken = f"Showing all {count} people." if count else "No people yet."
        elif count == 0:
            spoken = f"I didn't find anyone matching {query}."
        elif count == 1:
            spoken = f"Found one match: {people[0].get('name')}."
        else:
            names = ", ".join(p.get("name", "") for p in people[:3])
            spoken = f"Found {count} people, including {names}."
        await self.respond_to_job(spoken, tts_speak=True)
        await params.result_callback(None)

    @tool
    async def open_reminders(self, params: FunctionCallParams, filter: str = "all"):
        """Open the reminders / Today screen, optionally filtered.

        Args:
            filter: One of ``today``, ``overdue``, ``upcoming``, ``all``.
        """
        logger.info(f"{self}: open_reminders(filter={filter!r})")
        normalized = (filter or "all").strip().lower()
        if normalized not in ("today", "overdue", "upcoming", "all"):
            normalized = "all"
        try:
            reminders = await self.api.list_reminders(normalized)
        except PRMApiError as exc:
            reminders = None
            logger.warning(f"{self}: list_reminders failed: {exc}")
        route = "/reminders" if normalized == "all" else f"/reminders?filter={normalized}"
        await self._navigate(route)
        await self._refresh()
        count = len(reminders) if reminders is not None else None
        if count is None:
            spoken = "Here are your reminders."
        elif count == 0:
            spoken = "You're all caught up — no reminders here."
        else:
            label = "reminder" if count == 1 else "reminders"
            scope = "" if normalized == "all" else f" {normalized}"
            spoken = f"You have {count}{scope} {label}."
        await self.respond_to_job(spoken, tts_speak=True)
        await params.result_callback(None)

    @tool
    async def go_home(self, params: FunctionCallParams):
        """Navigate to the Home / People screen."""
        logger.info(f"{self}: go_home")
        await self._navigate("/")
        await self._refresh()
        await self.respond_to_job("Here's home.", tts_speak=True)
        await params.result_callback(None)

    @tool
    async def go_back(self, params: FunctionCallParams):
        """Navigate back one screen.

        The standalone app owns the history stack, so we ask Home as a safe
        default while signalling intent; if the client implements a back
        command it can map ``navigate`` with an empty route to history.back().
        """
        logger.info(f"{self}: go_back")
        # The web client treats route "back" as router.back(); fall back to "/".
        await self.send_command("navigate", {"route": "back"})
        await self.respond_to_job("Going back.", tts_speak=True)
        await params.result_callback(None)

    # ==================================================================
    # Tools — Capture / mutate (hero)
    # ==================================================================

    @tool
    async def add_person(
        self,
        params: FunctionCallParams,
        name: str,
        relationship: str | None = None,
        base: str | None = None,
    ):
        """Create a new person and open their detail screen.

        Args:
            name: The person's name.
            relationship: Freeform relationship to me ("friend", "mentor").
            base: Home base / location.
        """
        logger.info(f"{self}: add_person({name!r}, rel={relationship!r}, base={base!r})")
        if not (name or "").strip():
            await self._fail(params, "What's their name?")
            return
        try:
            person = await self.api.create_person(
                name=name.strip(), relationship_to_me=relationship, base=base
            )
        except PRMApiError as exc:
            await self._fail(params, f"I couldn't add {name}.")
            logger.warning(f"{self}: create_person failed: {exc}")
            return
        await self._navigate(f"/people/{person['id']}")
        await self._refresh()
        rel = f", your {relationship}" if relationship else ""
        await self.respond_to_job(f"Added {person['name']}{rel}.", tts_speak=True)
        await params.result_callback(None)

    @tool
    async def update_person(
        self, params: FunctionCallParams, person_query: str, field: str, value: str
    ):
        """Update a person field (story, base, relationship, or add an interest).

        Args:
            person_query: Name / reference of the person to update.
            field: One of ``story``, ``base``, ``relationship``, ``name``,
                ``interest`` (adds an interest tag).
            value: The new value (or the interest to add).
        """
        logger.info(f"{self}: update_person({person_query!r}, {field!r}={value!r})")
        person = await self._resolve_person(person_query)
        if not person or not person.get("id"):
            await self._person_not_found(params, person_query)
            return
        f = (field or "").strip().lower()
        patch: dict[str, Any] = {}
        if f in ("relationship", "relationship_to_me", "relationshiptome"):
            patch["relationshipToMe"] = value
        elif f == "base" or f in ("location", "home"):
            patch["base"] = value
        elif f in ("story", "bio", "narrative"):
            patch["story"] = value
        elif f == "name":
            patch["name"] = value
        elif f in ("interest", "interests"):
            # Append to the existing interest list (read current detail first).
            try:
                detail = await self.api.get_person(person["id"])
            except PRMApiError:
                detail = {}
            interests = list(detail.get("interests") or [])
            if value and value not in interests:
                interests.append(value)
            patch["interests"] = interests
        else:
            await self._fail(params, f"I'm not sure how to update {field}.")
            return
        try:
            await self.api.update_person(person["id"], patch)
        except PRMApiError as exc:
            await self._fail(params, f"I couldn't update {person['name']}.")
            logger.warning(f"{self}: update_person failed: {exc}")
            return
        await self._navigate(f"/people/{person['id']}")
        await self._refresh()
        await self.respond_to_job(f"Updated {person['name']}.", tts_speak=True)
        await params.result_callback(None)

    @tool
    async def add_contact(
        self,
        params: FunctionCallParams,
        person_query: str,
        kind: str,
        value: str,
        label: str | None = None,
    ):
        """Add a contact method to a person.

        Args:
            person_query: Name / reference of the person.
            kind: phone | email | website | linkedin | instagram | x | whatsapp | telegram | other.
            value: The number / url / handle.
            label: Optional label ("work", "personal").
        """
        logger.info(f"{self}: add_contact({person_query!r}, {kind!r}, {value!r})")
        person = await self._resolve_person(person_query)
        if not person or not person.get("id"):
            await self._person_not_found(params, person_query)
            return
        k = (kind or "other").strip().lower()
        valid = {"phone", "email", "website", "linkedin", "instagram", "x", "whatsapp", "telegram", "other"}
        if k not in valid:
            k = "other"
        try:
            await self.api.add_contact(person["id"], kind=k, value=value, label=label)
        except PRMApiError as exc:
            await self._fail(params, f"I couldn't add that contact for {person['name']}.")
            logger.warning(f"{self}: add_contact failed: {exc}")
            return
        await self._navigate(f"/people/{person['id']}")
        await self._refresh()
        await self.respond_to_job(f"Saved {person['name']}'s {k}.", tts_speak=True)
        await params.result_callback(None)

    @tool
    async def add_note(self, params: FunctionCallParams, person_query: str, body: str):
        """Add a timestamped note to a person. (Hero capture path.)

        Args:
            person_query: Name / reference of the person.
            body: The note text.
        """
        logger.info(f"{self}: add_note({person_query!r}, {body[:40]!r})")
        person = await self._resolve_person(person_query)
        if not person or not person.get("id"):
            await self._person_not_found(params, person_query)
            return
        if not (body or "").strip():
            await self._fail(params, "What should the note say?")
            return
        try:
            await self.api.add_note(person["id"], body_text=body.strip())
        except PRMApiError as exc:
            await self._fail(params, f"I couldn't save the note for {person['name']}.")
            logger.warning(f"{self}: add_note failed: {exc}")
            return
        await self._navigate(f"/people/{person['id']}")
        await self._refresh()
        await self.respond_to_job(f"Noted for {person['name']}.", tts_speak=True)
        await params.result_callback(None)

    @tool
    async def add_important_date(
        self,
        params: FunctionCallParams,
        person_query: str,
        label: str,
        date: str,
        recurring: bool | None = None,
    ):
        """Add an important date (birthday, anniversary) to a person.

        Args:
            person_query: Name / reference of the person.
            label: "Birthday", "Work anniversary", ...
            date: ISO date, e.g. "2026-03-03".
            recurring: Whether it recurs yearly (birthdays default True).
        """
        logger.info(f"{self}: add_important_date({person_query!r}, {label!r}, {date!r})")
        person = await self._resolve_person(person_query)
        if not person or not person.get("id"):
            await self._person_not_found(params, person_query)
            return
        # Birthdays/anniversaries recur by default unless told otherwise.
        if recurring is None:
            recurring = "birth" in (label or "").lower() or "anniversar" in (label or "").lower()
        try:
            await self.api.add_important_date(
                person["id"], label=label, date=date, recurring=recurring
            )
        except PRMApiError as exc:
            await self._fail(params, f"I couldn't save that date for {person['name']}.")
            logger.warning(f"{self}: add_important_date failed: {exc}")
            return
        await self._navigate(f"/people/{person['id']}")
        await self._refresh()
        await self.respond_to_job(
            f"Saved {person['name']}'s {label.lower()}.", tts_speak=True
        )
        await params.result_callback(None)

    @tool
    async def link_organization(
        self,
        params: FunctionCallParams,
        person_query: str,
        org_name: str,
        relationship: str | None = None,
        role: str | None = None,
    ):
        """Find-or-create an organization and link it to a person.

        Args:
            person_query: Name / reference of the person.
            org_name: Organization name (created if missing).
            relationship: "works at", "studied at", "founder of", ...
            role: Optional role ("Engineer").
        """
        logger.info(f"{self}: link_organization({person_query!r}, {org_name!r})")
        person = await self._resolve_person(person_query)
        if not person or not person.get("id"):
            await self._person_not_found(params, person_query)
            return
        try:
            await self.api.link_organization(
                person["id"], org_name=org_name, relationship=relationship, role=role
            )
        except PRMApiError as exc:
            await self._fail(params, f"I couldn't link {org_name} to {person['name']}.")
            logger.warning(f"{self}: link_organization failed: {exc}")
            return
        await self._navigate(f"/people/{person['id']}")
        await self._refresh()
        rel = relationship or "linked to"
        await self.respond_to_job(
            f"{person['name']} is now {rel} {org_name}.", tts_speak=True
        )
        await params.result_callback(None)

    @tool
    async def add_moment(
        self,
        params: FunctionCallParams,
        description: str,
        people_names: list[str],
        place: str | None = None,
        occurred_at: str | None = None,
        org: str | None = None,
    ):
        """Record a shared, multi-person moment.

        Args:
            description: What happened.
            people_names: Names / references of everyone involved.
            place: Where it happened.
            occurred_at: ISO date it happened.
            org: Optional related organization name (found-or-created).
        """
        logger.info(f"{self}: add_moment({description[:40]!r}, people={people_names!r})")
        found, missing = await self._resolve_all_people(people_names or [])
        if not found:
            await self._fail(
                params, "I couldn't tell who was there. Who was part of this moment?"
            )
            return
        org_id: str | None = None
        if org:
            try:
                org_rec = await self.api.create_organization(name=org)
                org_id = org_rec.get("id")
            except PRMApiError as exc:
                logger.warning(f"{self}: create_organization failed: {exc}")
        try:
            await self.api.create_moment(
                description=description,
                person_ids=[p["id"] for p in found],
                place=place,
                occurred_at=occurred_at,
                org_id=org_id,
            )
        except PRMApiError as exc:
            await self._fail(params, "I couldn't save that moment.")
            logger.warning(f"{self}: create_moment failed: {exc}")
            return
        # Navigate to the first participant so the moment is visible on refresh.
        await self._navigate(f"/people/{found[0]['id']}")
        await self._refresh()
        names = ", ".join(p["name"] for p in found)
        note = f" (I couldn't find {', '.join(missing)})" if missing else ""
        await self.respond_to_job(f"Saved a moment with {names}.{note}", tts_speak=True)
        await params.result_callback(None)

    @tool
    async def set_reminder(
        self, params: FunctionCallParams, person_query: str, text: str, due_at: str
    ):
        """Set a follow-up reminder for a person.

        Args:
            person_query: Name / reference of the person.
            text: What to do.
            due_at: ISO datetime it's due, e.g. "2026-06-05T17:00:00Z".
        """
        logger.info(f"{self}: set_reminder({person_query!r}, {text!r}, {due_at!r})")
        person = await self._resolve_person(person_query)
        if not person or not person.get("id"):
            await self._person_not_found(params, person_query)
            return
        try:
            await self.api.add_reminder(person["id"], text=text, due_at=due_at)
        except PRMApiError as exc:
            await self._fail(params, f"I couldn't set that reminder for {person['name']}.")
            logger.warning(f"{self}: add_reminder failed: {exc}")
            return
        await self._navigate(f"/people/{person['id']}")
        await self._refresh()
        await self.respond_to_job(
            f"Reminder set for {person['name']}.", tts_speak=True
        )
        await params.result_callback(None)

    @tool
    async def complete_reminder(
        self,
        params: FunctionCallParams,
        person_query: str | None = None,
        text: str | None = None,
    ):
        """Mark a reminder complete (matched by person and/or text, or by the
        reminder currently visible on screen).

        Args:
            person_query: Optional person whose reminder to complete.
            text: Optional reminder text to match.
        """
        logger.info(f"{self}: complete_reminder(person={person_query!r}, text={text!r})")
        reminder = await self._find_reminder(person_query, text)
        if not reminder or not reminder.get("id"):
            await self._fail(params, "I couldn't find that reminder.")
            return
        try:
            await self.api.complete_reminder(reminder["id"])
        except PRMApiError as exc:
            await self._fail(params, "I couldn't complete that reminder.")
            logger.warning(f"{self}: complete_reminder failed: {exc}")
            return
        await self._refresh()
        rtext = reminder.get("text") or "that"
        await self.respond_to_job(f"Done — marked '{rtext}' complete.", tts_speak=True)
        await params.result_callback(None)

    async def _find_reminder(
        self, person_query: str | None, text: str | None
    ) -> dict | None:
        """Locate a reminder to complete via screen deixis or the API list."""
        # 1. Screen deixis: a reminder visible on the current screen.
        visible_reminders = [
            v for v in self._visible if v.get("kind") == "reminder" and v.get("id")
        ]
        t = (text or "").strip().lower()
        if visible_reminders:
            if not t:
                # No text given — if exactly one reminder is shown, take it.
                if len(visible_reminders) == 1:
                    v = visible_reminders[0]
                    return {"id": v.get("id"), "text": v.get("label")}
            else:
                for v in visible_reminders:
                    if t in (v.get("label") or "").lower():
                        return {"id": v.get("id"), "text": v.get("label")}

        # 2. API: filter the reminder list by person and/or text.
        person = await self._resolve_person(person_query) if person_query else None
        try:
            reminders = await self.api.list_reminders("all")
        except PRMApiError:
            return None
        candidates = reminders or []
        if person and person.get("id"):
            candidates = [r for r in candidates if r.get("personId") == person["id"]]
        if t:
            text_matches = [r for r in candidates if t in (r.get("text") or "").lower()]
            if text_matches:
                candidates = text_matches
        # Prefer not-yet-done reminders.
        pending = [r for r in candidates if not r.get("done")]
        pool = pending or candidates
        return pool[0] if pool else None

    # ==================================================================
    # Tools — Recall (hero)
    # ==================================================================

    @tool
    async def answer_about_person(
        self, params: FunctionCallParams, person_query: str, question: str
    ):
        """Answer a question about a person from their full record. (Hero recall.)

        Reads the person's story, notes, important dates, organizations,
        moments, and contacts; speaks a concise answer and navigates to them.

        Args:
            person_query: Name / reference of the person.
            question: The user's question, verbatim.
        """
        logger.info(f"{self}: answer_about_person({person_query!r}, {question!r})")
        person = await self._resolve_person(person_query)
        if not person or not person.get("id"):
            await self._person_not_found(params, person_query)
            return
        try:
            detail = await self.api.get_person(person["id"])
        except PRMApiError as exc:
            await self._fail(params, f"I couldn't pull up {person['name']}.")
            logger.warning(f"{self}: get_person failed: {exc}")
            return
        # Navigate so the user sees who we're talking about.
        await self._navigate(f"/people/{detail.get('id', person['id'])}")
        await self._refresh()
        answer = self._answer_from_detail(detail, question)
        await self.respond_to_job(answer, tts_speak=True)
        await params.result_callback(None)

    @staticmethod
    def _answer_from_detail(detail: dict, question: str) -> str:
        """Compose a concise spoken answer about a person from their record.

        Heuristic, keyword-routed over the structured record so the actor
        LLM doesn't need a second inference. Falls back to a broad summary.
        """
        name = detail.get("name") or "They"
        q = (question or "").lower()

        def fmt_list(items: list[str], limit: int = 3) -> str:
            items = [i for i in items if i]
            if not items:
                return ""
            if len(items) <= limit:
                return ", ".join(items)
            return ", ".join(items[:limit]) + f", and {len(items) - limit} more"

        # Birthday / dates.
        dates = detail.get("importantDates") or []
        if any(w in q for w in ("birthday", "born", "date", "anniversar")):
            if dates:
                picks = [f"{d.get('label')} on {d.get('date')}" for d in dates]
                return f"{name}'s dates: {fmt_list(picks)}."
            return f"I don't have any important dates for {name}."

        # Contacts.
        contacts = detail.get("contacts") or []
        if any(w in q for w in ("phone", "email", "contact", "number", "reach", "call")):
            if contacts:
                picks = [f"{c.get('kind')} {c.get('value')}" for c in contacts]
                return f"{name}'s contacts: {fmt_list(picks)}."
            return f"I don't have contact details for {name}."

        # Organizations / work.
        orgs = detail.get("organizations") or []
        if any(w in q for w in ("work", "company", "org", "school", "study", "job", "where")):
            if orgs:
                picks = [
                    f"{(o.get('relationship') or 'linked to')} {((o.get('org') or {}).get('name'))}"
                    for o in orgs
                ]
                return f"{name}: {fmt_list(picks)}."
            return f"I don't have any organizations for {name}."

        # Interests.
        interests = detail.get("interests") or []
        if any(w in q for w in ("interest", "like", "hobby", "into", "enjoy")):
            if interests:
                return f"{name} is into {fmt_list(interests)}."
            return f"I don't have interests listed for {name}."

        # Notes / recent.
        notes = detail.get("notes") or []
        if any(w in q for w in ("note", "recent", "last", "latest", "happen", "new")):
            if notes:
                latest = notes[0].get("body") or ""
                return f"Latest on {name}: {latest}"
            return f"I don't have any notes on {name} yet."

        # Reminders / follow-ups.
        reminders = detail.get("reminders") or []
        if any(w in q for w in ("remind", "follow up", "follow-up", "todo", "to do")):
            pending = [r for r in reminders if not r.get("done")]
            if pending:
                picks = [r.get("text") for r in pending]
                return f"For {name}: {fmt_list(picks)}."
            return f"No open reminders for {name}."

        # General "what do I know about X" — broad summary.
        parts: list[str] = []
        rel = detail.get("relationshipToMe")
        base = detail.get("base")
        if rel:
            parts.append(f"your {rel}")
        if base:
            parts.append(f"based in {base}")
        story = detail.get("story")
        if story:
            parts.append(story if len(story) < 160 else story[:157] + "...")
        if interests:
            parts.append(f"into {fmt_list(interests)}")
        if notes:
            parts.append(f"latest note: {notes[0].get('body')}")
        if not parts:
            return f"I don't have much on {name} yet."
        return f"{name} — " + "; ".join(parts) + "."

    @tool
    async def answer_about_screen(self, params: FunctionCallParams, answer: str):
        """Answer a question using only what's on screen (the <ui_state>).

        Compose the spoken answer from the current screen's items; it's read
        aloud verbatim. Read-only — no data op, no navigation.

        Args:
            answer: The spoken answer, composed from the current screen.
        """
        logger.info(f"{self}: answer_about_screen({answer[:60]!r})")
        await self.respond_to_job(answer or "There's nothing on screen.", tts_speak=True)
        await params.result_callback(None)
