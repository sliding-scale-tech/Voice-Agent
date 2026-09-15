import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { currentOrg, requireOrgAdmin, requireOrgId, requireUser, currentUser } from "./authz";
import * as el from "./elevenLabsApi";
import { sendEmail } from "./resendApi";

/**
 * Teams, members and invitations.
 *
 * Reading the roster is open to any member — a teammate should be able to see who else is on
 * the team. Everything that changes it is admin-only, enforced here rather than by hiding the
 * tab; hiding the nav item is a courtesy to the person, not a security boundary.
 */

/** Long enough that guessing is hopeless, short enough to survive an email client's line wrap. */
const TOKEN_BYTES = 32;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// --- Reads ----------------------------------------------------------------

/**
 * A live query, unlike the Clerk-backed version this replaced — the roster is now rows in this
 * database, so the Team page updates itself when someone accepts an invite.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const org = await currentOrg(ctx);
    if (!org) return null;

    const organization = await ctx.db.get(org.orgId);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", org.orgId))
      .collect();

    const members = await Promise.all(
      memberships.map(async (m) => {
        const [user, hours, connection] = await Promise.all([
          ctx.db.get(m.userId),
          ctx.db
            .query("tourAvailability")
            .withIndex("by_user", (q) => q.eq("userId", m.userId))
            .unique(),
          ctx.db
            .query("googleCalendarConnections")
            .withIndex("by_user", (q) => q.eq("userId", m.userId))
            .unique(),
        ]);
        const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
        const takingTours = hours?.availableForTours ?? true;
        return {
          membershipId: m._id,
          userId: m.userId,
          name: name || user?.email || "Unknown",
          email: user?.email ?? "",
          imageUrl: user?.imageUrl ?? null,
          role: m.role,
          isSelf: m.userId === org.user._id,
          joinedAt: m.createdAt,
          takingTours,
          // Whether Sarah can actually book them right now, and if not, the one thing in the way.
          // Same rules as tours.bookingContext, which is what booking really reads.
          tourStatus: !takingTours
            ? ("off" as const)
            : !connection
              ? ("no_calendar" as const)
              : connection.invalidAt
                ? ("reconnect" as const)
                : !organization?.timeZone
                  ? ("no_time_zone" as const)
                  : ("bookable" as const),
        };
      }),
    );

    // A plain member has no reason to see who has been invited but not yet joined.
    const invitations = org.isAdmin
      ? (
          await ctx.db
            .query("invites")
            .withIndex("by_org", (q) => q.eq("orgId", org.orgId))
            .collect()
        )
          .filter((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > Date.now())
          .map((i) => ({
            id: i._id,
            email: i.email,
            role: i.role,
            createdAt: i.createdAt,
            expiresAt: i.expiresAt,
          }))
      : [];

    return {
      orgId: org.orgId,
      orgName: organization?.name ?? "Your team",
      isAdmin: org.isAdmin,
      members: members.sort((a, b) => {
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return a.joinedAt - b.joinedAt;
      }),
      invitations,
    };
  },
});

// --- Writes ---------------------------------------------------------------

export const rename = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const org = await requireOrgAdmin(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Give the team a name.");
    if (name.length > 60) throw new Error("That name is too long.");
    await ctx.db.patch(org.orgId, { name, updatedAt: Date.now() });
  },
});

export const removeMember = mutation({
  args: { membershipId: v.id("memberships") },
  handler: async (ctx, args) => {
    const org = await requireOrgAdmin(ctx);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.orgId !== org.orgId) throw new Error("Member not found.");

    // Removing yourself would leave a team nobody can administer, and there is no ownership
    // transfer yet, so the only safe answer is to refuse.
    if (membership.userId === org.user._id) {
      throw new Error("You cannot remove yourself from your own team.");
    }
    await ctx.db.delete(args.membershipId);
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const org = await requireOrgAdmin(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.orgId !== org.orgId) return;
    await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
  },
});

// --- Invitations ----------------------------------------------------------

/**
 * Creates an invitation and emails the link.
 *
 * An action rather than a mutation because it needs real randomness and SHA-256 (neither is
 * available in Convex's deterministic mutation runtime) and because it sends mail.
 */
