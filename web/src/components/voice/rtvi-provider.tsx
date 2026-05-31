"use client";

/**
 * PRM Voice — RTVI provider.
 *
 * Creates the Pipecat client + SmallWebRTC transport, wraps the app in
 * `PipecatClientProvider`, mounts `<PipecatClientAudio />` for bot playback,
 * and wires the two-way UI protocol:
 *
 *   - server → client `UICommand` (`navigate` / `refresh` / `highlight` /
 *     `toast`) is executed against the Next router, the {@link voiceBridge},
 *     and sonner.
 *   - client → server `UIEvent`s (`hello` + `screen`) are sent via
 *     `client.sendUIEvent(name, payload)` once the RTVI handshake completes
 *     and whenever a screen reports a change through the bridge.
 *
 * Connection is NOT automatic — the dock's Connect button drives
 * `connect()` from {@link useVoice}.
 *
 * NOTE on SDK names: `@pipecat-ai/client-js` ships the client as
 * `PipecatClient` (the artist-formerly-known-as `RTVIClient`) and
 * `@pipecat-ai/client-react` exposes `PipecatClientProvider` /
 * `PipecatClientAudio` / `usePipecatClient`. We keep our public export
 * named `RtviProvider` because `app/layout.tsx` imports it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PipecatClient,
  RTVIEvent,
  type TransportState,
  type UICommandData,
} from "@pipecat-ai/client-js";
import {
  PipecatClientAudio,
  PipecatClientProvider,
  useRTVIClientEvent,
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

import { voiceBridge } from "@/lib/voice-bridge";
import type {
  AddPersonCommand,
  AddPersonFields,
  HighlightCommand,
  NavigateCommand,
  SearchCommand,
  ToastCommand,
  UICommandType,
} from "@/lib/rtvi-protocol";

/**
 * The Pipecat server's bot-start endpoint. Mirrors the music-player
 * convention (`/start`); override via `NEXT_PUBLIC_BOT_START_URL`.
 */
const BOT_START_URL =
  process.env.NEXT_PUBLIC_BOT_START_URL ?? "http://localhost:7860/start";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * The client type as surfaced by `usePipecatClient()`. We use the hook's
 * return type (rather than importing `PipecatClient` directly) to sidestep
 * the pnpm dual-package nominal mismatch between `@pipecat-ai/client-js` and
 * the `client-js` copy `@pipecat-ai/client-react` was built against — at
 * runtime they are the same class.
 */
type VoiceClient = NonNullable<ReturnType<typeof usePipecatClient>>;

