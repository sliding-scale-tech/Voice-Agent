"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlignLeft,
  AtSign,
  Bold,
  Calendar,
  ChevronDown,
  Italic,
  Link as LinkIcon,
  List as ListIcon,
  Paperclip,
  Plus,
  Send,
  Tag,
  User,
  X,
} from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/toast";

type Status = "todo" | "in_progress" | "completed";
type Priority = "low" | "medium" | "high";

type Task = {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  category?: string;
  assignee?: string;
  dueDate?: number;
  tags?: string[];
};

type Comment = {
  _id: Id<"taskComments">;
  authorName: string;
  text: string;
  createdAt: number;
};

const STATUS_META: Record<Status, { label: string; dotClassName: string }> = {
  in_progress: { label: "In Progress", dotClassName: "bg-blue-500" },
  todo: { label: "Todo", dotClassName: "bg-slate-300" },
  completed: { label: "Completed", dotClassName: "bg-emerald-500" },
};

const GROUPS: Array<{ status: Task["status"]; label: string; dotClassName: string }> = [
  { status: "in_progress", label: "In Progress", dotClassName: "bg-blue-500 shadow-[0_0_0_4px_rgba(219,234,254,1)]" },
  { status: "todo", label: "Todo", dotClassName: "bg-slate-300 shadow-[0_0_0_4px_rgba(241,245,249,1)]" },
  { status: "completed", label: "Completed", dotClassName: "bg-emerald-500 shadow-[0_0_0_4px_rgba(209,250,229,1)]" },
];

const PRIORITY_STYLES: Record<Task["priority"], string> = {
  high: "bg-rose-50 text-rose-600 border border-rose-100",
  medium: "bg-amber-50 text-amber-700 border border-amber-100",
  low: "bg-emerald-50 text-emerald-600 border border-emerald-100",
};

const CATEGORY_TONES = [
  "bg-blue-50 text-blue-600",
  "bg-purple-50 text-purple-600",
  "bg-cyan-50 text-cyan-600",
  "bg-fuchsia-50 text-fuchsia-600",
  "bg-orange-50 text-orange-600",
];

const AVATAR_TONES = [
  "bg-slate-200 text-slate-600",
  "bg-indigo-100 text-indigo-700",
  "bg-purple-100 text-purple-700",
  "bg-blue-100 text-blue-700",
];

