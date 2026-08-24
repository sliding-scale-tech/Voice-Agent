"use client";

import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ClipboardList,
  UserCheck,
  Check,
  X,
  Trash2,
  Gauge,
} from "lucide-react";
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

const TENANT_STATUS_STYLES: Record<string, string> = {
  unverified: "bg-warning/15 text-warning-foreground",
  confirmed: "bg-success/15 text-success",
  rejected: "bg-muted text-muted-foreground",
};

const TENANT_STATUS_LABELS: Record<string, string> = {
  unverified: "Unverified",
  confirmed: "Confirmed",
  rejected: "Rejected",
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
  tenantId?: Id<"tenants">;
  tenantName: string | null;
  tenantUnit: string | null;
  tenantStatus: string | null;
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
  const roster = useQuery(api.tenants.roster);
  const stats = useQuery(api.tenants.stats);

  const setTenantStatus = useMutation(api.tenants.setTenantStatus);
  const updateIssue = useMutation(api.tenants.updateIssue);
  const updateTenant = useMutation(api.tenants.updateTenant);
  const removeTenant = useMutation(api.tenants.removeTenant);

  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [selected, setSelected] = useState<Id<"tenantIssues"> | null>(null);

  const unverified = useMemo(
    () => roster?.filter((t) => t.status === "unverified") ?? [],
    [roster],
  );

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
          Residents Emily identified on calls, and what they called about. Severity is Emily&apos;s
          judgment during the call — you can change it here, and the original is kept.
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
          <StatCard
            icon={UserCheck}
            label="Awaiting review"
            value={String(stats.unverifiedTenants)}
          />
        </div>
      )}

      {/* Sits above the table on purpose: a roster that only fills itself from calls is only
          trustworthy if the confirm/reject queue is the first thing you see. */}
      {unverified.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Needs review</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Emily added these from calls. Confirm the ones who really are residents — confirmed
            names and units are never overwritten by a later call.
          </p>
          <div className="mt-4 space-y-2">
            {unverified.map((tenant) => (
              <div
                key={tenant._id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {tenant.name}
                    {tenant.unit && (
                      <span className="ml-2 text-xs text-muted-foreground">Unit {tenant.unit}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tenant.phone ?? "No number captured"}
                    {tenant.identifiedBy === "self_reported" && " · said so on the call"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await setTenantStatus({ tenantId: tenant._id, status: "confirmed" });
                      toast("Resident confirmed");
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Confirm
                  </button>
                  <button
                    onClick={async () => {
                      await setTenantStatus({ tenantId: tenant._id, status: "rejected" });
                      toast("Marked as not a resident");
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-3.5 w-3.5" />
                    Not a resident
                  </button>
                </div>
              </div>
            ))}
          </div>
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
            ? "No resident calls logged yet. Emily adds people here as they call in."
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
              <th className="px-4 py-3 font-medium">Resident</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Verified</th>
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
                  <div className="font-medium">{issue.tenantName ?? "—"}</div>
                  {issue.tenantUnit && (
                    <div className="text-xs text-muted-foreground">Unit {issue.tenantUnit}</div>
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
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      issue.status === "open"
                        ? "bg-warning/15 text-warning-foreground"
                        : "bg-success/15 text-success"
                    }`}
                  >
                    {issue.status === "open" ? "Open" : "Resolved"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {issue.tenantStatus ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        TENANT_STATUS_STYLES[issue.tenantStatus]
                      }`}
                    >
                      {TENANT_STATUS_LABELS[issue.tenantStatus]}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
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
            onSaveIssue={async (patch) => {
              await updateIssue({ issueId: selectedIssue._id, ...patch });
              setSelected(null);
              toast("Issue updated");
            }}
            onSaveTenant={async (patch) => {
              if (!selectedIssue.tenantId) return;
              await updateTenant({ tenantId: selectedIssue.tenantId, ...patch });
              toast("Resident updated");
            }}
            onRejectTenant={async () => {
              if (!selectedIssue.tenantId) return;
              await setTenantStatus({ tenantId: selectedIssue.tenantId, status: "rejected" });
              setSelected(null);
              toast("Marked as not a resident");
            }}
            onDeleteTenant={async () => {
              if (!selectedIssue.tenantId) return;
              await removeTenant({ tenantId: selectedIssue.tenantId });
              setSelected(null);
              toast("Resident removed — their calls are kept");
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
          <div className="font-medium">{issue.tenantName ?? "—"}</div>
          {issue.tenantUnit && (
            <div className="text-xs text-muted-foreground">Unit {issue.tenantUnit}</div>
          )}
        </div>
        <SeverityBadge severity={issue.severity} />
      </div>
      <p className="mt-2 text-sm">{issue.reason}</p>
      <div className="mt-2 text-xs text-muted-foreground">{formatWhen(issue.createdAt)}</div>
    </motion.button>
  );
}

function IssueModal({
  issue,
  onClose,
  onSaveIssue,
  onSaveTenant,
  onRejectTenant,
  onDeleteTenant,
}: {
  issue: IssueRow;
  onClose: () => void;
  onSaveIssue: (patch: {
    severity?: number;
    reason?: string;
    status?: "open" | "resolved";
  }) => void;
  onSaveTenant: (patch: { name?: string; unit?: string; phone?: string }) => void;
  onRejectTenant: () => void;
  onDeleteTenant: () => void;
}) {
  const [severity, setSeverity] = useState(issue.severity);
  const [reason, setReason] = useState(issue.reason);
  const [status, setStatus] = useState<"open" | "resolved">(issue.status);
  const [name, setName] = useState(issue.tenantName ?? "");
  const [unit, setUnit] = useState(issue.tenantUnit ?? "");

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
          <h2 className="text-lg font-semibold">Resident issue</h2>
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

        {issue.tenantId && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="text-xs font-medium text-muted-foreground">Resident record</div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Unit</span>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} />
            </label>
            <button
              onClick={() => onSaveTenant({ name, unit })}
              className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              Save resident
            </button>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {issue.tenantId ? (
            <div className="flex gap-1">
              <button
                onClick={onRejectTenant}
                className="rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                Not a resident
              </button>
              <button
                onClick={onDeleteTenant}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={() => onSaveIssue({ severity, reason, status })}
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