export const invite = action({
  args: { email: v.string(), role: v.optional(v.union(v.literal("admin"), v.literal("member"))) },
  handler: async (ctx, args): Promise<{ email: string }> => {
    const { orgId, isAdmin, userId } = await requireOrgId(ctx);
    if (!isAdmin) throw new Error("Only a team admin can do that.");

    const email = args.email.trim().toLowerCase();
    if (!email.includes("@") || email.length < 3) throw new Error("Enter a valid email address.");

    const token = randomToken();
    const created: { orgName: string } = await ctx.runMutation(internal.team.recordInvite, {
      orgId,
      email,
      role: args.role ?? "member",
      tokenHash: await sha256(token),
      createdBy: userId,
      expiresAt: Date.now() + INVITE_TTL_MS,
    });

    const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const link = `${base}/accept-invite?token=${token}`;

    await sendEmail({
      to: email,
      subject: `You have been invited to ${created.orgName}`,
      html: inviteEmailHtml(created.orgName, link),
    });

    return { email };
  },
});

/**
 * Redeems an invitation for the signed-in user.
 *
 * Everything that could let a stray link into somebody else's team is checked here: the token
 * must hash to a live invite, the invite must not be expired, revoked or already used, and the
 * signed-in account's email must be the one that was invited — otherwise a forwarded email
 * would be enough to join.
 */
export const acceptInvite = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<{ orgName: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in first, then open the invitation link again.");

    return await ctx.runMutation(internal.team.redeemInvite, {
      clerkId: identity.subject,
      tokenHash: await sha256(args.token.trim()),
    });
  },
});

export const recordInvite = internalMutation({
  args: {
    orgId: v.id("organizations"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    tokenHash: v.string(),
    createdBy: v.id("users"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args): Promise<{ orgName: string }> => {
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new Error("Team not found.");

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existingUser) {
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", existingUser._id))
        .first();
      if (membership?.orgId === args.orgId) throw new Error("They are already on this team.");
      if (membership) throw new Error("That person already belongs to another team.");
    }

    // Supersede any live invite for the same address rather than stacking them, so revoking
    // one cannot leave an older token still working.
    const previous = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .collect();
    for (const old of previous) {
      if (!old.acceptedAt && !old.revokedAt) await ctx.db.patch(old._id, { revokedAt: Date.now() });
    }

    await ctx.db.insert("invites", { ...args, createdAt: Date.now() });
    return { orgName: org.name };
  },
});

export const redeemInvite = internalMutation({
  args: { clerkId: v.string(), tokenHash: v.string() },
  handler: async (ctx, args): Promise<{ orgName: string }> => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    // One message for every "this link is no good" case on purpose — distinguishing them tells
    // whoever is holding the link which guess got closer.
    const dead = "That invitation link is no longer valid. Ask for a new one.";
    if (!invite) throw new Error(dead);
    if (invite.acceptedAt || invite.revokedAt || invite.expiresAt < Date.now()) throw new Error(dead);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (!user) throw new Error("Your account is still being set up. Try again in a moment.");

    if ((user.email ?? "").toLowerCase() !== invite.email) {
      throw new Error(
        `This invitation was sent to ${invite.email}. Sign in with that address to accept it.`,
      );
    }

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) {
      if (existing.orgId === invite.orgId) {
        await ctx.db.patch(invite._id, { acceptedAt: Date.now() });
        const org = await ctx.db.get(invite.orgId);
        return { orgName: org?.name ?? "your team" };
      }
      throw new Error("You already belong to a team. Leave it before joining another.");
    }

    await ctx.db.insert("memberships", {
      orgId: invite.orgId,
      userId: user._id,
      role: invite.role,
      createdAt: Date.now(),
    });
    await ctx.db.patch(invite._id, { acceptedAt: Date.now() });

    const org = await ctx.db.get(invite.orgId);
    return { orgName: org?.name ?? "your team" };
  },
});

/**
 * Gives a brand-new account a team of its own, with them as admin, and schedules that team's
 * setup (agent, property, knowledge — agents.ensure) so it is ready before they open a page.
 * Scheduled rather than awaited: it calls ElevenLabs and takes seconds, and the Clerk webhook
 * that calls this must answer quickly or Clerk retries it. Scheduling in this same mutation
 * means the team and its setup are committed together — never a team whose setup was dropped.
 *
 * Called from the Clerk user webhook. Deliberately does nothing when the person already has a
 * membership: someone who signed up *because* they were invited must land in the inviting team,
 * not in a fresh empty one of their own.
 */
export const ensureTeamForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) {
      if (existing.role === "admin") await scheduleSetupIfMissing(ctx, existing.orgId, args.userId);
      return;
    }

    const user = await ctx.db.get(args.userId);
    if (!user) return;

    // An unaccepted invitation means this sign-up is on its way into someone else's team.
    // Creating a team here would make that impossible, since a person may only be on one.
    if (user.email) {
      const pending = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", user.email!.toLowerCase()))
        .collect();
      const live = pending.find(
        (i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > Date.now(),
      );
      if (live) return;
    }

    const now = Date.now();
    const name = user.firstName ? `${user.firstName}'s Team` : "My Team";
    const orgId: Id<"organizations"> = await ctx.db.insert("organizations", {
      name,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId: args.userId,
      role: "admin",
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.agents.ensure, { orgId, userId: args.userId });
  },
});

