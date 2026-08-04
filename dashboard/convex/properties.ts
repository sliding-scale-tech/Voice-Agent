import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

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

/** Single-property dashboard: seeds the default row on first read so there's always one. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("properties").first();
    return existing ?? { _id: undefined, ...DEFAULT_PROPERTY, updatedAt: 0 };
  },
});

export const currentInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("properties").first();
    if (existing) return existing;
    return { ...DEFAULT_PROPERTY, updatedAt: Date.now() };
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
    const existing = await ctx.db.query("properties").first();
    const row = { ...args, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("properties", row);

    await ctx.scheduler.runAfter(0, internal.docs.syncPropertyDoc, {});
  },
});
