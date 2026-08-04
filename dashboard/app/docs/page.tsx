"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FileText, X, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/toast";

const SYNC_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Queued", className: "bg-muted text-muted-foreground" },
  indexing: { label: "Indexing…", className: "bg-warning/15 text-warning-foreground" },
  synced: { label: "Live", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

type Doc = {
  _id: Id<"docs">;
  title: string;
  body: string;
  syncState: string;
  syncError?: string;
};

export default function DocsPage() {
  const docs = useQuery(api.docs.list);
  const save = useMutation(api.docs.save);
  const remove = useAction(api.docs.remove);
  const toast = useToast();

  const [selected, setSelected] = useState<Doc | "new" | null>(null);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Knowledge</h1>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            What the agent answers from. Saving pushes the text to the ElevenLabs knowledge base
            and rebuilds its RAG index — the agent can use it once the badge reads Live.
          </p>
        </div>
        <button
          onClick={() => setSelected("new")}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add document
        </button>
      </div>

      {docs?.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No documents yet. The agent will say it doesn&apos;t know until you add one.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {docs?.map((doc, i) => {
          const badge = SYNC_LABELS[doc.syncState] ?? SYNC_LABELS.pending;
          return (
            <motion.button
              key={doc._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04 }}
              whileHover={{ y: -2 }}
              onClick={() => setSelected(doc)}
              className="flex flex-col rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <h2 className="truncate font-medium">{doc.title}</h2>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
              <p className="line-clamp-3 text-sm text-muted-foreground">{doc.body}</p>
              {doc.syncError && <p className="mt-2 text-xs text-destructive">{doc.syncError}</p>}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <DocModal
            doc={selected === "new" ? null : selected}
            onSave={async (title, body) => {
              await save({ id: selected === "new" ? undefined : selected._id, title, body });
              toast(selected === "new" ? "Document added, syncing…" : "Document updated, syncing…");
              setSelected(null);
            }}
            onDelete={
              selected !== "new"
                ? async () => {
                    await remove({ docId: selected._id });
                    toast("Document deleted");
                    setSelected(null);
                  }
                : undefined
            }
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DocModal({
  doc,
  onSave,
  onDelete,
  onClose,
}: {
  doc: Doc | null;
  onSave: (title: string, body: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(doc?.title ?? "");
  const [body, setBody] = useState(doc?.body ?? "");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await onSave(title.trim(), body.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-xl flex-col space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{doc ? "Edit document" : "Add document"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — e.g. Refund policy"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          placeholder="The answer, written the way you would say it out loud."
          className="w-full flex-1 resize-y overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        />

        <div className="flex items-center justify-between pt-1">
          {onDelete ? (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={busy || !title.trim() || !body.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Saving…" : doc ? "Save" : "Add document"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