function hashIndex(value: string, length: number) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % length;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDueDate(dueDate?: number) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(due, today)) return "Today";
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(due, tomorrow)) return "Tomorrow";
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TasksPage() {
  const tasks = useQuery(api.tasks.list) as Task[] | undefined;
  const toggleComplete = useMutation(api.tasks.toggleComplete);
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"tasks"> | null>(null);

  const grouped = GROUPS.map((group) => ({
    ...group,
    tasks: (tasks ?? []).filter((t) => t.status === group.status),
  }));
  const selectedTask = tasks?.find((t) => t._id === selectedId) ?? null;

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tasks</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
            Create and manage tasks for your team. Keep track of what needs to be done.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New task
        </button>
      </header>

      {tasks?.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
          No tasks yet. Add one to start tracking what your team needs to do.
        </div>
      ) : null}

      <div className="flex flex-col items-start gap-6 xl:flex-row">
        <div className="flex w-full flex-col gap-4 xl:flex-1">
          {grouped.map((group) =>
            group.tasks.length === 0 && tasks?.length === 0 ? null : (
              <TaskGroup
                key={group.status}
                label={group.label}
                dotClassName={group.dotClassName}
                tasks={group.tasks}
                selectedId={selectedId}
                onToggle={(id) => void toggleComplete({ taskId: id })}
                onSelect={setSelectedId}
              />
            ),
          )}
        </div>

        {selectedTask ? (
          <div className="w-full shrink-0 xl:sticky xl:top-6 xl:w-[420px]">
            <TaskDetailPanel task={selectedTask} onClose={() => setSelectedId(null)} />
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {modalOpen ? (
          <NewTaskModal
            onClose={() => setModalOpen(false)}
            onCreated={() => {
              toast("Task added");
              setModalOpen(false);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TaskGroup({
  label,
  dotClassName,
  tasks,
  selectedId,
  onToggle,
  onSelect,
}: {
  label: string;
  dotClassName: string;
  tasks: Task[];
  selectedId: Id<"tasks"> | null;
  onToggle: (id: Id<"tasks">) => void;
  onSelect: (id: Id<"tasks">) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between border-b border-border/70 bg-muted/30 px-4 py-3"
      >
        <div className="flex items-center gap-2.5">
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <span className={`h-2.5 w-2.5 rounded-full ${dotClassName}`} />
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <span className="text-sm font-medium text-muted-foreground">{tasks.length}</span>
        </div>
      </button>

      {!collapsed ? (
        tasks.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing here.</div>
        ) : (
          <div className="flex flex-col">
            {tasks.map((task, index) => (
              <TaskRow
                key={task._id}
                task={task}
                bordered={index > 0}
                selected={task._id === selectedId}
                onToggle={() => onToggle(task._id)}
                onSelect={() => onSelect(task._id)}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  bordered,
  selected,
  onToggle,
  onSelect,
}: {
  task: Task;
  bordered: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const done = task.status === "completed";
  const due = formatDueDate(task.dueDate);
  const categoryTone = task.category ? CATEGORY_TONES[hashIndex(task.category, CATEGORY_TONES.length)] : null;
  const avatarTone = task.assignee ? AVATAR_TONES[hashIndex(task.assignee, AVATAR_TONES.length)] : AVATAR_TONES[0];

  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
        bordered ? "border-t border-border/70" : ""
      } ${selected ? "bg-primary/5" : "hover:bg-muted/30"}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          aria-label={done ? "Mark as not done" : "Mark as done"}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
            done ? "border-primary bg-primary" : "border-input hover:border-primary"
          }`}
        >
          {done ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /> : null}
        </button>
        <span
          className={`truncate text-sm ${
            done ? "text-muted-foreground line-through" : "font-medium text-foreground"
          }`}
        >
          {task.title}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <span className={`rounded px-2 py-1 text-[11px] font-medium ${PRIORITY_STYLES[task.priority]}`}>
          {task.priority[0].toUpperCase() + task.priority.slice(1)}
        </span>
        {task.category ? (
          <span className={`rounded px-2.5 py-1 text-[11px] font-medium ${categoryTone}`}>{task.category}</span>
        ) : null}
        {task.assignee ? (
          <span
            title={task.assignee}
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${avatarTone}`}
          >
            {initials(task.assignee)}
          </span>
        ) : null}
        <span className="w-12 text-right text-xs text-muted-foreground">{due ?? ""}</span>
      </div>
    </div>
  );
}

function relativeTime(at: number) {
  const deltaMs = Math.max(0, Date.now() - at);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function toDateInputValue(ms?: number) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function TaskDetailPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const update = useMutation(api.tasks.update);
  const toggleComplete = useMutation(api.tasks.toggleComplete);
  const comments = useQuery(api.tasks.comments, { taskId: task._id }) as Comment[] | undefined;
  const addComment = useMutation(api.tasks.addComment);
  const toast = useToast();

  const [description, setDescription] = useState(task.description ?? "");
  const [assignee, setAssignee] = useState(task.assignee ?? "");
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [comment, setComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  const patch = async (fields: Parameters<typeof update>[0]) => {
    try {
      await update(fields);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the task.", "error");
    }
  };

  const tags = task.tags ?? [];

  const handleAddTag = async () => {
    const value = newTag.trim();
    if (!value || tags.includes(value)) {
      setNewTag("");
      setAddingTag(false);
      return;
    }
    await patch({ taskId: task._id, tags: [...tags, value] });
    setNewTag("");
    setAddingTag(false);
  };

  const handleRemoveTag = async (tag: string) => {
    await patch({ taskId: task._id, tags: tags.filter((t) => t !== tag) });
  };

  const handleSendComment = async () => {
    const text = comment.trim();
    if (!text) return;
    setSendingComment(true);
    try {
      await addComment({ taskId: task._id, text });
      setComment("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not post that comment.", "error");
    } finally {
      setSendingComment(false);
    }
  };

  return (
    <motion.div
      key={task._id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      className="flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => void toggleComplete({ taskId: task._id })}
            aria-label={task.status === "completed" ? "Mark as not done" : "Mark as done"}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
              task.status === "completed" ? "border-primary bg-primary" : "border-input hover:border-primary"
            }`}
          >
            {task.status === "completed" ? (
              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
            ) : null}
          </button>
          <h2 className="text-base font-bold leading-tight text-foreground">{task.title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-5 px-5 py-5">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => {
              if (description.trim() !== (task.description ?? "")) {
                void patch({ taskId: task._id, description });
              }
            }}
            placeholder="Add a description…"
            rows={3}
            className="w-full resize-none rounded-lg border-0 bg-transparent p-0 text-sm leading-6 text-muted-foreground outline-none placeholder:text-muted-foreground-subtle"
          />

          <div className="grid grid-cols-[88px_1fr] items-center gap-y-4 text-sm">
            <span className="text-muted-foreground">Status</span>
            <div className="relative">
              <select
                value={task.status}
                onChange={(event) =>
                  void patch({ taskId: task._id, status: event.target.value as Status })
                }
                className="h-9 w-full appearance-none rounded-lg border border-input bg-card pl-3 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-ring/20"
              >
                {(Object.keys(STATUS_META) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>

            <span className="text-muted-foreground">Priority</span>
            <div className="relative">
              <select
                value={task.priority}
                onChange={(event) =>
                  void patch({ taskId: task._id, priority: event.target.value as Priority })
                }
                className="h-9 w-full appearance-none rounded-lg border border-input bg-card pl-3 pr-8 text-sm font-medium capitalize outline-none focus:ring-2 focus:ring-ring/20"
              >
                {(["low", "medium", "high"] as const).map((p) => (
                  <option key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>

            <span className="text-muted-foreground">Assignee</span>
            <input
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              onBlur={() => {
                if (assignee.trim() !== (task.assignee ?? "")) {
                  void patch({ taskId: task._id, assignee });
                }
              }}
              placeholder="Unassigned"
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            />

            <span className="text-muted-foreground">Due date</span>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={toDateInputValue(task.dueDate)}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;
                    void patch({ taskId: task._id, dueDate: new Date(value).getTime() });
                  }}
                  className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              {task.dueDate ? (
                <button
                  type="button"
                  onClick={() => void patch({ taskId: task._id, clearDueDate: true })}
                  aria-label="Clear due date"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <span className="text-muted-foreground">Tags</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => void handleRemoveTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    className="text-blue-400 hover:text-blue-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {addingTag ? (
                <input
                  autoFocus
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  onBlur={() => void handleAddTag()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleAddTag();
                    if (event.key === "Escape") {
                      setNewTag("");
                      setAddingTag(false);
                    }
                  }}
                  placeholder="Tag name"
                  className="h-7 w-24 rounded border border-input bg-card px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring/20"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingTag(true)}
                  className="flex items-center gap-1 rounded border border-dashed border-input px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                >
                  <Tag className="h-3 w-3" />
                  Add tag
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Comments</h3>
            <span className="text-sm text-muted-foreground">{comments?.length ?? 0}</span>
          </div>

          <div className="space-y-4">
            {(comments ?? []).map((c) => {
              const tone = AVATAR_TONES[hashIndex(c.authorName, AVATAR_TONES.length)];
              return (
                <div key={c._id} className="flex items-start gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${tone}`}
                  >
                    {initials(c.authorName)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-foreground">{c.authorName}</span>
                      <span className="text-xs text-muted-foreground">{relativeTime(c.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-sm leading-5 text-foreground/90">{c.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-5 py-3">
        <input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleSendComment();
          }}
          placeholder="Write a comment…"
          className="h-10 flex-1 rounded-full border border-input bg-card px-4 text-sm outline-none focus:ring-2 focus:ring-ring/20"
        />
        <button
          type="button"
          onClick={() => void handleSendComment()}
          disabled={sendingComment || !comment.trim()}
          aria-label="Send comment"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

const PRIORITY_DOT: Record<Priority, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-rose-500",
};

/** Cosmetic-only toolbar to match the Create task mockup — this page has no rich-text or
 * file-attachment backend, so these buttons are visual affordance, not wired to anything. */
function DescriptionToolbar() {
  const icons = [Bold, Italic, LinkIcon, AlignLeft, ListIcon, AtSign];
  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-2">
      <div className="flex items-center gap-1">
        {icons.map((Icon, i) => (
          <span
            key={i}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground-subtle"
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ))}
      </div>
      <span className="flex items-center gap-1.5 rounded-md border border-dashed border-input px-2.5 py-1 text-xs text-muted-foreground-subtle">
        <Paperclip className="h-3.5 w-3.5" />
        Attach files
      </span>
    </div>
  );
}

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const create = useMutation(api.tasks.create);
  const members = useQuery(api.team.overview)?.members;
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleAddTag = () => {
    const value = newTag.trim();
    if (value && !tags.includes(value)) setTags((current) => [...current, value]);
    setNewTag("");
    setAddingTag(false);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await create({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        assignee: assignee || undefined,
        dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
        tags: tags.length ? tags : undefined,
      });
      onCreated();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that task.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 className="text-lg font-bold">Create task</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Task title…"
            autoFocus
            className="h-11 w-full rounded-xl border border-input bg-card px-3 text-base font-medium outline-none placeholder:text-muted-foreground-subtle placeholder:font-normal focus:ring-2 focus:ring-ring/20"
          />

          <div className="overflow-hidden rounded-xl border border-input">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a description, details, or instructions…"
              rows={4}
              className="w-full resize-none border-0 bg-card px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground-subtle"
            />
            <DescriptionToolbar />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Status</span>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${STATUS_META[status].dotClassName}`} />
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as Status)}
                  className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-7 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {(Object.keys(STATUS_META) as Status[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Priority</span>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${PRIORITY_DOT[priority]}`} />
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as Priority)}
                  className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-7 pr-8 text-sm font-medium capitalize outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {(["low", "medium", "high"] as const).map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Assignee</span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring/20"
                >
                  <option value="">Unassigned</option>
                  {(members ?? []).map((m) => (
                    <option key={m.userId} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Due date</span>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </label>

            <div className="block">
              <span className="mb-2 block text-sm font-medium">Labels</span>
              <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-card px-2 py-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags((current) => current.filter((t) => t !== tag))}
                      aria-label={`Remove tag ${tag}`}
                      className="text-blue-400 hover:text-blue-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {addingTag ? (
                  <input
                    autoFocus
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    onBlur={handleAddTag}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleAddTag();
                      if (event.key === "Escape") {
                        setNewTag("");
                        setAddingTag(false);
                      }
                    }}
                    placeholder="Tag name"
                    className="h-7 w-20 rounded border border-input bg-card px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring/20"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingTag(true)}
                    className="flex items-center gap-1 rounded border border-dashed border-input px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                  >
                    <Tag className="h-3 w-3" />
                    Add tag
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !title.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create task"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
