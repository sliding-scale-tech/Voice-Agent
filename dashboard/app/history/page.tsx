"use client";

import { useQuery, usePaginatedQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneCall,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronsDown,
  Phone,
  Smartphone,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function formatDuration(seconds?: number) {
  if (seconds === undefined) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const INTENT_LABELS: Record<string, string> = {
  leasing: "Leasing",
  maintenance: "Maintenance",
  escalation: "Escalation",
  unclear: "Unclear",
};

const OUTCOME_STYLES: Record<string, string> = {
  tour_booked: "bg-success/15 text-success",
  disqualified: "bg-warning/15 text-warning-foreground",
  escalated: "bg-destructive/15 text-destructive",
  logged_only: "bg-muted text-muted-foreground",
};

const OUTCOME_LABELS: Record<string, string> = {
  tour_booked: "Tour booked",
  disqualified: "Disqualified",
  escalated: "Escalated",
  logged_only: "Logged only",
};

export default function HistoryPage() {
  const {
    results: history,
    status: historyStatus,
    loadMore,
  } = usePaginatedQuery(api.conversations.history, {}, { initialNumItems: 15 });
  const usage = useQuery(api.conversations.usage);
  const funnel = useQuery(api.conversations.funnel);
  const [selected, setSelected] = useState<Id<"conversations"> | null>(null);
  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  const transcript = useQuery(
    api.conversations.transcript,
    selected ? { conversationId: selected } : "skip",
  );
  const qualification = useQuery(
    api.qualifications.forConversation,
    selected ? { conversationId: selected } : "skip",
  );

  const filtered = useMemo(() => {
    if (!history) return history;
    return history.filter((call) => {
      if (intentFilter !== "all" && call.intent !== intentFilter) return false;
      if (outcomeFilter !== "all" && call.outcome !== outcomeFilter) return false;
      return true;
    });
  }, [history, intentFilter, outcomeFilter]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every call, with its full transcript.</p>
      </div>

      {/* "Minutes left" card removed along with the 15-min/month cap it tracked — no longer
          applicable now that ElevenLabs is upgraded. */}
      {usage && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={PhoneCall} label="Calls this month" value={String(usage.callCount)} />
          <StatCard icon={Clock} label="Minutes used" value={formatDuration(usage.secondsUsed)} />
          <StatCard icon={TrendingUp} label="Avg call" value={formatDuration(usage.avgDurationSec)} />
        </div>
      )}

      {funnel && <FunnelChart funnel={funnel} />}

      <div className="flex flex-wrap gap-2">
        <select
          value={intentFilter}
          onChange={(e) => setIntentFilter(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm"
        >
          <option value="all">All intents</option>
          {Object.entries(INTENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm"
        >
          <option value="all">All outcomes</option>
          {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {filtered?.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No calls match this filter.
        </div>
      )}

      {/* Mobile: stacked cards. Desktop: table. Avoids horizontal scroll on small screens. */}
      <div className="space-y-3 sm:hidden">
        {filtered?.map((call, i) => (
          <CallCard
            key={call._id}
            call={call}
            index={i}
            expanded={selected === call._id}
            onToggle={() => setSelected(selected === call._id ? null : call._id)}
            transcript={selected === call._id ? transcript : undefined}
            qualification={selected === call._id ? qualification : undefined}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Caller</th>
              <th className="px-4 py-3 font-medium">Intent</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Escalated to</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((call, i) => (
              <FragmentRow
                key={call._id}
                call={call}
                index={i}
                expanded={selected === call._id}
                onToggle={() => setSelected(selected === call._id ? null : call._id)}
                transcript={selected === call._id ? transcript : undefined}
                qualification={selected === call._id ? qualification : undefined}
              />
            ))}
          </tbody>
        </table>
      </div>

      {historyStatus !== "Exhausted" && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => loadMore(15)}
            disabled={historyStatus !== "CanLoadMore"}
            className="flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {historyStatus === "LoadingMore" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              <>
                <ChevronsDown className="h-3.5 w-3.5" />
                Show more
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

type CallRow = {
  _id: Id<"conversations">;
  startedAt: number;
  channel: "browser" | "phone";
  callerNumber?: string;
  intent?: string;
  outcome?: string;
  escalatedTo?: string;
  summary?: string;
  durationSec?: number;
  status: string;
  messageCount: number;
  leadScore: number;
};

type Qualification = {
  bedrooms?: string;
  moveInDate?: string;
  budget?: number;
  petsWanted?: boolean;
  petType?: string;
  callerName?: string;
  callerPhone?: string;
  qualifies?: boolean;
  disqualifyReason?: string;
  tourSlot?: string;
} | null;

function OutcomeBadge({ call }: { call: CallRow }) {
  if (call.outcome) {
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[call.outcome]}`}>
        {OUTCOME_LABELS[call.outcome]}
      </span>
    );
  }
  if (call.status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        live
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

const SCORE_STYLES: Record<"high" | "medium" | "low", string> = {
  high: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning-foreground",
  low: "bg-muted text-muted-foreground",
};

function LeadScoreBadge({ score }: { score: number }) {
  const band = score >= 7 ? "high" : score >= 4 ? "medium" : "low";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${SCORE_STYLES[band]}`}>
      {score}/10
    </span>
  );
}

function ExpandedDetail({
  transcript,
  qualification,
  summary,
}: {
  transcript?: Array<{ _id: string; role: string; text: string }>;
  qualification?: Qualification;
  summary?: string;
}) {
  return (
    <div className="space-y-4">
      {summary && <p className="text-sm italic text-muted-foreground">{summary}</p>}

      {qualification && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <Field label="Bedrooms" value={qualification.bedrooms} />
          <Field label="Move-in" value={qualification.moveInDate} />
          <Field label="Budget" value={qualification.budget ? `$${qualification.budget}` : undefined} />
          <Field
            label="Pets"
            value={
              qualification.petsWanted === undefined
                ? undefined
                : qualification.petsWanted
                  ? qualification.petType ?? "Yes"
                  : "No"
            }
          />
          <Field label="Name" value={qualification.callerName} />
          <Field label="Phone" value={qualification.callerPhone} />
          {qualification.tourSlot && <Field label="Tour slot" value={qualification.tourSlot} />}
          {qualification.disqualifyReason && (
            <Field label="Disqualify reason" value={qualification.disqualifyReason} />
          )}
        </div>
      )}

      <div className="space-y-3">
        {transcript?.length ? (
          transcript.map((line) => (
            <div key={line._id} className={line.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  line.role === "user" ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground"
                }`}
              >
                {line.text}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No transcript recorded for this call.</p>
        )}
      </div>
    </div>
  );
}

function FragmentRow({
  call,
  index,
  expanded,
  onToggle,
  transcript,
  qualification,
}: {
  call: CallRow;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  transcript?: Array<{ _id: string; role: string; text: string }>;
  qualification?: Qualification;
}) {
  return (
    <>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: Math.min(index, 8) * 0.03 }}
        onClick={onToggle}
        className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
      >
        <td className="px-4 py-3">{new Date(call.startedAt).toLocaleString()}</td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-1.5 capitalize text-muted-foreground">
            {call.channel === "phone" ? <Phone className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
            {call.channel}
          </span>
        </td>
        <td className="px-4 py-3">{call.callerNumber ?? "—"}</td>
        <td className="px-4 py-3">{call.intent ? INTENT_LABELS[call.intent] : "—"}</td>
        <td className="px-4 py-3">
          <OutcomeBadge call={call} />
        </td>
        <td className="px-4 py-3">
          <LeadScoreBadge score={call.leadScore} />
        </td>
        <td className="px-4 py-3 tabular-nums">{formatDuration(call.durationSec)}</td>
        <td className="px-4 py-3">{call.escalatedTo ?? "—"}</td>
      </motion.tr>
      <AnimatePresence initial={false}>
        {expanded && (
          <tr>
            <td colSpan={8} className="border-b border-border bg-muted/20 p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-5">
                  <ExpandedDetail transcript={transcript} qualification={qualification} summary={call.summary} />
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

function CallCard({
  call,
  index,
  expanded,
  onToggle,
  transcript,
  qualification,
}: {
  call: CallRow;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  transcript?: Array<{ _id: string; role: string; text: string }>;
  qualification?: Qualification;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {call.channel === "phone" ? <Phone className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
            {new Date(call.startedAt).toLocaleString()}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{call.intent ? INTENT_LABELS[call.intent] : "Unclear"}</span>
            <OutcomeBadge call={call} />
            <LeadScoreBadge score={call.leadScore} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {formatDuration(call.durationSec)}
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-4">
              <ExpandedDetail transcript={transcript} qualification={qualification} summary={call.summary} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span>{value}</span>
    </div>
  );
}

function FunnelChart({
  funnel,
}: {
  funnel: { callsAnswered: number; leadsQualified: number; toursBooked: number };
}) {
  const max = Math.max(funnel.callsAnswered, 1);
  const steps = [
    { label: "Calls answered", value: funnel.callsAnswered },
    { label: "Leads qualified", value: funnel.leadsQualified },
    { label: "Tours booked", value: funnel.toursBooked },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-medium">Conversion funnel</h2>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const pct = Math.round((step.value / max) * 100);
          const prevValue = i > 0 ? steps[i - 1].value : step.value;
          const conversionPct = prevValue > 0 ? Math.round((step.value / prevValue) * 100) : null;
          return (
            <div key={step.label}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">{step.label}</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold tabular-nums">{step.value}</span>
                  {conversionPct !== null && i > 0 && (
                    <span className="text-xs text-muted-foreground">({conversionPct}%)</span>
                  )}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(pct, 3)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.1 }}
                  className="h-full rounded-full bg-primary"
                  style={{ opacity: 1 - i * 0.22 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof PhoneCall;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