export interface VoiceContextValue {
  /** Live Pipecat client (or `null` before it is constructed). */
  client: VoiceClient | null;
  /** Raw transport state from the SDK. */
  state: TransportState;
  /** Convenience: transport is `connected` or `ready`. */
  isConnected: boolean;
  /** Convenience: a connect attempt is in flight (not yet ready). */
  isConnecting: boolean;
  /** Begin a session (POST `/start`, negotiate WebRTC, await bot-ready). */
  connect: () => Promise<void>;
  /** Tear the session down. */
  disconnect: () => Promise<void>;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

/** Access the voice connection state + controls. Must be used under {@link RtviProvider}. */
export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error("useVoice must be used within <RtviProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Voice context used during SSR and before the client mounts: the app renders
 * fully (and the dock shows its Connect button) without touching WebRTC. The
 * dock calls no Pipecat hooks until it is connected, so this is safe.
 */
const DISCONNECTED_FALLBACK: VoiceContextValue = {
  client: null,
  state: "disconnected",
  isConnected: false,
  isConnecting: false,
  connect: async () => {},
  disconnect: async () => {},
};

export function RtviProvider({ children }: { children: ReactNode }) {
  // The Pipecat client + SmallWebRTC transport touch browser-only APIs
  // (RTCPeerConnection) that throw during server render. Construct the client
  // lazily on the client after mount; until then render a passthrough context
  // so pages render on the server (Architecture B: the app works without voice).
  const [client, setClient] = useState<PipecatClient | null>(null);

  useEffect(() => {
    // Bare transport. The connection params are passed to client.connect()
    // (the "start-bot" flow), exactly like the working music-player. Passing
    // webrtcRequestParams to the constructor instead puts the SDK in
    // direct-offer mode, where it POSTs the offer to /start and PATCHes /start
    // for trickle ICE (405) instead of using /sessions/<id>/api/offer.
    const transport = new SmallWebRTCTransport();
    const c = new PipecatClient({
      transport,
      enableMic: true,
      enableCam: false,
    });
    setClient(c);
    return () => {
      void c.disconnect().catch(() => {});
    };
  }, []);

  if (!client) {
    return (
      <VoiceContext.Provider value={DISCONNECTED_FALLBACK}>
        {children}
      </VoiceContext.Provider>
    );
  }

  return (
    // Cast bridges the dual-package nominal mismatch (see VoiceClient above);
    // the instance is a real PipecatClient at runtime.
    <PipecatClientProvider client={client as unknown as VoiceClient}>
      <VoiceState>{children}</VoiceState>
      {/* Plays the bot's audio track. Renders nothing visible. */}
      <PipecatClientAudio />
    </PipecatClientProvider>
  );
}

/**
 * Inner component: lives inside `PipecatClientProvider` so it can read the
 * client + transport state via hooks, builds the {@link VoiceContextValue},
 * and mounts the protocol bridges.
 */
function VoiceState({ children }: { children: ReactNode }) {
  const client = usePipecatClient() ?? null;
  const state = usePipecatClientTransportState();

  const isConnected = state === "connected" || state === "ready";
  const isConnecting =
    state === "initializing" ||
    state === "initialized" ||
    state === "authenticating" ||
    state === "authenticated" ||
    state === "connecting";

  const connect = useCallback(async () => {
    if (!client) return;
    try {
      // Start-bot flow (POST /start -> sessionId -> /sessions/<id>/api/offer),
      // matching the working music-player's connect params.
      await client.connect({
        endpoint: BOT_START_URL,
        requestData: {
          createDailyRoom: false,
          enableDefaultIceServers: true,
          transport: "webrtc",
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to voice agent";
      toast.error("Voice connection failed", { description: message });
      throw err;
    }
  }, [client]);

  const disconnect = useCallback(async () => {
    if (!client) return;
    try {
      await client.disconnect();
    } catch {
      // Disconnect errors are non-actionable for the user; swallow.
    }
  }, [client]);

  const value = useMemo<VoiceContextValue>(
    () => ({ client, state, isConnected, isConnecting, connect, disconnect }),
    [client, state, isConnected, isConnecting, connect, disconnect],
  );

  return (
    <VoiceContext.Provider value={value}>
      <UICommandBridge />
      <ScreenEventBridge />
      <ConnectionStatusToasts />
      {children}
    </VoiceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// server → client : UICommand
// ---------------------------------------------------------------------------

/**
 * Executes the server's UI commands. The wire shape is
 * `{ command, payload }` (see rtvi-protocol `toWireCommand`): `command` is
 * the {@link UICommandType} discriminant and `payload` carries the rest.
 */
function UICommandBridge() {
  const router = useRouter();
  const pathname = usePathname();

  useRTVIClientEvent(
    RTVIEvent.UICommand,
    useCallback(
      (data: UICommandData) => {
        const command = data.command as UICommandType;
        const payload = (data.payload ?? {}) as Record<string, unknown>;

        switch (command) {
          case "navigate": {
            const route = (payload as Partial<NavigateCommand>).route;
            if (typeof route === "string" && route.length > 0) {
              // The server emits `navigate {route:"back"}` for go_back().
              if (route === "back") router.back();
              else router.push(route);
            }
            break;
          }
          case "refresh": {
            voiceBridge.emitRefresh();
            break;
          }
          case "highlight": {
            const targetId = (payload as Partial<HighlightCommand>).targetId;
            if (typeof targetId === "string" && targetId.length > 0) {
              voiceBridge.emitHighlight(targetId);
            }
            break;
          }
          case "toast": {
            const { message, level } = payload as Partial<ToastCommand>;
            const text = typeof message === "string" ? message : "";
            if (!text) break;
            if (level === "success") toast.success(text);
            else if (level === "error") toast.error(text);
            else toast(text);
            break;
          }
          case "search": {
            const q = (payload as Partial<SearchCommand>).query;
            const query = typeof q === "string" ? q : "";
            // On Home: fill the search box directly. Elsewhere: stash it and
            // navigate Home, where `useVoiceSearch` applies it on mount.
            if (pathname === "/") {
              voiceBridge.emitSearch(query);
            } else {
              voiceBridge.setPendingSearch(query);
              router.push("/");
            }
            break;
          }
          case "addPerson": {
            // The capture lives on the /people/new page. If we're not there
            // yet, stash any fields and navigate — the page applies them on
            // mount. Once there, the page handles fill/submit/cancel directly.
            const { fields, submit, cancel } = payload as Partial<AddPersonCommand>;
            const hasFields = !!fields && typeof fields === "object";
            if (hasFields && pathname !== "/people/new") {
              voiceBridge.setPendingAddPerson(fields as AddPersonFields);
              router.push("/people/new");
            } else {
              voiceBridge.emitAddPerson({
                fields: hasFields ? (fields as AddPersonFields) : undefined,
                submit: submit === true,
                cancel: cancel === true,
              });
            }
            break;
          }
          default: {
            // Unknown command — ignore so a newer server can't break us.
            break;
          }
        }
      },
      [router, pathname],
    ),
  );

  return null;
}

// ---------------------------------------------------------------------------
// client → server : UIEvent (hello + screen)
// ---------------------------------------------------------------------------

/**
 * Forwards screen reports to the server as `screen` UIEvents, and on
 * (re)connect sends `hello` + the current screen so the worker can prime
 * `<ui_state>`.
 *
 * We emit on `BotReady` (not the local `connect()` resolution): emitting
 * earlier can race the server worker's `@ui_event` registration and drop
 * the frame — this mirrors the music-player reference, which sends its
 * `hello` from the same event.
 */
function ScreenEventBridge() {
  const client = usePipecatClient();
  const state = usePipecatClientTransportState();
  // Keep refs so the bridge subscription (registered once) always sees the
  // latest client + readiness without re-subscribing on every render.
  const clientRef = useRef<VoiceClient | undefined>(client);
  clientRef.current = client;
  const readyRef = useRef(false);
  readyRef.current = state === "ready" || state === "connected";

  // Forward every screen change — but ONLY once the transport is ready.
  // Screens report on mount (before the user connects); sending then makes the
  // SDK throw "sendUIEvent when transport not in ready state".
  useEffect(() => {
    const unsubscribe = voiceBridge.onScreen((report) => {
      if (!readyRef.current) return;
      try {
        clientRef.current?.sendUIEvent("screen", report);
      } catch {
        // Transport not ready for a beat — drop; the next report resyncs.
      }
    });
    return unsubscribe;
  }, []);

  // On handshake complete: greet the worker and seed the current screen.
  useRTVIClientEvent(
    RTVIEvent.BotReady,
    useCallback(() => {
      const c = clientRef.current;
      if (!c) return;
      c.sendUIEvent("hello", {});
      const current = voiceBridge.getCurrentScreen();
      if (current) {
        c.sendUIEvent("screen", current);
      }
    }, []),
  );

  return null;
}

// ---------------------------------------------------------------------------
// Connection status surfacing
// ---------------------------------------------------------------------------

/** Surfaces connect/disconnect/error transitions via sonner. */
function ConnectionStatusToasts() {
  useRTVIClientEvent(
    RTVIEvent.BotReady,
    useCallback(() => {
      toast.success("Voice agent connected");
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.Error,
    useCallback((message: unknown) => {
      const text =
        message &&
        typeof message === "object" &&
        "data" in message &&
        typeof (message as { data?: unknown }).data === "string"
          ? (message as { data: string }).data
          : "Voice agent error";
      toast.error(text);
    }, []),
  );

  return null;
}
