"""PRM Voice — RTVI protocol contract (Python side).

Defines the two message families exchanged over the RTVI/WebRTC data
channel between the web client and this voice server:

- ``UICommand``  server -> client : the action worker drives the
  standalone app (navigate, refresh, highlight, toast).
- ``UIEvent``    client -> server : the app reports its live screen and a
  connection hello so the worker can ground deixis ("open this one",
  "what's on screen") against what the user sees.

Wire format (matches the music-player reference):
- The server emits commands via ``UIWorker.send_command(name, payload)``;
  ``PipelineWorker`` forwards them to the client as an
  ``RTVIEvent.UICommand`` whose body is ``{command, payload}``. We use the
  command's ``type`` as the command *name* and the remaining fields as the
  *payload* (see ``to_wire_command``).
- The client sends events via ``client.sendUIEvent(type, payload)``; they
  arrive on the worker's ``@ui_event(type)`` handlers with ``.payload``.

KEEP THIS FILE IN SYNC WITH ``web/src/lib/rtvi-protocol.ts``. The two are a
single contract expressed in two languages; any change here must land
there too (and vice-versa).
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

# ===========================================================================
# UICommand — server -> client
# ===========================================================================

#: Toast severity.
ToastLevel = Literal["info", "success", "error"]

#: Literal union of every UICommand ``type``.
UICommandType = Literal["navigate", "refresh", "highlight", "toast"]


class NavigateCommand(TypedDict):
    """Navigate the app router to ``route`` (e.g. "/", "/people/<id>")."""

    type: Literal["navigate"]
    route: str


class RefreshCommand(TypedDict):
    """Tell the client to re-fetch the current screen (after a voice write)."""

    type: Literal["refresh"]


class HighlightCommand(TypedDict):
    """Briefly highlight / scroll to the element whose ``data-target`` is ``targetId``."""

    type: Literal["highlight"]
    targetId: str


class ToastCommand(TypedDict, total=False):
    """Show a transient toast. ``level`` defaults to "info"."""

    type: Literal["toast"]  # required
    message: str  # required
    level: ToastLevel  # optional


#: A command the server sends to drive the client UI. Discriminated on ``type``.
UICommand = NavigateCommand | RefreshCommand | HighlightCommand | ToastCommand


# ===========================================================================
# UIEvent — client -> server
# ===========================================================================

#: Literal union of every UIEvent ``type``.
UIEventType = Literal["screen", "hello"]


class VisibleItem(TypedDict, total=False):
    """One visible, addressable thing on the current screen.

    Used to resolve deictic references ("open the first one", "her") and to
    answer "what's on screen".

    - ``kind``  e.g. "person", "reminder", "note", "moment", "organization".
    - ``id``    the entity id when this element maps to a record (optional).
    - ``label`` the human-readable text shown (name, title, ...).
    """

    kind: str  # required
    label: str  # required
    id: str  # optional


class ScreenEvent(TypedDict):
    """The client's current screen, reported on every navigation / view load.

    The worker injects this as ``<ui_state>`` each turn so the actor LLM
    sees only the live screen + the current query.
    """

    type: Literal["screen"]
    route: str  # current route, e.g. "/people/<id>"
    title: str  # human-readable screen title, e.g. "Sarah Chen"
    visible: list[VisibleItem]  # addressable items on screen, in display order


class HelloEvent(TypedDict):
    """Sent once after the RTVI handshake so the worker can prime state."""

    type: Literal["hello"]


#: An event the client sends to the server. Discriminated on ``type``.
UIEvent = ScreenEvent | HelloEvent


# ===========================================================================
# Wire helpers
# ===========================================================================


def to_wire_command(command: UICommand) -> tuple[str, dict[str, Any]]:
    """Split a UICommand into the ``(name, payload)`` pair ``send_command`` takes.

    Mirrors ``toWireCommand`` in ``rtvi-protocol.ts``.
    """
    payload = {k: v for k, v in command.items() if k != "type"}
    return command["type"], payload


def to_wire_event(event: UIEvent) -> tuple[str, dict[str, Any]]:
    """Split a UIEvent into the ``(type, payload)`` pair ``sendUIEvent`` expects.

    Mirrors ``toWireEvent`` in ``rtvi-protocol.ts``.
    """
    payload = {k: v for k, v in event.items() if k != "type"}
    return event["type"], payload
