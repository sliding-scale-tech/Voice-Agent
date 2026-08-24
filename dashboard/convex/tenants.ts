import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { normalizePhone } from "./phone";
import { clampSeverity } from "./severity";

// --- Reads ----------------------------------------------------------------

/** The whole roster, most recently contacted first. The page filters by status. */
export const roster = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("tenants").withIndex("by_last_contact").order("desc").collect();
    return rows;
  },
});

/**
 * Every logged issue with its resident joined in, worst first.
 *
 * The severity-first sort lives here rather than in the page so no caller can get it wrong —
 * an urgent issue sinking below a routine one is the one failure mode that actually matters.
 */
export const issues = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("tenantIssues").collect();

    const withTenant = await Promise.all(
      rows.map(async (issue) => {
        const tenant = issue.tenantId ? await ctx.db.get(issue.tenantId) : null;
        return {
          ...issue,
          tenantName: tenant?.name ?? issue.callerName ?? null,
          tenantUnit: tenant?.unit ?? issue.unit ?? null,
          tenantStatus: tenant?.status ?? null,
        };
      }),
    );

    return withTenant.sort(
      (a, b) => b.severity - a.severity || b.createdAt - a.createdAt,
    );
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("tenantIssues").collect();
    const open = rows.filter((r) => r.status === "open");
    const unverified = await ctx.db
      .query("tenants")
      .withIndex("by_status", (q) => q.eq("status", "unverified"))
      .collect();

    return {
      openIssues: open.length,
      highSeverityOpen: open.filter((r) => r.severity >= 7).length,
      unverifiedTenants: unverified.length,
    };
  },
});

/**
 * Roster lookup by phone. A rejected row deliberately reads as "not found": the user has
 * already said this number is not a resident, and the agent should ask rather than greet.
 */
export const findByPhoneInternal = internalQuery({
  args: { phoneNormalized: v.string() },
  handler: async (ctx, args) => {
    const found = await ctx.db
      .query("tenants")
      .withIndex("by_phone_normalized", (q) => q.eq("phoneNormalized", args.phoneNormalized))
      .first();

    if (!found || found.status === "rejected") return null;
    return found;
  },
});

