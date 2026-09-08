import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import * as el from "./elevenLabsApi";
import { currentUser, requireUser, requireUserId } from "./authz";

// Shared with cloneDefaultsForUser below, so the two never drift into disagreeing on which
// title marks a doc as generated rather than authored content worth cloning verbatim.
const PROPERTY_DOC_TITLE = "Property details (auto-generated)";

// --- Reads ----------------------------------------------------------------

/** The signed-in user's own knowledge base. Empty (not an error) when signed out. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return [];
    return ctx.db
      .query("docs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const syncedEntries = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("docs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return docs
      .filter((d) => d.kbDocumentId !== undefined)
      .map((d) => ({
        type: "text" as const,
        id: d.kbDocumentId!,
        name: d.title,
        usage_mode: "auto" as const,
      }));
  },
});

/**
 * Seeds a brand-new user's knowledge base as a copy of the template's — see
 * agents.templateOwnerId. A no-op if this user already has any docs (never clobbers real
 * work) or if there's no template to copy from (a from-scratch install with nothing to clone).
 *
 * The auto-generated property doc is skipped on purpose: it's derived, not authored, and
 * properties.cloneForUser regenerates this user's own copy of it from their own (also cloned)
 * property row instead — cloning it verbatim here would only be correct until either property
 * was next edited.
 *
 * Each cloned doc goes through the normal syncDoc → pollRagIndex → pushKnowledgeBase pipeline,
 * the same as a doc saved by hand — there is no shortcut for "this text is already indexed
 * somewhere," since ElevenLabs KB documents aren't shared across agents.
 */
export const cloneDefaultsForUser = internalMutation({
  args: { userId: v.id("users"), templateUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("docs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const templateUserId = args.templateUserId;
    if (existing || !templateUserId) return;

    const templateDocs = await ctx.db
      .query("docs")
      .withIndex("by_user", (q) => q.eq("userId", templateUserId))
      .collect();

    const now = Date.now();
    for (const doc of templateDocs) {
      if (doc.title === PROPERTY_DOC_TITLE) continue;
      const docId = await ctx.db.insert("docs", {
        userId: args.userId,
        title: doc.title,
        body: doc.body,
        syncState: "pending",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.docs.syncDoc, { docId });
    }
  },
});

/**
 * Plain title+body text for grounding the SMS bot — distinct from syncedEntries, which
 * returns ElevenLabs KB references for the voice agent.
 *
 * Deliberately NOT scoped by user: the SMS/WhatsApp bot predates multi-tenancy and remains
 * the single self-contained island described at the top of schema.ts, reading across every
 * user's synced docs rather than one owner's. Scoping it is a real, separate decision — it
 * wasn't part of what "Leads, Tenants, Knowledge, Property, Agent" asked for, so it stays as
 * it was rather than silently changing WhatsApp's behavior as a side effect of this migration.
 */
export const syncedTextInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("docs").filter((q) => q.eq(q.field("syncState"), "synced")).collect();
    return docs.map((d) => ({ title: d.title, body: d.body }));
  },
});

// --- Writes ---------------------------------------------------------------

/**
 * Saving a doc schedules its sync immediately. The write returns as soon as the row lands so
 * the editor stays responsive; the badge tracks the sync from there.
 */
