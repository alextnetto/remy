"use client";

/**
 * PRM Voice — docked voice widget.
 *
 * A polished, mobile-first control fixed to the bottom of the screen,
 * centered within the app's `max-w-md` frame and floating above page
 * content. It is purely an overlay: the app is fully usable without it.
 *
 * States:
 *   - disconnected → a single Connect pill.
 *   - connecting   → the pill shows a spinner / "Connecting…".
 *   - connected    → mic mute toggle, a compact speaking indicator
 *                    (bot + user), a live transcript line (latest user +
 *                    bot text), and a Disconnect control. Expandable.
 *
 * Connection state + controls come from `useVoice()` (rtvi-provider).
 * Speaking + transcript come from the RTVI events via {@link useVoiceActivity}.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Sparkles,
} from "lucide-react";
import {
  RTVIEvent,
  type BotLLMTextData,
  type TranscriptData,
} from "@pipecat-ai/client-js";
import {
  useRTVIClientEvent,
  usePipecatClientMicControl,
} from "@pipecat-ai/client-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVoice } from "./rtvi-provider";

// ---------------------------------------------------------------------------
// Voice activity (speaking + transcript) hook
// ---------------------------------------------------------------------------

interface VoiceActivity {
  botSpeaking: boolean;
  userSpeaking: boolean;
  /** Latest user utterance (final preferred, falls back to partial). */
  userText: string;
  /** Latest bot utterance, accumulated per spoken response. */
  botText: string;
}

