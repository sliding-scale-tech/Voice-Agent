import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, QueryCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Every dashboard tab (Leads, Tenants, Knowledge, Property, Agent) is scoped by this one
 * lookup, so there is exactly one place that decides "who is asking."
 *
 * Returns null rather than throwing on missing auth or a not-yet-synced Clerk user — every
 * caller in a query context wants to degrade to an empty/default view, not crash the page.
 * Mutations that truly require a signed-in actor (saving an agent, starting a call from the
 * dashboard) check the result themselves and throw with a clearer message.
 */
export async function currentUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

/**
 * For a mutation that has no sensible unauthenticated fallback (saving a property, starting a
 * doc save) — throws instead of returning null so the write can't silently no-op.
 */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await currentUser(ctx);
  if (!user) throw new Error("Not signed in.");
  return user;
}

/**
 * Actions have ctx.auth but not ctx.db, so this goes through users.byClerkId instead.
 *
 * Throws rather than returning null: an action reaching this point (mintToken, saveAgent,
 * docs.remove/save) is always the "own agent" path — the public landing-page demo, the one
 * path in this codebase that legitimately has no signed-in user, branches around this helper
 * entirely rather than calling it. See agents.mintToken for that branch.
 */
export async function requireUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not signed in.");
  const user = await ctx.runQuery(internal.users.byClerkId, { clerkId: identity.subject });
  if (!user) throw new Error("User record not found — try again in a moment.");
  return user._id;
}
