"use client";

import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ClipboardList, CheckCircle2, X, Trash2, Gauge } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/toast";
import { SEVERITY_RUBRIC, severityBand, type SeverityBand } from "@/convex/severity";

const SEVERITY_STYLES: Record<SeverityBand, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-warning/15 text-warning-foreground",
  low: "bg-muted text-muted-foreground",
};

const SEVERITY_LABELS: Record<SeverityBand, string> = {
  high: "High (7-10)",
  medium: "Medium (4-6)",
  low: "Low (1-3)",
};

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

function formatWhen(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type IssueRow = {
  _id: Id<"tenantIssues">;
  callerName?: string;
  unit?: string;
  callerNumber?: string;
  reason: string;
  category?: string;
  severity: number;
  severityReason?: string;
  originalSeverity?: number;
  status: "open" | "resolved";
  createdAt: number;
};

export default function TenantsPage() {
  const toast = useToast();
  const issues = useQuery(api.tenants.issues);
  const stats = useQuery(api.tenants.stats);

  const updateIssue = useMutation(api.tenants.updateIssue);
  const removeIssue = useMutation(api.tenants.removeIssue);

  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [selected, setSelected] = useState<Id<"tenantIssues"> | null>(null);

  const filtered = useMemo(() => {
    if (!issues) return undefined;
    return issues.filter((issue) => {
      if (statusFilter !== "all" && issue.status !== statusFilter) return false;
      if (severityFilter !== "all" && severityBand(issue.severity) !== severityFilter) return false;
      return true;
    });
  }, [issues, severityFilter, statusFilter]);

  const selectedIssue = filtered?.find((i) => i._id === selected) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tenants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Residents who called, what they called about, and how urgent it is. Names and units are
          recorded as the caller gave them — nothing is verified. Severity is Emily&apos;s judgment
          on the call; you can change it here and the original is kept.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={ClipboardList} label="Open issues" value={String(stats.openIssues)} />
          <StatCard
            icon={AlertTriangle}
            label="High severity"
            value={String(stats.highSeverityOpen)}
          />
          <StatCard icon={CheckCircle2} label="Resolved" value={String(stats.resolvedIssues)} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm"
        >
          <option value="all">All severities</option>
          {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm"
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
      </div>

      {filtered?.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {issues?.length === 0
            ? "No resident calls logged yet. Emily adds them here as they call in."
            : "No issues match this filter."}
        </div>
      )}

      {/* Mobile: stacked cards. Desktop: table. Avoids horizontal scroll on small screens. */}
      <div className="space-y-3 sm:hidden">
        {filtered?.map((issue, i) => (
          <IssueCard
            key={issue._id}
            issue={issue}
            index={i}
            onClick={() => setSelected(issue._id)}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Caller</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((issue, i) => (
              <motion.tr
                key={issue._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
                onClick={() => setSelected(issue._id)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
              >
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {formatWhen(issue.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{issue.callerName ?? "—"}</div>
                  {issue.unit && (
                    <div className="text-xs text-muted-foreground">Unit {issue.unit}</div>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {issue.callerNumber ?? "—"}
                </td>
                <td className="max-w-xs px-4 py-3">
                  <div className="truncate">{issue.reason}</div>
                  {issue.category && (
                    <div className="text-xs text-muted-foreground">{issue.category}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <SeverityBadge severity={issue.severity} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={issue.status} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Severity scale</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Emily scores every resident call against this exact scale — it&apos;s written into her
          instructions from the same source as this list, so the two can never drift apart. She
          scores the issue, not how upset the caller sounds.
        </p>
        <div className="mt-4 space-y-2">
          {SEVERITY_RUBRIC.map((r) => (
            <div
              key={r.band}
              className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
            >
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                {r.band}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedIssue && (
          <IssueModal
            issue={selectedIssue}
            onClose={() => setSelected(null)}
            onSave={async (patch) => {
              await updateIssue({ issueId: selectedIssue._id, ...patch });
              setSelected(null);
              toast("Issue updated");
            }}
            onDelete={async () => {
              await removeIssue({ issueId: selectedIssue._id });
              setSelected(null);
              toast("Issue deleted");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: number }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
        SEVERITY_STYLES[severityBand(severity)]
      }`}
    >
      {severity}/10
    </span>
  );
}

function StatusBadge({ status }: { status: "open" | "resolved" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        status === "open"
          ? "bg-warning/15 text-warning-foreground"
          : "bg-success/15 text-success"
      }`}
    >
      {status === "open" ? "Open" : "Resolved"}
    </span>
  );
}

function IssueCard({
  issue,
  index,
  onClick,
}: {
  issue: IssueRow;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{issue.callerName ?? "—"}</div>
          {issue.unit && <div className="text-xs text-muted-foreground">Unit {issue.unit}</div>}
        </div>
        <SeverityBadge severity={issue.severity} />
      </div>
      <p className="mt-2 text-sm">{issue.reason}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        {formatWhen(issue.createdAt)}
        {issue.callerNumber && <span className="tabular-nums">· {issue.callerNumber}</span>}
      </div>
    </motion.button>
  );
}

function IssueModal({
  issue,
  onClose,
  onSave,
  onDelete,
}: {
  issue: IssueRow;
  onClose: () => void;
  onSave: (patch: {
    severity?: number;
    reason?: string;
    callerName?: string;
    unit?: string;
    status?: "open" | "resolved";
  }) => void;
  onDelete: () => void;
}) {
  const [severity, setSeverity] = useState(issue.severity);
  const [reason, setReason] = useState(issue.reason);
  const [status, setStatus] = useState<"open" | "resolved">(issue.status);
  const [callerName, setCallerName] = useState(issue.callerName ?? "");
  const [unit, setUnit] = useState(issue.unit ?? "");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Resident call</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {issue.severityReason && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">Emily&apos;s reasoning</div>
            <div className="mt-0.5 text-sm">{issue.severityReason}</div>
          </div>
        )}

        <div className="flex gap-3">
          <label className="block flex-1 space-y-1.5">
            <span className="text-sm font-medium">Caller</span>
            <input
              value={callerName}
              onChange={(e) => setCallerName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block flex-1 space-y-1.5">
            <span className="text-sm font-medium">Unit</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} />
          </label>
        </div>

        {issue.callerNumber && (
          <div className="text-xs text-muted-foreground">
            Called from <span className="tabular-nums">{issue.callerNumber}</span>
          </div>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Reason for calling</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className={`${inputClass} resize-y`}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Severity (1-10)</span>
          {issue.originalSeverity !== undefined && (
            <span className="block text-xs text-muted-foreground">
              Emily originally scored this {issue.originalSeverity}/10.
            </span>
          )}
          <input
            type="number"
            min={1}
            max={10}
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className={inputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "open" | "resolved")}
            className={inputClass}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave({ severity, reason, callerName, unit, status })}
              disabled={!reason.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardList;
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
