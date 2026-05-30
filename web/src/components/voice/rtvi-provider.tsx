"use client";

import type { ReactNode } from "react";

/**
 * STUB — replaced by the voice agent (task #4) with a real Pipecat
 * RTVIClientProvider that creates the client + SmallWebRTC transport and
 * exposes connect/disconnect + UICommand handling.
 *
 * Keep this export name and path stable: it is mounted in `app/layout.tsx`.
 * For now it is a passthrough so the app builds and runs without voice.
 */
export function RtviProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
