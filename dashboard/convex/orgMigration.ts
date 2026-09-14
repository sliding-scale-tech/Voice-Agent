import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Moves teams out of Clerk and into this database.
 *
 * Clerk organizations were the source of truth for about an hour; every data row carries the
 * Clerk org id it was stamped with. This creates the equivalent Convex organization and
 * membership rows, then rewrites each data row's `orgId` from the Clerk id to the new Convex
 * one, so `orgId` can become a real `v.id("organizations")` reference afterwards.
 *
 * Idempotent by mapping: a row whose orgId is not a key in `mapping` is left alone, so a
 * second pass finds nothing to do rather than double-writing.
 */
export const importFromClerk = internalMutation({
  args: {
    teams: v.array(
      v.object({
        clerkOrgId: v.string(),
        name: v.string(),
        // Clerk user ids of the members, with the admin flagged.
        members: v.array(v.object({ clerkUserId: v.string(), role: v.union(v.literal("admin"), v.literal("member")) })),
      }),
    ),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const mapping = new Map<string, Id<"organizations">>();
    const created: Array<{ name: string; orgId: string; members: number }> = [];
    const problems: string[] = [];

    for (const team of args.teams) {
      const resolved: Array<{ userId: Id<"users">; role: "admin" | "member" }> = [];
      for (const member of team.members) {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", member.clerkUserId))
          .unique();
        if (!user) {
          problems.push(`${team.name}: no Convex user for ${member.clerkUserId}`);
          continue;
        }
        resolved.push({ userId: user._id, role: member.role });
      }

      const admin = resolved.find((r) => r.role === "admin") ?? resolved[0];
      if (!admin) {
        problems.push(`${team.name}: no resolvable members, skipped`);
        continue;
      }

      // An org already imported under this name+creator would duplicate on a re-run, so reuse
      // it instead. Cheap because this table is tiny and only ever read here.
      const existing = (await ctx.db.query("organizations").collect()).find(
        (o) => o.name === team.name && o.createdBy === admin.userId,
      );

      const orgId =
        existing?._id ??
        (args.dryRun
          ? ("dry_run" as unknown as Id<"organizations">)
          : await ctx.db.insert("organizations", {
              name: team.name,
              createdBy: admin.userId,
              createdAt: now,
              updatedAt: now,
            }));

      if (!args.dryRun) {
        for (const member of resolved) {
          const alreadyMember = await ctx.db
            .query("memberships")
            .withIndex("by_user", (q) => q.eq("userId", member.userId))
            .first();
          if (alreadyMember) continue;
          await ctx.db.insert("memberships", {
            orgId,
            userId: member.userId,
            role: member.role,
            createdAt: now,
          });
        }
      }

      mapping.set(team.clerkOrgId, orgId);
      created.push({ name: team.name, orgId: String(orgId), members: resolved.length });
    }

    // --- rewrite orgId on every data row ---------------------------------
    const owned = [
      "agents",
      "docs",
      "properties",
      "screeningQuestions",
      "screeningBuiltins",
      "conversations",
      "tenantIssues",
    ] as const;

    const rewritten: Record<string, number> = {};
    for (const table of owned) {
      const rows = await ctx.db.query(table).collect();
      let count = 0;
      for (const row of rows) {
        const current = (row as { orgId?: string }).orgId;
        if (!current) continue;
        const next = mapping.get(current);
        if (!next) continue; // already a Convex id, or an org we were not given
        if (!args.dryRun) await ctx.db.patch(row._id, { orgId: next } as never);
        count += 1;
      }
      if (count) rewritten[table] = count;
    }

    return {
      dryRun: Boolean(args.dryRun),
      teams: created,
      rewritten,
      totalRewritten: Object.values(rewritten).reduce((a, b) => a + b, 0),
      problems,
    };
  },
});

/** What is still unstamped, per table. Run after a migration to prove nothing was missed. */
export const audit = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "agents",
      "docs",
      "properties",
      "screeningQuestions",
      "screeningBuiltins",
      "conversations",
      "tenantIssues",
    ] as const;

    const orgIds = new Set((await ctx.db.query("organizations").collect()).map((o) => String(o._id)));
    const out: Record<string, { total: number; missing: number; notConvexOrg: number }> = {};
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      out[table] = {
        total: rows.length,
        missing: rows.filter((r) => !(r as { orgId?: string }).orgId).length,
        notConvexOrg: rows.filter((r) => {
          const id = (r as { orgId?: string }).orgId;
          return Boolean(id) && !orgIds.has(String(id));
        }).length,
      };
    }
    return {
      organizations: orgIds.size,
      memberships: (await ctx.db.query("memberships").collect()).length,
      tables: out,
    };
  },
});
