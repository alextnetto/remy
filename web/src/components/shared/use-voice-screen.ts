"use client";

/**
 * Hooks that wire a screen into the voice ⇄ UI bridge.
 *
 *  - `useReportScreen(report)`   — publishes the current screen so the voice
 *    worker can ground deixis ("open the first one") and answer "what's on
 *    screen". Re-reports whenever the report's identity changes.
 *  - `useVoiceRefresh(refetch)`  — re-runs the screen's fetch when the agent
 *    mutates data.
 *  - `useHighlightTarget()`      — installs the default highlight consumer:
 *    scrolls `[data-highlight-id="<id>"]` into view and briefly rings it.
 *
 * All three are no-ops when no voice client is connected (the bridge channels
 * simply have no other subscribers), so screens stay fully standalone.
 */
import { useEffect } from "react";

import { voiceBridge, type ScreenReport } from "@/lib/voice-bridge";

/** Publish the current screen to the voice bridge whenever it changes. */
export function useReportScreen(report: ScreenReport | null): void {
  // Serialize so we only re-emit on a real content change, not new array refs.
  const key = report
    ? `${report.route}|${report.title}|${report.visible
        .map((v) => `${v.kind}:${v.id ?? ""}:${v.label}`)
        .join("|")}`
    : null;

  useEffect(() => {
    if (!report) return;
    voiceBridge.reportScreen(report);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Subscribe the screen's refetch to agent-driven refresh commands. */
export function useVoiceRefresh(refetch: () => void): void {
  useEffect(() => voiceBridge.onRefresh(refetch), [refetch]);
}

/**
 * Drive Home's search box from the voice agent. Applies any pending search
 * stashed before a navigate-to-Home (on mount), then subscribes to live
 * `search` commands. Pass the stable React state setter for `setQuery`.
 */
export function useVoiceSearch(setQuery: (q: string) => void): void {
  useEffect(() => {
    const p = voiceBridge.consumePendingSearch();
    if (p !== null) setQuery(p);
    return voiceBridge.onSearch((q) => setQuery(q));
  }, [setQuery]);
}

/**
 * Default highlight consumer. Mount once near the root of a screen. When the
 * agent emits a highlight for an id, scroll the matching element into view and
 * pulse a ring on it.
 */
export function useHighlightTarget(): void {
  useEffect(() => {
    return voiceBridge.onHighlight((id) => {
      if (typeof document === "undefined") return;
      const selector = `[data-highlight-id="${CSS.escape(id)}"]`;

      const apply = (el: HTMLElement) => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Restart the animation even if the class is already present.
        el.classList.remove("voice-highlight");
        requestAnimationFrame(() => {
          el.classList.add("voice-highlight");
          window.setTimeout(() => el.classList.remove("voice-highlight"), 1300);
        });
      };

      // The target may not be in the DOM yet: an agent edit emits `refresh`
      // then `highlight`, so the refetched element (or a navigated-to screen)
      // mounts a beat later. Try now, then poll briefly until it appears.
      const tryNow = () => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          apply(el);
          return true;
        }
        return false;
      };
      if (tryNow()) return;
      const start = performance.now();
      const iv = window.setInterval(() => {
        if (tryNow() || performance.now() - start > 2500) window.clearInterval(iv);
      }, 120);
    });
  }, []);
}