export const issueByElevenLabsId = internalQuery({
  args: { elevenLabsConversationId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("tenantIssues")
      .withIndex("by_elevenlabs_conversation_id", (q) =>
        q.eq("elevenLabsConversationId", args.elevenLabsConversationId),
      )
      .first(),
});

// --- Writes ---------------------------------------------------------------

/**
 * Find-or-create a resident from something said on a call. Matching is by normalized phone
 * only; with no phone we still create a row from the name so the call is not lost, it just
 * cannot be matched on the next call until a number arrives.
 *
 * Two rules worth stating: a confirmed row never has its name or unit overwritten by the
 * agent, and a rejected row is never resurrected — it only gets its lastContactAt bumped, so
 * repeat calls from a dismissed number don't refill the review queue.
 */
export const upsertFromCall = internalMutation({
  args: {
    name: v.optional(v.string()),
    unit: v.optional(v.string()),
    phone: v.optional(v.string()),
    identifiedBy: v.optional(
      v.union(v.literal("caller_id"), v.literal("self_reported")),
    ),
  },
  handler: async (ctx, args) => {
    const phoneNormalized = normalizePhone(args.phone);
    const name = args.name?.trim();
    if (!phoneNormalized && !name) return null;

    const now = Date.now();

    const existing = phoneNormalized
      ? await ctx.db
          .query("tenants")
          .withIndex("by_phone_normalized", (q) => q.eq("phoneNormalized", phoneNormalized))
          .first()
      : null;

    if (existing) {
      const patch: Record<string, unknown> = { lastContactAt: now, updatedAt: now };

      if (existing.status !== "rejected") {
        // Backfill blanks and let a later call correct an earlier guess, but never argue with
        // a human who has already confirmed this row.
        if (name && existing.status !== "confirmed") patch.name = name;
        if (args.unit && existing.status !== "confirmed") patch.unit = args.unit;
        if (args.phone && !existing.phone) patch.phone = args.phone;
        if (args.identifiedBy) patch.identifiedBy = args.identifiedBy;
      }

      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return ctx.db.insert("tenants", {
      name: name ?? "Unknown caller",
      unit: args.unit,
      phone: args.phone,
      phoneNormalized,
      status: "unverified",
      source: "call",
      identifiedBy: args.identifiedBy,
      firstSeenAt: now,
      lastContactAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Upsert by conversation id so a second log_tenant_issue call in the same conversation
 * corrects the first rather than creating a duplicate row.
 */
export const logIssue = internalMutation({
  args: {
    elevenLabsConversationId: v.string(),
    tenantId: v.optional(v.id("tenants")),
    callerName: v.optional(v.string()),
    unit: v.optional(v.string()),
    callerNumber: v.optional(v.string()),
    reason: v.string(),
    category: v.optional(v.string()),
    severity: v.number(),
    severityReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { elevenLabsConversationId, callerNumber, severity, ...fields } = args;
    const now = Date.now();

    const existing = await ctx.db
      .query("tenantIssues")
      .withIndex("by_elevenlabs_conversation_id", (q) =>
        q.eq("elevenLabsConversationId", elevenLabsConversationId),
      )
      .first();

    const patch: Record<string, unknown> = {
      severity: clampSeverity(severity),
      updatedAt: now,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    if (callerNumber !== undefined) {
      patch.callerNumber = callerNumber;
      patch.callerNumberNormalized = normalizePhone(callerNumber);
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return ctx.db.insert("tenantIssues", {
      elevenLabsConversationId,
      reason: args.reason,
      severity: clampSeverity(severity),
      status: "open",
      createdAt: now,
      updatedAt: now,
      ...patch,
    });
  },
});

/**
 * Called by the post-call webhook. Besides linking the Convex conversation, this backfills the
 * telephony number onto both the issue and its resident — which is what lets the *next* call
 * from that person match by caller ID, even when the mid-call lookup had nothing to go on.
 */
export const linkConversation = internalMutation({
  args: {
    elevenLabsConversationId: v.string(),
    conversationId: v.id("conversations"),
    callerNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db
      .query("tenantIssues")
      .withIndex("by_elevenlabs_conversation_id", (q) =>
        q.eq("elevenLabsConversationId", args.elevenLabsConversationId),
      )
      .first();
    if (!issue) return;

    const normalized = normalizePhone(args.callerNumber);

    const patch: Record<string, unknown> = {
      conversationId: args.conversationId,
      updatedAt: Date.now(),
    };
    if (args.callerNumber && !issue.callerNumber) {
      patch.callerNumber = args.callerNumber;
      patch.callerNumberNormalized = normalized;
    }
    await ctx.db.patch(issue._id, patch);

    if (issue.tenantId && normalized) {
      const tenant = await ctx.db.get(issue.tenantId);
      if (tenant && !tenant.phoneNormalized) {
        await ctx.db.patch(tenant._id, {
          phone: tenant.phone ?? args.callerNumber,
          phoneNormalized: normalized,
          updatedAt: Date.now(),
        });
      }
    }
  },
});

export const setTenantStatus = mutation({
  args: {
    tenantId: v.id("tenants"),
    status: v.union(
      v.literal("unverified"),
      v.literal("confirmed"),
      v.literal("rejected"),
    ),
  },
  handler: (ctx, args) =>
    ctx.db.patch(args.tenantId, { status: args.status, updatedAt: Date.now() }),
});

export const updateTenant = mutation({
  args: {
    tenantId: v.id("tenants"),
    name: v.optional(v.string()),
    unit: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { tenantId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    if (fields.phone !== undefined) patch.phoneNormalized = normalizePhone(fields.phone);
    await ctx.db.patch(tenantId, patch);
  },
});

/**
 * Hard delete. The resident's issues are deliberately kept and just unlinked — they are the
 * record of calls that actually happened, and shouldn't disappear with a roster edit.
 */
export const removeTenant = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const linked = await ctx.db
      .query("tenantIssues")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    for (const issue of linked) {
      await ctx.db.patch(issue._id, { tenantId: undefined, updatedAt: Date.now() });
    }
    await ctx.db.delete(args.tenantId);
  },
});

export const updateIssue = mutation({
  args: {
    issueId: v.id("tenantIssues"),
    severity: v.optional(v.number()),
    reason: v.optional(v.string()),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) return;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.reason !== undefined) patch.reason = args.reason;
    if (args.status !== undefined) patch.status = args.status;

    if (args.severity !== undefined) {
      const next = clampSeverity(args.severity);
      if (next !== issue.severity) {
        // Keep the agent's original judgment the first time a human disagrees with it, so the
        // rubric can be audited against what staff actually thought.
        if (issue.originalSeverity === undefined) patch.originalSeverity = issue.severity;
        patch.severity = next;
      }
    }

    await ctx.db.patch(args.issueId, patch);
  },
});
