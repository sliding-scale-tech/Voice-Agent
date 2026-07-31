"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, PhoneOff, Phone, Loader2, AlertCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LiveWaveform } from "@/components/ui/live-waveform";

export default function CallPage() {
  return (
    <ConversationProvider>
      <CallScreen />
    </ConversationProvider>
  );
}

function CallScreen() {
  const agent = useQuery(api.agents.current);
  const mintToken = useAction(api.agents.mintToken);
  const startConversation = useMutation(api.conversations.start);
  const appendMessage = useMutation(api.conversations.appendMessage);
  const endConversation = useMutation(api.conversations.end);
  const attachElevenLabsId = useMutation(api.conversations.attachElevenLabsId);

  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversationIdRef = useRef<Id<"conversations"> | null>(null);
  conversationIdRef.current = conversationId;

  const transcript = useQuery(
    api.conversations.transcript,
    conversationId ? { conversationId } : "skip",
  );

  const { startSession, endSession, status, isSpeaking, isMuted, setMuted, getId } = useConversation({
    onMessage: ({ message, source }) => {
      const id = conversationIdRef.current;
      if (!id || !message) return;
      void appendMessage({
        conversationId: id,
        role: source === "user" ? "user" : "agent",
        text: message,
        isFinal: true,
      });
    },
    onError: (message: unknown) => {
      setError(typeof message === "string" ? message : "The conversation hit an error.");
    },
  });

  const connected = status === "connected";
  const connecting = status === "connecting";

  useEffect(() => {
    if (!connected) return;
    const id = conversationIdRef.current;
    const elevenLabsId = getId();
    if (id && elevenLabsId) {
      void attachElevenLabsId({ conversationId: id, elevenLabsConversationId: elevenLabsId });
    }
  }, [connected, getId, attachElevenLabsId]);

  const handleStart = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const { token } = await mintToken();
      if (!agent) throw new Error("Agent is still being created — try again in a moment.");

      const id = await startConversation({ agentId: agent._id });
      setConversationId(id);
      conversationIdRef.current = id;

      startSession({ conversationToken: token, connectionType: "webrtc" });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start the call. Check the microphone permission.",
      );
      setConversationId(null);
    } finally {
      setStarting(false);
    }
  }, [agent, mintToken, startConversation, startSession]);

  const handleStop = useCallback(() => {
    endSession();
    const id = conversationIdRef.current;
    if (id) void endConversation({ conversationId: id, status: "ended" });
    setConversationId(null);
  }, [endSession, endConversation]);

  useEffect(() => {
    const onUnload = () => {
      const id = conversationIdRef.current;
      if (id) void endConversation({ conversationId: id, status: "ended" });
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [endConversation]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {agent?.name ?? "Support agent"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start a browser call to test the voice agent — no phone required.
        </p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 overflow-hidden rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Call control card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col items-center gap-6 border-b border-border px-6 py-10 sm:py-14">
          {/* Central call button with pulse ring while connected */}
          <div className="relative flex h-24 w-24 items-center justify-center">
            {connected && (
              <>
                <span className="absolute inset-0 rounded-full bg-primary/40 animate-pulse-ring" />
                <span
                  className="absolute inset-0 rounded-full bg-primary/40 animate-pulse-ring"
                  style={{ animationDelay: "0.6s" }}
                />
              </>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={connected ? handleStop : handleStart}
              disabled={starting || agent === undefined}
              className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                connected
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
              aria-label={connected ? "End call" : "Start call"}
            >
              {starting || connecting ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : connected ? (
                <PhoneOff className="h-7 w-7" />
              ) : (
                <Phone className="h-7 w-7" />
              )}
            </motion.button>
          </div>

          <div className="text-center">
            <p className="text-sm font-medium">
              {connected
                ? isSpeaking
                  ? "Agent is speaking…"
                  : "Listening…"
                : connecting
                  ? "Connecting…"
                  : starting
                    ? "Starting…"
                    : "Ready to call"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {connected ? "Tap to end the call" : "Tap to start a call in your browser"}
            </p>
          </div>

          {connected && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setMuted(!isMuted)}
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {isMuted ? "Unmute" : "Mute"}
            </motion.button>
          )}
        </div>

        <div className="flex h-20 items-center justify-center border-b border-border bg-muted/30 px-6">
          <LiveWaveform
            active={connected}
            processing={connecting}
            className="h-12 w-full text-primary"
          />
        </div>

        <div className="max-h-[26rem] space-y-3 overflow-y-auto p-6">
          {transcript && transcript.length > 0 ? (
            transcript.map((line, i) => (
              <motion.div
                key={line._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 5) * 0.03, duration: 0.2 }}
                className={line.role === "user" ? "text-right" : "text-left"}
              >
                <span
                  className={`inline-block max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    line.role === "user"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-accent text-accent-foreground"
                  } ${line.isFinal ? "" : "opacity-50"}`}
                >
                  {line.text}
                </span>
              </motion.div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              The transcript will appear here as you speak.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
