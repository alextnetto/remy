"""PRM API client (Python side) — mirrors ``web/src/lib/api-contract.ts``.

An ``httpx``-backed async client the action worker uses for all data ops, so
there's no duplicate data logic in the voice server (spec §2): every mutation
and read goes through the Next.js API, the single CRUD layer.

Base URL comes from ``PRM_API_BASE_URL`` (the Next.js app origin, e.g.
``http://localhost:3000``). Endpoints and shapes are kept in lockstep with
the TypeScript contract — see that file for the canonical list. Responses are
returned as parsed JSON (``dict`` / ``list``); the worker treats them
structurally (keys match ``web/src/lib/types.ts``).

KEEP IN SYNC WITH ``web/src/lib/api-contract.ts``.
"""

from __future__ import annotations

import os
from typing import Any, Literal
from urllib.parse import quote

import httpx

ReminderFilter = Literal["today", "overdue", "upcoming", "all"]

JSON = dict[str, Any]


class PRMApiError(RuntimeError):
    """Raised when the PRM API returns a non-2xx response."""

    def __init__(self, status: int, method: str, path: str, body: Any) -> None:
        super().__init__(f"{method} {path} failed: {status}")
        self.status = status
        self.body = body


class PRMApiClient:
    """Async client for the PRM Next.js API.

    Use as an async context manager, or call :meth:`aclose` when done::

        async with PRMApiClient() as api:
            people = await api.list_people(query="sarah")
    """

    def __init__(self, base_url: str | None = None, *, timeout: float = 15.0) -> None:
        self._base_url = (base_url or os.getenv("PRM_API_BASE_URL") or "").rstrip("/")
        self._client = httpx.AsyncClient(timeout=timeout)

    async def __aenter__(self) -> PRMApiClient:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------------
    # Core request helper
    # ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        clean_params = (
            {k: v for k, v in params.items() if v not in (None, "")} if params else None
        )
        resp = await self._client.request(method, url, params=clean_params, json=json)
        if resp.status_code >= 400:
            try:
                body = resp.json()
            except Exception:
                body = resp.text
            raise PRMApiError(resp.status_code, method, path, body)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    @staticmethod
    def _enc(value: str) -> str:
        return quote(value, safe="")

    # ------------------------------------------------------------------
    # People
    # ------------------------------------------------------------------

    async def list_people(self, query: str | None = None) -> list[JSON]:
        """GET /api/people?query= -> PersonSummary[]"""
        return await self._request("GET", "/api/people", params={"query": query})

    async def create_person(
        self,
        *,
        name: str,
        relationship_to_me: str | None = None,
        base: str | None = None,
        story: str | None = None,
        interests: list[str] | None = None,
    ) -> JSON:
        """POST /api/people -> Person"""
        body: JSON = {"name": name}
        if relationship_to_me is not None:
            body["relationshipToMe"] = relationship_to_me
        if base is not None:
            body["base"] = base
        if story is not None:
            body["story"] = story
        if interests is not None:
            body["interests"] = interests
        return await self._request("POST", "/api/people", json=body)

    async def get_person(self, person_id: str) -> JSON:
        """GET /api/people/:id -> PersonDetail"""
        return await self._request("GET", f"/api/people/{self._enc(person_id)}")

    async def update_person(self, person_id: str, patch: JSON) -> JSON:
        """PATCH /api/people/:id -> Person"""
        return await self._request("PATCH", f"/api/people/{self._enc(person_id)}", json=patch)

    async def delete_person(self, person_id: str) -> JSON:
        """DELETE /api/people/:id -> { ok: true }"""
        return await self._request("DELETE", f"/api/people/{self._enc(person_id)}")

    # ------------------------------------------------------------------
    # Contacts
    # ------------------------------------------------------------------

    async def add_contact(
        self, person_id: str, *, kind: str, value: str, label: str | None = None
    ) -> JSON:
        """POST /api/people/:id/contacts -> ContactMethod"""
        body: JSON = {"kind": kind, "value": value}
        if label is not None:
            body["label"] = label
        return await self._request(
            "POST", f"/api/people/{self._enc(person_id)}/contacts", json=body
        )

    async def delete_contact(self, contact_id: str) -> JSON:
        """DELETE /api/contacts/:id -> { ok: true }"""
        return await self._request("DELETE", f"/api/contacts/{self._enc(contact_id)}")

    # ------------------------------------------------------------------
    # Important dates
    # ------------------------------------------------------------------

    async def add_important_date(
        self, person_id: str, *, label: str, date: str, recurring: bool | None = None
    ) -> JSON:
        """POST /api/people/:id/dates -> ImportantDate"""
        body: JSON = {"label": label, "date": date}
        if recurring is not None:
            body["recurring"] = recurring
        return await self._request("POST", f"/api/people/{self._enc(person_id)}/dates", json=body)

    async def delete_date(self, date_id: str) -> JSON:
        """DELETE /api/dates/:id -> { ok: true }"""
        return await self._request("DELETE", f"/api/dates/{self._enc(date_id)}")

    # ------------------------------------------------------------------
    # Notes
    # ------------------------------------------------------------------

    async def list_notes(self, person_id: str) -> list[JSON]:
        """GET /api/people/:id/notes -> Note[]"""
        return await self._request("GET", f"/api/people/{self._enc(person_id)}/notes")

    async def add_note(self, person_id: str, *, body_text: str, pinned: bool | None = None) -> JSON:
        """POST /api/people/:id/notes -> Note"""
        body: JSON = {"body": body_text}
        if pinned is not None:
            body["pinned"] = pinned
        return await self._request("POST", f"/api/people/{self._enc(person_id)}/notes", json=body)

    async def delete_note(self, note_id: str) -> JSON:
        """DELETE /api/notes/:id -> { ok: true }"""
        return await self._request("DELETE", f"/api/notes/{self._enc(note_id)}")

    # ------------------------------------------------------------------
    # Organizations
    # ------------------------------------------------------------------

    async def list_organizations(self, query: str | None = None) -> list[JSON]:
        """GET /api/organizations?query= -> Organization[]"""
        return await self._request("GET", "/api/organizations", params={"query": query})

    async def create_organization(
        self,
        *,
        name: str,
        type: str | None = None,
        description: str | None = None,
        base: str | None = None,
    ) -> JSON:
        """POST /api/organizations (find-or-create by name) -> Organization"""
        body: JSON = {"name": name}
        if type is not None:
            body["type"] = type
        if description is not None:
            body["description"] = description
        if base is not None:
            body["base"] = base
        return await self._request("POST", "/api/organizations", json=body)

    async def link_organization(
        self,
        person_id: str,
        *,
        org_name: str,
        relationship: str | None = None,
        role: str | None = None,
    ) -> JSON:
        """POST /api/people/:id/organizations (find-or-create org + link) -> PersonOrganization"""
        body: JSON = {"orgName": org_name}
        if relationship is not None:
            body["relationship"] = relationship
        if role is not None:
            body["role"] = role
        return await self._request(
            "POST", f"/api/people/{self._enc(person_id)}/organizations", json=body
        )

    async def unlink_organization(self, person_organization_id: str) -> JSON:
        """DELETE /api/person-organizations/:id -> { ok: true }"""
        return await self._request(
            "DELETE", f"/api/person-organizations/{self._enc(person_organization_id)}"
        )

    # ------------------------------------------------------------------
    # Moments
    # ------------------------------------------------------------------

    async def create_moment(
        self,
        *,
        description: str,
        person_ids: list[str],
        place: str | None = None,
        occurred_at: str | None = None,
        org_id: str | None = None,
        title: str | None = None,
    ) -> JSON:
        """POST /api/moments (multi-person) -> Moment"""
        body: JSON = {"description": description, "personIds": person_ids}
        if place is not None:
            body["place"] = place
        if occurred_at is not None:
            body["occurredAt"] = occurred_at
        if org_id is not None:
            body["orgId"] = org_id
        if title is not None:
            body["title"] = title
        return await self._request("POST", "/api/moments", json=body)

    async def list_moments_for_person(self, person_id: str) -> list[JSON]:
        """GET /api/people/:id/moments -> MomentWithPeople[]"""
        return await self._request("GET", f"/api/people/{self._enc(person_id)}/moments")

    # ------------------------------------------------------------------
    # Reminders
    # ------------------------------------------------------------------

    async def list_reminders(self, filter: ReminderFilter | None = None) -> list[JSON]:
        """GET /api/reminders?filter= -> ReminderWithPerson[]"""
        return await self._request("GET", "/api/reminders", params={"filter": filter})

    async def add_reminder(self, person_id: str, *, text: str, due_at: str) -> JSON:
        """POST /api/people/:id/reminders -> Reminder"""
        body: JSON = {"text": text, "dueAt": due_at}
        return await self._request(
            "POST", f"/api/people/{self._enc(person_id)}/reminders", json=body
        )

    async def complete_reminder(self, reminder_id: str) -> JSON:
        """POST /api/reminders/:id/complete -> Reminder"""
        return await self._request("POST", f"/api/reminders/{self._enc(reminder_id)}/complete")

    async def delete_reminder(self, reminder_id: str) -> JSON:
        """DELETE /api/reminders/:id -> { ok: true }"""
        return await self._request("DELETE", f"/api/reminders/{self._enc(reminder_id)}")

    # ------------------------------------------------------------------
    # Today / Admin
    # ------------------------------------------------------------------

    async def today(self) -> JSON:
        """GET /api/today -> { reminders, importantDates }"""
        return await self._request("GET", "/api/today")

    async def admin_reset(self) -> JSON:
        """POST /api/admin/reset -> { ok: true }"""
        return await self._request("POST", "/api/admin/reset")
