import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { currentUser, requireUser } from "./authz";

const DEFAULT_PROPERTY = {
  name: "Maple Court Apartments",
  units: [
    { bedrooms: "studio", rentMin: 1400, rentMax: 1400, available: true },
    { bedrooms: "1br", rentMin: 1650, rentMax: 1650, available: true },
    { bedrooms: "2br", rentMin: 2100, rentMax: 2100, available: true },
  ],
  petsAllowed: false,
  moveInWindowDays: 60,
};

// --- Reads ----------------------------------------------------------------

/**
 * The signed-in user's own property. Before they have one — a brief window before their
 * first call or Settings save triggers agents.ensure to actually clone it — this previews the
 * same template every new user gets seeded from, so what's on screen doesn't jump the moment
 * a real row lands.
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return { _id: undefined, ...DEFAULT_PROPERTY, updatedAt: 0 };
    const existing = await ctx.db
      .query("properties")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) return existing;

    // Same "pre-multi-tenancy agent's owner" resolution as agents.templateOwnerId — inlined
    // rather than called, since a query can't ctx.runQuery another Convex function the way an
    // action can.
    const templateUserId = (await ctx.db.query("agents").first())?.userId;
    const template = templateUserId
      ? await ctx.db
          .query("properties")
          .withIndex("by_user", (q) => q.eq("userId", templateUserId))
          .first()
      : null;
    return template ?? { _id: undefined, ...DEFAULT_PROPERTY, updatedAt: 0 };
  },
});

/**
 * `userId` undefined resolves the pre-multi-tenancy fallback — see agents.currentInternal for
 * why: a phone call's tool webhook that can't yet tell which user placed the call, or the
 * public landing-page demo, both need *some* property to answer from, exactly as before this
 * migration.
 */
export const currentInternal = internalQuery({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId;
    const existing = userId
      ? await ctx.db
          .query("properties")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first()
      : await ctx.db.query("properties").first();
    if (existing) return existing;
    return { ...DEFAULT_PROPERTY, updatedAt: Date.now() };
  },
});

/**
 * Seeds a brand-new user's property as a copy of the template's — see agents.templateOwnerId.
 * A no-op if this user already has one (never clobbers real work) or if there's no template to
 * copy (a from-scratch install with no property ever saved, in which case agents.ensure's own
 * DEFAULT_PROPERTY-equivalent fallback in createAgent's config still applies via check_availability
 * reading currentInternal with no match).
 */
export const cloneForUser = internalMutation({
  args: { userId: v.id("users"), templateUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("properties")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const templateUserId = args.templateUserId;
    if (existing || !templateUserId) return;

    const template = await ctx.db
      .query("properties")
      .withIndex("by_user", (q) => q.eq("userId", templateUserId))
      .first();
    if (!template) return;

    await ctx.db.insert("properties", {
      userId: args.userId,
      name: template.name,
      units: template.units,
      petsAllowed: template.petsAllowed,
      moveInWindowDays: template.moveInWindowDays,
      updatedAt: Date.now(),
    });

    // The auto-generated property doc regenerates from whatever property row exists, so this
    // gives the new user their own copy of it rather than cloning the template's verbatim
    // (which would still be correct today since the content is identical, but would drift
    // stale the moment either property is edited).
    await ctx.scheduler.runAfter(0, internal.docs.syncPropertyDoc, { userId: args.userId });
  },
});

// --- Writes ---------------------------------------------------------------

export const save = mutation({
  args: {
    name: v.string(),
    units: v.array(
      v.object({
        bedrooms: v.string(),
        rentMin: v.number(),
        rentMax: v.number(),
        available: v.boolean(),
      }),
    ),
    petsAllowed: v.boolean(),
    moveInWindowDays: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("properties")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    const row = { ...args, userId: user._id, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("properties", row);

    await ctx.scheduler.runAfter(0, internal.docs.syncPropertyDoc, { userId: user._id });
  },
});
