"""PRM action / UI worker — skeleton.

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
  connection ``hello``; these update :attr:`_screen_state` without an LLM turn.

Data ops go through the Next.js API via :class:`PRMApiClient` (no duplicate
data logic). UI driving uses :meth:`send_command` with the
``web/src/lib/rtvi-protocol.ts`` ``UICommand`` shapes (navigate / refresh /
highlight / toast). Every tool should end with ``respond_to_job(answer,
tts_speak=True)`` plus a ``refresh``/``navigate`` command so the standalone
app updates.

NOTE: tool BODIES are intentionally left as TODO stubs. Implementing the PRM
tools (capture / mutate / recall) is downstream work — see spec §6.
"""

from __future__ import annotations

import os

from loguru import logger
from pipecat.services.llm_service import FunctionCallParams
from pipecat.workers.llm import tool
from pipecat.workers.ui import UIWorker, ui_event

from llm import create_llm_service
from prm.api_client import PRMApiClient
from prm.protocol import ScreenEvent

UI_NAME = "ui"


# TODO(downstream): expand this with the full PRM tool catalogue + decision
# rules (spec §6). The actor must call exactly one tool per turn and never
# speak directly; it resolves position/deixis against the injected
# <ui_state>.
SYSTEM_PROMPT = """\
You are the PRM action layer. You never speak to the user directly; you call \
exactly one tool per turn. A <ui_state> block describes the screen the user \
is currently looking at — resolve "this", "the first one", "her", and \
position references against it. The web app is standalone; your tools mutate \
data through the PRM API and drive the UI with navigate/refresh/highlight/\
toast commands."""


