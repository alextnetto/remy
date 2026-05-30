/**
 * PRM Voice — RTVI protocol contract (TypeScript side).
 *
 * Defines the two message families exchanged over the RTVI/WebRTC data
 * channel between the web client and the Python voice server:
 *
 *   - {@link UICommand}  server → client : the action worker drives the
 *     standalone app (navigate, refresh, highlight, toast).
 *   - {@link UIEvent}    client → server : the app reports its live screen
 *     and a connection hello so the worker can ground deixis
 *     ("open this one", "what's on screen") against what the user sees.
 *
 * Wire format (matches the music-player reference):
 *   - The client receives commands via `RTVIEvent.UICommand`, whose
 *     payload is `{ command: string, payload: object }`. We use the
 *     command's `type` as the RTVI command name and the rest of the
 *     fields as the payload.
 *   - The client sends events via `client.sendUIEvent(type, payload)`,
 *     where `type` is the event's discriminant and `payload` is the rest.
 *
 * KEEP THIS FILE IN SYNC WITH `server/prm/protocol.py`. The two are a
 * single contract expressed in two languages; any change here must land
 * there too (and vice-versa).
 */

// ===========================================================================
// UICommand — server → client
// ===========================================================================

/** Toast severity. */
export type ToastLevel = "info" | "success" | "error";

/** Navigate the app's router to `route` (e.g. "/", "/people/<id>", "/reminders"). */
export interface NavigateCommand {
  type: "navigate";
  route: string;
}

/** Tell the client to re-fetch the current screen's data (after a voice write). */
export interface RefreshCommand {
  type: "refresh";
}

/** Briefly highlight / scroll to the element whose `data-target` is `targetId`. */
export interface HighlightCommand {
  type: "highlight";
  targetId: string;
}

/** Show a transient toast. `level` defaults to "info". */
export interface ToastCommand {
  type: "toast";
  message: string;
  level?: ToastLevel;
}

/** Set the Home search box to `query` and filter the people list (navigates Home first). */
export interface SearchCommand {
  type: "search";
  query: string;
}

/**
 * The editable fields of the Add Person dialog. All optional — the agent fills
 * whatever the user has said so far; successive `addPerson` commands MERGE
 * (only the keys present overwrite).
 */
export interface AddPersonFields {
  name?: string;
  relationship?: string;
  base?: string;
  story?: string;
}

/**
 * Drive the Add Person dialog so the agent *manifests* a new-person capture in
 * the UI instead of writing to the API blind:
 *   - `fields` (any subset) opens the dialog and merges those values in.
 *   - `submit: true` saves the current draft (the user confirmed).
 *   - `cancel: true` closes the dialog without saving.
 */
export interface AddPersonCommand {
  type: "addPerson";
  fields?: AddPersonFields;
  submit?: boolean;
  cancel?: boolean;
}

/**
 * A command the server sends to drive the client UI. Discriminated on
 * `type`. The action worker emits these after data ops / navigation.
 */
export type UICommand =
  | NavigateCommand
  | RefreshCommand
  | HighlightCommand
  | ToastCommand
  | SearchCommand
  | AddPersonCommand;

/** Literal union of every {@link UICommand} `type`. */
export type UICommandType = UICommand["type"];

// ===========================================================================
// UIEvent — client → server
// ===========================================================================

/**
 * One visible, addressable thing on the current screen. The worker uses
 * these to resolve deictic references ("open the first one", "her") and to
 * answer "what's on screen".
 *
 * - `kind`  e.g. "person", "reminder", "note", "moment", "organization".
 * - `id`    the entity id when this element maps to a record (optional).
 * - `label` the human-readable text shown (name, title, …).
 */
export interface VisibleItem {
  kind: string;
  id?: string;
  label: string;
}

/**
 * A modal/overlay open on top of the current screen, reported so the worker
 * can resolve follow-ups against it. The open form is the cross-turn memory of
 * a guided capture (the worker itself is stateless per turn).
 */
export interface DialogState {
  kind: "addPerson";
  /** The current draft — each value present, "" when the field is empty. */
  fields: AddPersonFields;
}

/**
 * The client reports its current screen on every navigation / view load
 * (tap- or voice-initiated). The worker injects this as `<ui_state>` each
 * turn so the actor LLM sees only the live screen + the current query.
 */
export interface ScreenEvent {
  type: "screen";
  /** Current route, e.g. "/people/<id>". */
  route: string;
  /** Human-readable screen title, e.g. "Sarah Chen". */
  title: string;
  /** The addressable items currently on screen, in display order. */
  visible: VisibleItem[];
  /** An open dialog/overlay (e.g. the Add Person capture), when present. */
  dialog?: DialogState;
}

/** Sent once after the RTVI handshake completes so the worker can prime state. */
export interface HelloEvent {
  type: "hello";
}

/**
 * An event the client sends to the server. Discriminated on `type`.
 * Sent via `client.sendUIEvent(type, payload)`.
 */
export type UIEvent = ScreenEvent | HelloEvent;

/** Literal union of every {@link UIEvent} `type`. */
export type UIEventType = UIEvent["type"];

// ===========================================================================
// Wire helpers
// ===========================================================================

/**
 * Split a {@link UICommand} into the `(name, payload)` pair the RTVI
 * `UICommand` event carries. Mirrors how the client rebuilds the tagged
 * command from `{ command, payload }`.
 */
export function toWireCommand(command: UICommand): {
  command: UICommandType;
  payload: Record<string, unknown>;
} {
  const { type, ...payload } = command;
  return { command: type, payload };
}

/**
 * Split a {@link UIEvent} into the `(type, payload)` pair expected by
 * `client.sendUIEvent(type, payload)`.
 */
export function toWireEvent(event: UIEvent): {
  type: UIEventType;
  payload: Record<string, unknown>;
} {
  const { type, ...payload } = event;
  return { type, payload };
}
