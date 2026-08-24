import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { clampSeverity } from "./severity";

// --- Reads ----------------------------------------------------------------

/**
 * Every logged resident call, worst first.
 *
 * The severity-first sort lives here rather than in the page so no caller can get it wrong —
 * an urgent issue sinking below a routine one is the one failure mode that actually matters.
 */
export const issues = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("tenantIssues").collect();
    return rows.sort((a, b) => b.severity - a.severity || b.createdAt - a.createdAt);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("tenantIssues").collect();
    const open = rows.filter((r) => r.status === "open");

    return {
      openIssues: open.length,
      highSeverityOpen: open.filter((r) => r.severity >= 7).length,
      resolvedIssues: rows.length - open.length,
    };
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
 * Upsert by conversation id so a second log_tenant_issue call in the same conversation
 * corrects the first rather than creating a duplicate row.
 *
 * Nothing here verifies that the caller is a resident, and nothing links them to a previous
 * call. The name and unit are stored exactly as the caller gave them.
 */
export const logIssue = internalMutation({
  args: {
    elevenLabsConversationId: v.string(),
    callerName: v.optional(v.string()),
    unit: v.optional(v.string()),
    callerNumber: v.optional(v.string()),
    reason: v.string(),
    category: v.optional(v.string()),
    severity: v.number(),
    severityReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { elevenLabsConversationId, severity, ...fields } = args;
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
 * Called by the post-call webhook. Links the Convex conversation and backfills the telephony
 * number, which is the only way a browser call — or a call where the agent never got a number
 * out loud — ends up with a usable callback number on the record.
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

    const patch: Record<string, unknown> = {
      conversationId: args.conversationId,
      updatedAt: Date.now(),
    };
    if (args.callerNumber && !issue.callerNumber) patch.callerNumber = args.callerNumber;

    await ctx.db.patch(issue._id, patch);
  },
});

export const updateIssue = mutation({
  args: {
    issueId: v.id("tenantIssues"),
    severity: v.optional(v.number()),
    reason: v.optional(v.string()),
    callerName: v.optional(v.string()),
    unit: v.optional(v.string()),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) return;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.reason !== undefined) patch.reason = args.reason;
    if (args.status !== undefined) patch.status = args.status;
    if (args.callerName !== undefined) patch.callerName = args.callerName;
    if (args.unit !== undefined) patch.unit = args.unit;

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

export const removeIssue = mutation({
  args: { issueId: v.id("tenantIssues") },
  handler: (ctx, args) => ctx.db.delete(args.issueId),
});