function useVoiceActivity(): VoiceActivity {
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [userText, setUserText] = useState("");
  const [botText, setBotText] = useState("");

  // Speaking indicators.
  useRTVIClientEvent(
    RTVIEvent.BotStartedSpeaking,
    useCallback(() => {
      setBotSpeaking(true);
      // A new bot turn starts: clear the previous response so the line
      // reflects what's being said now.
      setBotText("");
    }, []),
  );
  useRTVIClientEvent(
    RTVIEvent.BotStoppedSpeaking,
    useCallback(() => setBotSpeaking(false), []),
  );
  useRTVIClientEvent(
    RTVIEvent.UserStartedSpeaking,
    useCallback(() => setUserSpeaking(true), []),
  );
  useRTVIClientEvent(
    RTVIEvent.UserStoppedSpeaking,
    useCallback(() => setUserSpeaking(false), []),
  );

  // User transcript — partials + finals. Show the latest text either way.
  useRTVIClientEvent(
    RTVIEvent.UserTranscript,
    useCallback((data: TranscriptData) => {
      if (data?.text) setUserText(data.text);
    }, []),
  );

  // Bot transcript — sentence-aggregated final text for the response.
  useRTVIClientEvent(
    RTVIEvent.BotTranscript,
    useCallback((data: BotLLMTextData) => {
      if (data?.text) {
        setBotText((prev) => (prev ? `${prev} ${data.text}` : data.text));
      }
    }, []),
  );

  return { botSpeaking, userSpeaking, userText, botText };
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

/** Animated bars that pulse while `active`; otherwise sit flat. */
function AudioBars({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 items-center gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "w-0.5 rounded-full bg-current transition-all duration-200",
            active ? "animate-pulse" : "opacity-40",
          )}
          style={{
            height: active ? `${[10, 16, 7, 13][i]}px` : "4px",
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mic toggle (connected only — uses the mic-control hook)
// ---------------------------------------------------------------------------

function MicToggle() {
  const { enableMic, isMicEnabled } = usePipecatClientMicControl();
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={isMicEnabled ? "secondary" : "destructive"}
      aria-label={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
      aria-pressed={!isMicEnabled}
      onClick={() => enableMic(!isMicEnabled)}
    >
      {isMicEnabled ? <Mic /> : <MicOff />}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Dock
// ---------------------------------------------------------------------------

export function VoiceDock() {
  const { isConnected, isConnecting, connect, disconnect } = useVoice();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConnect = useCallback(async () => {
    setBusy(true);
    try {
      await connect();
      setExpanded(true);
    } catch {
      // Error already surfaced via sonner in the provider.
    } finally {
      setBusy(false);
    }
  }, [connect]);

  const handleDisconnect = useCallback(async () => {
    setBusy(true);
    try {
      await disconnect();
      setExpanded(false);
    } finally {
      setBusy(false);
    }
  }, [disconnect]);

  const connecting = isConnecting || (busy && !isConnected);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto w-full max-w-md px-4">
        {isConnected ? (
          <ConnectedDock
            expanded={expanded}
            onToggleExpanded={() => setExpanded((v) => !v)}
            onDisconnect={handleDisconnect}
            disconnecting={busy}
          />
        ) : (
          <div className="flex justify-center">
            <Button
              type="button"
              size="lg"
              className="h-11 gap-2 rounded-full px-6 shadow-lg shadow-primary/20"
              disabled={connecting}
              onClick={handleConnect}
            >
              {connecting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Talk to your assistant
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectedDock({
  expanded,
  onToggleExpanded,
  onDisconnect,
  disconnecting,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const { botSpeaking, userSpeaking, userText, botText } = useVoiceActivity();

  const status = botSpeaking
    ? "Speaking"
    : userSpeaking
      ? "Listening"
      : "Connected";

  // The freshest line: prefer the bot while/just-after it speaks, else the
  // user's latest utterance.
  const latest =
    botSpeaking || botText
      ? { who: "Assistant", text: botText }
      : { who: "You", text: userText };

  return (
    <div className="rounded-2xl bg-card/95 p-2.5 shadow-xl ring-1 ring-foreground/10 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        {/* Status badge + audio activity */}
        <Badge
          variant={botSpeaking ? "default" : "secondary"}
          className="h-7 gap-1.5 rounded-full pl-2 pr-2.5 text-[0.7rem]"
        >
          {botSpeaking ? (
            <Sparkles className="size-3" />
          ) : (
            <Radio className="size-3" />
          )}
          <span className="tabular-nums">{status}</span>
        </Badge>

        <span
          className={cn(
            "flex items-center text-primary transition-opacity",
            botSpeaking || userSpeaking ? "opacity-100" : "opacity-50",
          )}
        >
          <AudioBars active={botSpeaking || userSpeaking} />
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <MicToggle />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={expanded ? "Collapse transcript" : "Expand transcript"}
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? <ChevronDown /> : <ChevronUp />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="destructive"
            aria-label="Disconnect voice agent"
            disabled={disconnecting}
            onClick={onDisconnect}
          >
            {disconnecting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <PhoneOff />
            )}
          </Button>
        </div>
      </div>

      {/* Live transcript line. Collapsed = single latest line; expanded =
          both the user and assistant lines. */}
      <TranscriptArea
        expanded={expanded}
        userText={userText}
        botText={botText}
        latest={latest}
      />
    </div>
  );
}

function TranscriptArea({
  expanded,
  userText,
  botText,
  latest,
}: {
  expanded: boolean;
  userText: string;
  botText: string;
  latest: { who: string; text: string };
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest text in view as it streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [userText, botText, expanded]);

  if (expanded) {
    return (
      <div
        ref={scrollRef}
        className="mt-2 max-h-28 space-y-2 overflow-y-auto rounded-lg bg-muted/50 px-3 py-2 text-xs"
      >
        <TranscriptLine who="You" text={userText} muted={!userText} />
        <TranscriptLine
          who="Assistant"
          text={botText}
          muted={!botText}
          accent
        />
        {!userText && !botText && (
          <p className="text-muted-foreground">Say something to get started…</p>
        )}
      </div>
    );
  }

  if (!latest.text) return null;

  return (
    <div className="mt-2 truncate rounded-lg bg-muted/50 px-3 py-1.5 text-xs">
      <span
        className={cn(
          "font-medium",
          latest.who === "Assistant" ? "text-primary" : "text-foreground",
        )}
      >
        {latest.who}:
      </span>{" "}
      <span className="text-muted-foreground">{latest.text}</span>
    </div>
  );
}

function TranscriptLine({
  who,
  text,
  muted,
  accent,
}: {
  who: string;
  text: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <p className={cn(muted && "opacity-50")}>
      <span
        className={cn(
          "font-medium",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {who}:
      </span>{" "}
      <span className="text-muted-foreground">{text || "—"}</span>
    </p>
  );
}
