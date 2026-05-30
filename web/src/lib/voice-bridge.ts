"use client";

/**
 * Voice ⇄ UI bridge.
 *
 * Decouples the screens (task #3) from the voice client (task #4) so they can
 * be built independently with no direct import between them.
 *
 *  Screens (UI):
 *    - call `voiceBridge.reportScreen({ route, title, visible })` on mount and
 *      after data loads, so the voice worker knows what's on screen
 *      (powers `answer_about_screen` + deixis like "open the first one").
 *    - subscribe `voiceBridge.onRefresh(refetch)` to re-fetch when the agent
 *      mutates data.
 *    - subscribe `voiceBridge.onHighlight(id => …)` (or rely on the default:
 *      scroll to `[data-highlight-id="<id>"]`).
 *
 *  Voice client (RtviProvider / VoiceDock):
 *    - translates RTVI `UICommand`s into `emitRefresh()` / `emitHighlight()`
 *      (and handles `navigate` directly via the Next router).
 *    - subscribes `onScreen` (or reads `getCurrentScreen()`) to forward the
 *      `screen` UIEvent to the worker, and on (re)connect.
 *
 * Shapes mirror the `screen` UIEvent in `rtvi-protocol.ts`.
 */

export interface VisibleItem {
  /** Coarse type, e.g. "person", "reminder", "note", "tab". */
  kind: string;
  /** Stable id when the item is addressable (e.g. a person id). */
  id?: string;
  /** Human label the user might say ("Sarah Chen", "Call mom"). */
  label: string;
}

export interface ScreenReport {
  route: string;
  title: string;
  visible: VisibleItem[];
}

type Listener<T> = (arg: T) => void;

function channel<T>() {
  const subs = new Set<Listener<T>>();
  return {
    on(fn: Listener<T>): () => void {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    emit(arg: T) {
      for (const fn of subs) fn(arg);
    },
  };
}

const refresh = channel<void>();
const highlight = channel<string>();
const search = channel<string>();
const screen = channel<ScreenReport>();
let current: ScreenReport | null = null;
// One-shot search applied after Home mounts (set before a navigate-to-Home).
let pendingSearch: string | null = null;

export const voiceBridge = {
  /** Subscribe to "refetch your data" (agent mutated something). */
  onRefresh: (fn: Listener<void>) => refresh.on(fn),
  /** Voice client: call after a data-mutating UICommand. */
  emitRefresh: () => refresh.emit(),

  /** Subscribe to highlight requests (default consumer scrolls to the element). */
  onHighlight: (fn: Listener<string>) => highlight.on(fn),
  /** Voice client: call on a `highlight` UICommand. */
  emitHighlight: (targetId: string) => highlight.emit(targetId),

  /** Subscribe to search requests (Home sets its search box to the query). */
  onSearch: (fn: Listener<string>) => search.on(fn),
  /** Voice client: call on a `search` UICommand when already on Home. */
  emitSearch: (query: string) => search.emit(query),
  /** Voice client: stash a search to apply once Home mounts (before navigating). */
  setPendingSearch: (query: string) => {
    pendingSearch = query;
  },
  /** Home: read & clear the pending search (returns null if none). */
  consumePendingSearch: (): string | null => {
    const q = pendingSearch;
    pendingSearch = null;
    return q;
  },

  /** Screens: publish the current screen for voice grounding. */
  reportScreen: (s: ScreenReport) => {
    current = s;
    screen.emit(s);
  },
  /** Voice client: react to screen changes (forward as a `screen` UIEvent). */
  onScreen: (fn: Listener<ScreenReport>) => screen.on(fn),
  /** Voice client: read the latest reported screen (e.g. on connect). */
  getCurrentScreen: (): ScreenReport | null => current,
};