export const save = mutation({
  args: {
    id: v.optional(v.id("docs")),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    let docId = args.id;

    if (docId) {
      const existing = await ctx.db.get(docId);
      // A docId for someone else's doc, or one that's gone — either way, not this write's to make.
      if (!existing || existing.userId !== user._id) throw new Error("Doc not found.");
      await ctx.db.patch(docId, {
        title: args.title,
        body: args.body,
        syncState: "pending",
        syncError: undefined,
        updatedAt: now,
      });
    } else {
      docId = await ctx.db.insert("docs", {
        userId: user._id,
        title: args.title,
        body: args.body,
        syncState: "pending",
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.docs.syncDoc, { docId });
    return docId;
  },
});

export const remove = action({
  args: { docId: v.id("docs") },
  handler: async (ctx, args): Promise<void> => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.runQuery(internal.docs.getInternal, { docId: args.docId });
    if (!doc || doc.userId !== userId) return;

    if (doc.kbDocumentId) {
      await el.deleteKbDoc(doc.kbDocumentId, doc.ragIndexId);
    }
    await ctx.runMutation(internal.docs.deleteRow, { docId: args.docId });
    await ctx.runAction(internal.agents.pushKnowledgeBase, { userId });
  },
});

// --- Sync pipeline --------------------------------------------------------

/**
 * Pushes one doc to the ElevenLabs knowledge base and kicks off RAG indexing.
 *
 * Replace-on-edit rather than update-in-place: the text endpoint creates documents, it does
 * not revise them, so an edited doc becomes a new KB document and the old one is dropped.
 */
export const syncDoc = internalAction({
  args: { docId: v.id("docs") },
  handler: async (ctx, args): Promise<void> => {
    const doc = await ctx.runQuery(internal.docs.getInternal, { docId: args.docId });
    if (!doc) return;

    try {
      if (doc.kbDocumentId) {
        await el
          .deleteKbDoc(doc.kbDocumentId, doc.ragIndexId)
          .catch(() => {/* stale id; the fresh upload below is what matters */});
      }

      const created = await el.createKbDocFromText(doc.body, doc.title);
      const index = await el.computeRagIndex(created.id);

      await ctx.runMutation(internal.docs.markSync, {
        docId: args.docId,
        kbDocumentId: created.id,
        ragIndexId: index.id,
        syncState: "indexing",
      });

      // Indexing is asynchronous; the agent cannot retrieve from the doc until it succeeds.
      await ctx.scheduler.runAfter(2000, internal.docs.pollRagIndex, { docId: args.docId });
    } catch (err) {
      await ctx.runMutation(internal.docs.markSync, {
        docId: args.docId,
        syncState: "failed",
        syncError: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

export const pollRagIndex = internalAction({
  args: { docId: v.id("docs"), attempt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<void> => {
    const attempt = args.attempt ?? 0;
    const doc = await ctx.runQuery(internal.docs.getInternal, { docId: args.docId });
    if (!doc?.kbDocumentId) return;

    try {
      const { indexes } = await el.getRagIndexes(doc.kbDocumentId);
      const index = indexes.find((i) => i.id === doc.ragIndexId) ?? indexes[0];

      if (index?.status === "succeeded") {
        await ctx.runMutation(internal.docs.markSync, {
          docId: args.docId,
          syncState: "synced",
        });
        // Only now is the doc actually answerable, so attach it to the agent. doc.userId is
        // always set by this point — every doc that can reach a synced state was created
        // through docs.save or syncPropertyDoc, both of which stamp it at insert time.
        if (doc.userId) await ctx.runAction(internal.agents.pushKnowledgeBase, { userId: doc.userId });
        return;
      }

      if (index?.status === "failed" || attempt > 20) {
        await ctx.runMutation(internal.docs.markSync, {
          docId: args.docId,
          syncState: "failed",
          syncError:
            index?.status === "failed"
              ? "RAG indexing failed at ElevenLabs."
              : "RAG indexing timed out after ~40s.",
        });
        return;
      }

      await ctx.scheduler.runAfter(2000, internal.docs.pollRagIndex, {
        docId: args.docId,
        attempt: attempt + 1,
      });
    } catch (err) {
      await ctx.runMutation(internal.docs.markSync, {
        docId: args.docId,
        syncState: "failed",
        syncError: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

/**
 * Keeps a KB document in sync with the property table, so a standalone question like "what's
 * the rent for a 2BR?" is answerable straight from the knowledge base without requiring the
 * agent to first gather all five qualification fields.
 */
export const syncPropertyDoc = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!property) return;

    const title = PROPERTY_DOC_TITLE;
    const body = [
      `${property.name}. Pets ${property.petsAllowed ? "allowed" : "not allowed"}. Move-in window: within ${property.moveInWindowDays} days.`,
      "Available units:",
      ...property.units.map(
        (u) =>
          `${u.bedrooms}: $${u.rentMin}-$${u.rentMax}/mo${u.available ? "" : " (currently unavailable)"}`,
      ),
    ].join("\n");

    // Scoped to this user's own docs: two different users' properties both produce a doc
    // titled "Property details (auto-generated)", and without the userId filter this would
    // find and overwrite whichever one happened to exist first.
    const existing = await ctx.db
      .query("docs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("title"), title))
      .first();

    let docId;
    if (existing) {
      docId = existing._id;
      await ctx.db.patch(docId, {
        body,
        syncState: "pending",
        syncError: undefined,
        updatedAt: Date.now(),
      });
    } else {
      docId = await ctx.db.insert("docs", {
        userId: args.userId,
        title,
        body,
        syncState: "pending",
        updatedAt: Date.now(),
      });
    }

    await ctx.scheduler.runAfter(0, internal.docs.syncDoc, { docId });
  },
});

// --- Internal helpers -----------------------------------------------------

export const getInternal = internalQuery({
  args: { docId: v.id("docs") },
  handler: (ctx, args) => ctx.db.get(args.docId),
});

export const deleteRow = internalMutation({
  args: { docId: v.id("docs") },
  handler: (ctx, args) => ctx.db.delete(args.docId),
});

export const markSync = internalMutation({
  args: {
    docId: v.id("docs"),
    kbDocumentId: v.optional(v.string()),
    ragIndexId: v.optional(v.string()),
    syncState: v.union(
      v.literal("pending"),
      v.literal("indexing"),
      v.literal("synced"),
      v.literal("failed"),
    ),
    syncError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { docId, ...rest } = args;
    const patch: Record<string, unknown> = { syncState: rest.syncState };
    if (rest.kbDocumentId !== undefined) patch.kbDocumentId = rest.kbDocumentId;
    if (rest.ragIndexId !== undefined) patch.ragIndexId = rest.ragIndexId;
    patch.syncError = rest.syncError;
    await ctx.db.patch(docId, patch);
  },
});