class PRMActionWorker(UIWorker):
    """Owns PRM tools + drives the web app. Tool bodies are downstream work.

    The voice layer dispatches a ``respond`` job per utterance; this worker's
    LLM picks one tool, performs the data op via :attr:`api`, drives the
    client with :meth:`send_command`, and replies via ``respond_to_job``.
    Client ``screen`` events update :attr:`_screen_state` directly.
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
            prompt_guide=None,
        )
        # The PRM API client (the single CRUD layer). Lazily-closed on the
        # worker lifecycle; constructed here so tools can use ``self.api``.
        self.api = PRMApiClient(api_base_url or os.getenv("PRM_API_BASE_URL"))
        # The latest screen the client reported, rendered as text for the LLM
        # context. Kept current by ``on_screen``; surfaced via
        # ``render_ui_state``.
        self._screen_state: str = ""

    # ------------------------------------------------------------------
    # Client events (sent via ``sendUIEvent``; no LLM turn).
    # ------------------------------------------------------------------

    @ui_event("hello")
    async def on_hello(self, message) -> None:
        """The client finished the RTVI handshake. Nothing to prime yet.

        The client will follow with a ``screen`` event describing the
        initial view.
        """
        logger.debug(f"{self}: hello from client")

    @ui_event("screen")
    async def on_screen(self, message) -> None:
        """Record the client's current screen for ``<ui_state>`` injection.

        ``message.payload`` is a ``ScreenEvent`` minus its ``type`` discriminant
        (``{route, title, visible[]}``) — see ``rtvi-protocol.ts`` /
        ``prm/protocol.py``.
        """
        payload = message.payload or {}
        self._screen_state = self._describe_screen(payload)
        logger.debug(f"{self}: screen -> {payload.get('route')!r}")

    # ------------------------------------------------------------------
    # LLM context — screen injection
    # ------------------------------------------------------------------

    def render_ui_state(self) -> str:
        """Surface the client-reported screen to the LLM as ``<ui_state>``.

        The auto-inject hook calls this before each turn so the actor sees
        only the live screen + the current query (no conversation history).
        """
        if not self._screen_state:
            return ""
        return f"<ui_state>\n{self._screen_state}\n</ui_state>"

    @staticmethod
    def _describe_screen(payload: dict) -> str:
        """Render a client ``ScreenEvent`` payload as text for the LLM context.

        Lists each visible item with its index so the LLM can resolve "the
        first one" / "the third reminder" against display order.
        """
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
    # Tools — Navigation / UI (spec §6). BODIES ARE TODO STUBS.
    # ------------------------------------------------------------------

    @tool
    async def navigate_to_person(self, params: FunctionCallParams, query: str):
        """Find a person by name and open their detail screen.

        Args:
            query: The person's name (or a deictic reference resolved from
                the current screen).
        """
        # TODO(downstream): resolve via self.api.list_people(query), then
        # send_command navigate {route: f"/people/{id}"} + respond_to_job.
        raise NotImplementedError("navigate_to_person tool body is downstream work")

    @tool
    async def search_people(self, params: FunctionCallParams, query: str):
        """Search people and show results on Home.

        Args:
            query: Free-text filter (name / interest / org).
        """
        # TODO(downstream)
        raise NotImplementedError("search_people tool body is downstream work")

    @tool
    async def open_reminders(self, params: FunctionCallParams, filter: str = "all"):
        """Open the reminders screen, optionally filtered.

        Args:
            filter: One of ``today``, ``overdue``, ``upcoming``, ``all``.
        """
        # TODO(downstream)
        raise NotImplementedError("open_reminders tool body is downstream work")

    @tool
    async def go_back(self, params: FunctionCallParams):
        """Navigate back one screen."""
        # TODO(downstream)
        raise NotImplementedError("go_back tool body is downstream work")

    @tool
    async def go_home(self, params: FunctionCallParams):
        """Navigate to the Home / People screen."""
        # TODO(downstream)
        raise NotImplementedError("go_home tool body is downstream work")

    # ------------------------------------------------------------------
    # Tools — Capture / mutate (hero). BODIES ARE TODO STUBS.
    # ------------------------------------------------------------------

    @tool
    async def add_person(
        self,
        params: FunctionCallParams,
        name: str,
        relationship: str | None = None,
        base: str | None = None,
        interests: list[str] | None = None,
    ):
        """Create a new person.

        Args:
            name: The person's name.
            relationship: Freeform relationship to me ("friend", "mentor").
            base: Home base / location.
            interests: Interest tags.
        """
        # TODO(downstream)
        raise NotImplementedError("add_person tool body is downstream work")

    @tool
    async def update_person(
        self, params: FunctionCallParams, person: str, field: str, value: str
    ):
        """Update a person field (story, base, relationship, add interest).

        Args:
            person: Name / reference of the person to update.
            field: Which field to change.
            value: The new value (or interest to add).
        """
        # TODO(downstream)
        raise NotImplementedError("update_person tool body is downstream work")

    @tool
    async def add_contact(
        self,
        params: FunctionCallParams,
        person: str,
        kind: str,
        value: str,
        label: str | None = None,
    ):
        """Add a contact method to a person.

        Args:
            person: Name / reference of the person.
            kind: phone | email | website | linkedin | instagram | x | whatsapp | telegram | other.
            value: The number / url / handle.
            label: Optional label ("work", "personal").
        """
        # TODO(downstream)
        raise NotImplementedError("add_contact tool body is downstream work")

    @tool
    async def add_note(self, params: FunctionCallParams, person: str, body: str):
        """Add a timestamped note to a person.

        Args:
            person: Name / reference of the person.
            body: The note text.
        """
        # TODO(downstream)
        raise NotImplementedError("add_note tool body is downstream work")

    @tool
    async def add_important_date(
        self,
        params: FunctionCallParams,
        person: str,
        label: str,
        date: str,
        recurring: bool | None = None,
    ):
        """Add an important date (birthday, anniversary) to a person.

        Args:
            person: Name / reference of the person.
            label: "Birthday", "Work anniversary", ...
            date: ISO date.
            recurring: Whether it recurs yearly (birthdays default True).
        """
        # TODO(downstream)
        raise NotImplementedError("add_important_date tool body is downstream work")

    @tool
    async def link_organization(
        self,
        params: FunctionCallParams,
        person: str,
        org_name: str,
        relationship: str,
        role: str | None = None,
    ):
        """Find-or-create an organization and link it to a person.

        Args:
            person: Name / reference of the person.
            org_name: Organization name (created if missing).
            relationship: "works at", "studied at", "founder of", ...
            role: Optional role ("Engineer").
        """
        # TODO(downstream)
        raise NotImplementedError("link_organization tool body is downstream work")

    @tool
    async def add_moment(
        self,
        params: FunctionCallParams,
        description: str,
        people: list[str],
        place: str | None = None,
        occurred_at: str | None = None,
        org: str | None = None,
    ):
        """Record a shared, multi-person moment.

        Args:
            description: What happened.
            people: Names / references of everyone involved.
            place: Where it happened.
            occurred_at: ISO date it happened.
            org: Optional related organization name.
        """
        # TODO(downstream)
        raise NotImplementedError("add_moment tool body is downstream work")

    @tool
    async def set_reminder(self, params: FunctionCallParams, person: str, text: str, due_at: str):
        """Set a follow-up reminder for a person.

        Args:
            person: Name / reference of the person.
            text: What to do.
            due_at: ISO datetime it's due.
        """
        # TODO(downstream)
        raise NotImplementedError("set_reminder tool body is downstream work")

    @tool
    async def complete_reminder(
        self,
        params: FunctionCallParams,
        person: str | None = None,
        text: str | None = None,
        reminder_id: str | None = None,
    ):
        """Mark a reminder complete (by id, or matched by person + text).

        Args:
            person: Optional person whose reminder to complete.
            text: Optional reminder text to match.
            reminder_id: Optional explicit reminder id.
        """
        # TODO(downstream)
        raise NotImplementedError("complete_reminder tool body is downstream work")

    # ------------------------------------------------------------------
    # Tools — Recall (hero). BODIES ARE TODO STUBS.
    # ------------------------------------------------------------------

    @tool
    async def answer_about_person(self, params: FunctionCallParams, person: str, question: str):
        """Answer a question about a person from their full record.

        Args:
            person: Name / reference of the person.
            question: The user's question, verbatim.
        """
        # TODO(downstream): read self.api.get_person(id), answer, respond_to_job.
        raise NotImplementedError("answer_about_person tool body is downstream work")

    @tool
    async def answer_about_screen(self, params: FunctionCallParams, answer: str):
        """Answer a question using only what's on screen (the <ui_state>).

        Args:
            answer: The spoken answer, composed from the current screen.
        """
        # TODO(downstream): respond_to_job(answer, tts_speak=True).
        raise NotImplementedError("answer_about_screen tool body is downstream work")
