"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/toast";
import { RUBRIC } from "@/convex/leadScoring";
import { Bot, Users, Gauge } from "lucide-react";

export default function SettingsPage() {
  const toast = useToast();
  const agent = useQuery(api.agents.current);
  const saveAgent = useAction(api.agents.saveAgent);
  const listVoices = useAction(api.agents.voices);

  const orgSettings = useQuery(api.orgSettings.current);
  const saveOrgSettings = useMutation(api.orgSettings.save);
  const [staffPhoneNumber, setStaffPhoneNumber] = useState("");
  const [staffHydrated, setStaffHydrated] = useState(false);
  const [staffStatus, setStaffStatus] = useState<"idle" | "saving">("idle");

  useEffect(() => {
    if (!orgSettings || staffHydrated) return;
    setStaffPhoneNumber(orgSettings.staffPhoneNumber);
    setStaffHydrated(true);
  }, [orgSettings, staffHydrated]);

  const handleSaveStaff = async () => {
    setStaffStatus("saving");
    await saveOrgSettings({ staffPhoneNumber });
    setStaffStatus("idle");
    toast("Staff phone number saved");
  };

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [voices, setVoices] = useState<Array<{ voiceId: string; name: string }>>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!agent || hydrated) return;
    setName(agent.name);
    setPrompt(agent.prompt);
    setFirstMessage(agent.firstMessage);
    setVoiceId(agent.voiceId);
    setHydrated(true);
  }, [agent, hydrated]);

  useEffect(() => {
    listVoices()
      .then(setVoices)
      .catch(() => {
        /* voice list is a convenience; the id field still works without it */
      });
  }, [listVoices]);

  const handleSave = async () => {
    setStatus("saving");
    setError(null);
    try {
      await saveAgent({ name, prompt, firstMessage, voiceId });
      setStatus("idle");
      toast("Agent saved — changes apply to the next call");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not save the agent.");
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes apply to the next call. Existing knowledge documents stay attached.
        </p>
      </div>

      <Section icon={Bot} title="Agent configuration">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>

        <Field label="First message" hint="What the agent says the moment the call connects.">
          <input
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="System prompt" hint="Keep it short — long prompts make voice replies rambly.">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            className={`${inputClass} resize-y`}
          />
        </Field>

        <Field label="Voice">
          {voices.length > 0 ? (
            <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className={inputClass}>
              {voices.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          )}
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={status === "saving"}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "saving" ? "Saving…" : "Save agent"}
          </button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>

        {agent && <p className="pt-1 font-mono text-xs text-muted-foreground">{agent.elevenLabsAgentId}</p>}
      </Section>

      <Section icon={Users} title="Staff notifications">
        <p className="-mt-2 text-sm text-muted-foreground">
          Where escalation alerts and call summaries get texted. Overrides the STAFF_PHONE_NUMBER
          environment variable if set here.
        </p>

        <Field label="Staff phone number" hint="E.164 format, e.g. +923312298823">
          <input
            value={staffPhoneNumber}
            onChange={(e) => setStaffPhoneNumber(e.target.value)}
            placeholder="+1..."
            className={`${inputClass} font-mono`}
          />
        </Field>

        <button
          onClick={handleSaveStaff}
          disabled={staffStatus === "saving"}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {staffStatus === "saving" ? "Saving…" : "Save"}
        </button>
      </Section>

      <Section icon={Gauge} title="Lead scoring">
        <p className="-mt-2 text-sm text-muted-foreground">
          Every call in History gets a 0–10 score, computed deterministically from what the call
          actually captured — no AI judgment involved, so it's always explainable. Here's exactly
          how it's calculated:
        </p>

        <div className="space-y-2">
          {RUBRIC.map((r) => (
            <div key={r.label} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                +{r.points}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          A confirmed disqualification (wrong budget or pet policy) caps the score at 4, no
          matter how the rest adds up — an ineligible lead isn't a near-term opportunity.
        </p>
      </Section>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bot;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}
