import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

// --- Reads ----------------------------------------------------------------

export const forConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("qualifications").collect();
    return rows.find((r) => r.conversationId === args.conversationId) ?? null;
  },
});

export const byElevenLabsId = internalQuery({
  args: { elevenLabsConversationId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("qualifications")
      .withIndex("by_elevenlabs_conversation_id", (q) =>
        q.eq("elevenLabsConversationId", args.elevenLabsConversationId),
      )
      .first(),
});

// --- Writes ---------------------------------------------------------------

/**
 * Find-or-create keyed by the ElevenLabs conversation id. Every server tool call during a
 * phone call lands here before any Convex `conversations` row necessarily exists.
 */
export const upsertByConversationId = internalMutation({
  args: {
    elevenLabsConversationId: v.string(),
    bedrooms: v.optional(v.string()),
    moveInDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    petsWanted: v.optional(v.boolean()),
    petType: v.optional(v.string()),
    callerName: v.optional(v.string()),
    callerPhone: v.optional(v.string()),
    qualifies: v.optional(v.boolean()),
    disqualifyReason: v.optional(v.string()),
    tourSlot: v.optional(v.string()),
    tourConfirmed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { elevenLabsConversationId, ...fields } = args;
    const existing = await ctx.db
      .query("qualifications")
      .withIndex("by_elevenlabs_conversation_id", (q) =>
        q.eq("elevenLabsConversationId", elevenLabsConversationId),
      )
      .first();

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return ctx.db.insert("qualifications", {
      elevenLabsConversationId,
      tourConfirmed: false,
      updatedAt: Date.now(),
      ...patch,
    });
  },
});

export const linkConversation = internalMutation({
  args: {
    elevenLabsConversationId: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("qualifications")
      .withIndex("by_elevenlabs_conversation_id", (q) =>
        q.eq("elevenLabsConversationId", args.elevenLabsConversationId),
      )
      .first();
    if (existing) await ctx.db.patch(existing._id, { conversationId: args.conversationId });
  },
});
