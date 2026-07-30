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

// --- Reads ----------------------------------------------------------------

export const list = query({
  args: {},
  handler: (ctx) => ctx.db.query("docs").order("desc").collect(),
});

export const syncedEntries = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("docs").collect();
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

/** Plain title+body text for grounding the SMS bot — distinct from syncedEntries, which
 * returns ElevenLabs KB references for the voice agent. */
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
    const now = Date.now();
    let docId = args.id;

    if (docId) {
      await ctx.db.patch(docId, {
        title: args.title,
        body: args.body,
        syncState: "pending",
        syncError: undefined,
        updatedAt: now,
      });
    } else {
      docId = await ctx.db.insert("docs", {
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
    const doc = await ctx.runQuery(internal.docs.getInternal, { docId: args.docId });
    if (!doc) return;

    if (doc.kbDocumentId) {
      await el.deleteKbDoc(doc.kbDocumentId, doc.ragIndexId);
    }
    await ctx.runMutation(internal.docs.deleteRow, { docId: args.docId });
    await ctx.runAction(internal.agents.pushKnowledgeBase, {});
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
        // Only now is the doc actually answerable, so attach it to the agent.
        await ctx.runAction(internal.agents.pushKnowledgeBase, {});
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
  args: {},
  handler: async (ctx) => {
    const property = await ctx.db.query("properties").first();
    if (!property) return;

    const title = "Property details (auto-generated)";
    const body = [
      `${property.name}. Pets ${property.petsAllowed ? "allowed" : "not allowed"}. Move-in window: within ${property.moveInWindowDays} days.`,
      "Available units:",
      ...property.units.map(
        (u) =>
          `${u.bedrooms}: $${u.rentMin}-$${u.rentMax}/mo${u.available ? "" : " (currently unavailable)"}`,
      ),
    ].join("\n");

    const existing = await ctx.db
      .query("docs")
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
      docId = await ctx.db.insert("docs", { title, body, syncState: "pending", updatedAt: Date.now() });
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