/**
 * For an admin whose team still has no agent — created before sign-up set teams up, or whose
 * setup failed. session.created lands here on every sign-in, so this retries on the next one.
 * The agent check is here rather than left to ensure so an ordinary sign-in schedules nothing.
 */
async function scheduleSetupIfMissing(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
) {
  const agent = await ctx.db
    .query("agents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .first();
  if (!agent) await ctx.scheduler.runAfter(0, internal.agents.ensure, { orgId, userId });
}

/** Used by the accept page to show who invited them before they commit to signing in. */
export const inviteSummary = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < Date.now()) {
      return null;
    }
    const org = await ctx.db.get(invite.orgId);
    return { orgName: org?.name ?? "a team", email: invite.email, role: invite.role };
  },
});

export const peekInvite = action({
  args: { token: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ orgName: string; email: string; role: string } | null> =>
    await ctx.runQuery(internal.team.inviteSummary, {
      tokenHash: await sha256(args.token.trim()),
    }),
});

// --- Helpers --------------------------------------------------------------

export function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  // base64url: URL-safe without percent-encoding, so the link survives email clients intact.
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Only the hash is stored, so a dump of the invites table cannot be replayed into a team. */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function inviteEmailHtml(orgName: string, link: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
      <h1 style="font-size:20px;font-weight:700;margin:0 0 12px">You have been invited to ${escapeHtml(orgName)}</h1>
      <p style="font-size:14px;line-height:22px;color:#475569;margin:0 0 24px">
        Join the team to share the same AI leasing assistant, property details, knowledge base and leads.
      </p>
      <a href="${link}" style="display:inline-block;background:#2563EB;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px">
        Accept invitation
      </a>
      <p style="font-size:12px;line-height:20px;color:#94a3b8;margin:24px 0 0">
        This link expires in 7 days and can only be used once. If you were not expecting it, you can ignore this email.
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Teardown -------------------------------------------------------------

/**
 * Everything an org owns, including the ElevenLabs ids that Convex alone cannot clean up.
 *
 * Read before deleting anything: the agent, knowledge-base documents and RAG indexes live on
 * ElevenLabs, and dropping the Convex rows first would lose the only record of what to delete
 * there — leaving a billable agent and indexes running with nothing pointing at them.
 */
export const orgFootprint = internalQuery({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org) return null;

    const agents = (await ctx.db.query("agents").collect()).filter((r) => r.orgId === args.orgId);
    const docs = (await ctx.db.query("docs").collect()).filter((r) => r.orgId === args.orgId);

    return {
      name: org.name,
      elevenLabsAgentIds: agents.map((a) => a.elevenLabsAgentId),
      kbDocs: docs.flatMap((d) =>
        d.kbDocumentId ? [{ docId: d.kbDocumentId, ragIndexId: d.ragIndexId }] : [],
      ),
    };
  },
});

/** Deletes every Convex row belonging to one org. Call only after the ElevenLabs side is gone. */
export const deleteOrgRows = internalMutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const counts: Record<string, number> = {};
    const drop = async (table: string, ids: Array<{ _id: never }>) => {
      for (const row of ids) await ctx.db.delete(row._id);
      if (ids.length) counts[table] = ids.length;
    };

    const conversations = (await ctx.db.query("conversations").collect()).filter(
      (r) => r.orgId === args.orgId,
    );
    const conversationIds = new Set(conversations.map((c) => String(c._id)));
    const elevenLabsIds = new Set(
      conversations.flatMap((c) => (c.elevenLabsConversationId ? [c.elevenLabsConversationId] : [])),
    );

    // Children first — messages and qualifications hang off conversations and have no orgId of
    // their own, so deleting the parents first would strand them permanently.
    await drop(
      "messages",
      (await ctx.db.query("messages").collect()).filter((m) =>
        conversationIds.has(String(m.conversationId)),
      ) as never[],
    );
    await drop(
      "qualifications",
      (await ctx.db.query("qualifications").collect()).filter((q) =>
        elevenLabsIds.has(q.elevenLabsConversationId),
      ) as never[],
    );
    await drop("conversations", conversations as never[]);

    for (const table of [
      "agents",
      "docs",
      "properties",
      "screeningQuestions",
      "screeningBuiltins",
      "tenantIssues",
      "tours",
    ] as const) {
      const rows = (await ctx.db.query(table).collect()).filter((r) => r.orgId === args.orgId);
      await drop(table, rows as never[]);
    }

    await drop(
      "memberships",
      (await ctx.db
        .query("memberships")
        .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
        .collect()) as never[],
    );
    await drop(
      "invites",
      (await ctx.db
        .query("invites")
        .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
        .collect()) as never[],
    );

    await ctx.db.delete(args.orgId);
    counts.organizations = 1;
    return counts;
  },
});

