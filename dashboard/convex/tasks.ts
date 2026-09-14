import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { currentOrg, requireOrg } from "./authz";

async function ownedTask(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
  orgId: string,
): Promise<Doc<"tasks">> {
  const task = await ctx.db.get(taskId);
  if (!task || task.orgId !== orgId) throw new Error("Task not found.");
  return task;
}

/** The signed-in team's tasks. Empty (not an error) when signed out. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const org = await currentOrg(ctx);
    if (!org) return [];
    return ctx.db
      .query("tasks")
      .withIndex("by_org", (q) => q.eq("orgId", org.orgId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("todo"), v.literal("in_progress"), v.literal("completed")),
    ),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    category: v.optional(v.string()),
    assignee: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireOrg(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Task title is required.");

    const now = Date.now();
    return ctx.db.insert("tasks", {
      orgId,
      userId: user._id,
      title,
      description: args.description?.trim() || undefined,
      status: args.status ?? "todo",
      priority: args.priority,
      category: args.category?.trim() || undefined,
      assignee: args.assignee?.trim() || undefined,
      dueDate: args.dueDate,
      tags: args.tags?.length ? args.tags : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Toggles a task between its current status and "completed" — the list view's checkbox. The
 * detail panel instead uses `update` below to set any of the three statuses directly. */
export const toggleComplete = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    const task = await ownedTask(ctx, args.taskId, orgId);
    await ctx.db.patch(args.taskId, {
      status: task.status === "completed" ? "todo" : "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Patches whichever fields the detail panel edited. Every field is optional so a single edit
 * (e.g. just the priority dropdown) doesn't require resending the whole task; `clearDueDate`
 * exists separately from `dueDate` because "not provided" and "clear this field" are different
 * requests and v.optional can't tell them apart on its own.
 */
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("todo"), v.literal("in_progress"), v.literal("completed")),
    ),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    assignee: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    clearDueDate: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    await ownedTask(ctx, args.taskId, orgId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Task title is required.");
      patch.title = title;
    }
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.status !== undefined) patch.status = args.status;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.assignee !== undefined) patch.assignee = args.assignee.trim() || undefined;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.clearDueDate) patch.dueDate = undefined;
    else if (args.dueDate !== undefined) patch.dueDate = args.dueDate;

    await ctx.db.patch(args.taskId, patch);
  },
});

// --- Comments ---------------------------------------------------------------

/** A task's comment thread, oldest first. Scoped through the task's own org rather than a
 * separate orgId column on the comment — a comment has no existence apart from its task. */
export const comments = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const org = await currentOrg(ctx);
    if (!org) return [];
    const task = await ctx.db.get(args.taskId);
    if (!task || task.orgId !== org.orgId) return [];

    return ctx.db
      .query("taskComments")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
  },
});

export const addComment = mutation({
  args: { taskId: v.id("tasks"), text: v.string() },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireOrg(ctx);
    await ownedTask(ctx, args.taskId, orgId);

    const text = args.text.trim();
    if (!text) throw new Error("Comment can't be empty.");

    const authorName =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.email ||
      "Someone";

    return ctx.db.insert("taskComments", {
      taskId: args.taskId,
      authorName,
      authorUserId: user._id,
      text,
      createdAt: Date.now(),
    });
  },
});