/** Resolves who is being purged, and what that implies, before anything is destroyed. */
export const purgePlan = internalQuery({
  args: { userId: v.optional(v.id("users")), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = args.userId
      ? await ctx.db.get(args.userId)
      : args.email
        ? await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email!.toLowerCase()))
            .first()
        : null;
    if (!user) return null;

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    return {
      userId: user._id,
      email: user.email ?? null,
      role: membership?.role ?? null,
      orgId: membership?.orgId ?? null,
      // An admin owns the team, and there is no ownership transfer — so removing them takes the
      // team with it. A member only loses their own seat.
      deletesTeam: membership?.role === "admin",
    };
  },
});

/** Deletes the user row plus anything keyed to them that a team deletion did not already take. */
export const deleteUserRows = internalMutation({
  args: { userId: v.id("users"), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    for (const m of await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()) {
      await ctx.db.delete(m._id);
    }

    // Invitations addressed to them. Left behind, a live one would make ensureTeamForUser skip
    // creating a team the next time they sign up, stranding them with no team at all.
    if (args.email) {
      for (const invite of await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", args.email!.toLowerCase()))
        .collect()) {
        await ctx.db.delete(invite._id);
      }
    }

    // purgeUser revokes and removes the Google connection first; this sweeps what is left.
    for (const table of ["googleCalendarConnections", "googleOAuthStates", "tourAvailability"] as const) {
      for (const row of await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect()) {
        await ctx.db.delete(row._id);
      }
    }

    await ctx.db.delete(args.userId);
  },
});

/**
 * Removes a person completely, so the same email can be invited fresh afterwards.
 *
 * An admin's deletion takes their team and everything it owns with it — there is no ownership
 * transfer, so the alternative is a team nobody can administer. A member's deletion only frees
 * their seat.
 *
 * An action rather than a mutation because the ElevenLabs agent, knowledge-base documents and
 * RAG indexes have to be deleted over the network; leaving those behind is what makes a
 * "deleted" account keep costing money.
 *
 * internalAction, emphatically not a public one: this takes no caller identity and deletes an
 * entire team by email. Exposed publicly it would let any client destroy any account's data.
 * `npx convex run` reaches internal functions, so operators keep access and clients do not.
 *
 * Run it with:  npx convex run team:purgeUser '{"email":"someone@example.com"}'
 */
export const purgeUser = internalAction({
  args: {
    userId: v.optional(v.id("users")),
    email: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const plan = await ctx.runQuery(internal.team.purgePlan, {
      userId: args.userId,
      email: args.email,
    });
    if (!plan) return { found: false };

    const footprint = plan.orgId
      ? await ctx.runQuery(internal.team.orgFootprint, { orgId: plan.orgId })
      : null;

    if (args.dryRun) {
      return { dryRun: true, plan, wouldDeleteFromElevenLabs: plan.deletesTeam ? footprint : null };
    }

    // Their Google tokens are revoked at Google, not just dropped here — a deleted account
    // should not leave Simplr holding working access to someone's calendar.
    await ctx.runAction(internal.googleCalendar.forgetUser, { userId: plan.userId });

    const elevenLabs = { agents: 0, kbDocs: 0, failures: [] as string[] };

    if (plan.deletesTeam && plan.orgId && footprint) {
      // ElevenLabs first, while the Convex rows still record what to delete there.
      for (const doc of footprint.kbDocs) {
        try {
          await el.deleteKbDoc(doc.docId, doc.ragIndexId);
          elevenLabs.kbDocs += 1;
        } catch (err) {
          elevenLabs.failures.push(`kb ${doc.docId}: ${err instanceof Error ? err.message : err}`);
        }
      }
      for (const agentId of footprint.elevenLabsAgentIds) {
        try {
          await el.deleteAgent(agentId);
          elevenLabs.agents += 1;
        } catch (err) {
          elevenLabs.failures.push(`agent ${agentId}: ${err instanceof Error ? err.message : err}`);
        }
      }

      const rows = await ctx.runMutation(internal.team.deleteOrgRows, { orgId: plan.orgId });
      await ctx.runMutation(internal.team.deleteUserRows, {
        userId: plan.userId,
        email: plan.email ?? undefined,
      });
      return { deletedTeam: footprint.name, convexRows: rows, elevenLabs };
    }

    await ctx.runMutation(internal.team.deleteUserRows, {
      userId: plan.userId,
      email: plan.email ?? undefined,
    });
    return { deletedTeam: null, removedSeatOnly: true, elevenLabs };
  },
});

/** Webhook entry point — same teardown as purgeUser, addressed by Clerk id. */
export const purgeByClerkId = internalAction({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.runQuery(internal.users.byClerkId, { clerkId: args.clerkId });
    if (!user) return;
    await ctx.runAction(internal.team.purgeUser, { userId: user._id });
  },
});

/**
 * Tears down one team directly, by name or id.
 *
 * purgeUser only reaches a team through its admin's membership, so a team whose members have
 * all been removed is unreachable that way — exactly the state a deleted owner used to leave
 * behind. This is the way out of it, and the way to delete a team deliberately.
 *
 * internal for the same reason purgeUser is — it deletes a whole team by name, with no caller
 * check of any kind.
 */
export const purgeOrg = internalAction({
  args: {
    orgId: v.optional(v.id("organizations")),
    name: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const orgId =
      args.orgId ??
      (await ctx.runQuery(internal.team.orgIdByName, { name: args.name ?? "" })) ??
      null;
    if (!orgId) return { found: false };

    const footprint = await ctx.runQuery(internal.team.orgFootprint, { orgId });
    if (!footprint) return { found: false };

    if (args.dryRun) return { dryRun: true, orgId, footprint };

    const elevenLabs = { agents: 0, kbDocs: 0, failures: [] as string[] };
    for (const doc of footprint.kbDocs) {
      try {
        await el.deleteKbDoc(doc.docId, doc.ragIndexId);
        elevenLabs.kbDocs += 1;
      } catch (err) {
        elevenLabs.failures.push(`kb ${doc.docId}: ${err instanceof Error ? err.message : err}`);
      }
    }
    for (const agentId of footprint.elevenLabsAgentIds) {
      try {
        await el.deleteAgent(agentId);
        elevenLabs.agents += 1;
      } catch (err) {
        elevenLabs.failures.push(`agent ${agentId}: ${err instanceof Error ? err.message : err}`);
      }
    }

    const rows = await ctx.runMutation(internal.team.deleteOrgRows, { orgId });
    return { deletedTeam: footprint.name, convexRows: rows, elevenLabs };
  },
});

export const orgIdByName = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const org = (await ctx.db.query("organizations").collect()).find((o) => o.name === args.name);
    return org?._id ?? null;
  },
});

// --- Pending invite for the signed-in person ------------------------------

/**
 * The invitation waiting for whoever is signed in, if any.
 *
 * Matching on the account's own email rather than on a token is deliberate. The token proves
 * "you received the email"; a signed-in Clerk account proves "you own the address", which is
 * the stronger claim of the two. Requiring the token as well means an invitee who signs up
 * through any other route — the link dropped, they went to the app directly, they signed up
 * first and clicked later — ends up on a team-less dashboard with nothing telling them why.
 */
export const myPendingInvite = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user?.email) return null;

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (membership) return null; // already on a team; nothing to offer

    const invite = (
      await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", user.email!.toLowerCase()))
        .collect()
    ).find((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > Date.now());
    if (!invite) return null;

    const org = await ctx.db.get(invite.orgId);
    return { orgName: org?.name ?? "a team", role: invite.role };
  },
});

/** Joins the team that invited this account. Same checks as redeemInvite, minus the token. */
export const acceptPendingInvite = mutation({
  args: {},
  handler: async (ctx): Promise<{ orgName: string }> => {
    const user = await requireUser(ctx);
    const email = user.email?.toLowerCase();
    if (!email) throw new Error("Your account has no email address to match an invite to.");

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) throw new Error("You already belong to a team.");

    const invite = (
      await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect()
    ).find((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > Date.now());
    if (!invite) throw new Error("There is no invitation waiting for this account.");

    await ctx.db.insert("memberships", {
      orgId: invite.orgId,
      userId: user._id,
      role: invite.role,
      createdAt: Date.now(),
    });
    await ctx.db.patch(invite._id, { acceptedAt: Date.now() });

    const org = await ctx.db.get(invite.orgId);
    return { orgName: org?.name ?? "your team" };
  },
});
