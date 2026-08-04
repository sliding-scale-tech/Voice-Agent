"use client";

import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Plus, X, Trash2, PawPrint, CalendarClock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/toast";

type Unit = { bedrooms: string; rentMin: number; rentMax: number; available: boolean };

const EMPTY_UNIT: Unit = { bedrooms: "", rentMin: 0, rentMax: 0, available: true };
const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

function parseUnitsCsv(text: string): Unit[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase();
  const hasHeader = header.includes("bedroom");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [bedrooms, rentMin, rentMax, available] = line.split(",").map((c) => c.trim());
      return {
        bedrooms: bedrooms ?? "",
        rentMin: Number(rentMin) || 0,
        rentMax: Number(rentMax) || 0,
        available: available === undefined ? true : /^(true|yes|1)$/i.test(available),
      };
    })
    .filter((u) => u.bedrooms.length > 0);
}

export default function PropertyPage() {
  const property = useQuery(api.properties.current);
  const save = useMutation(api.properties.save);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const [name, setName] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [petsAllowed, setPetsAllowed] = useState(false);
  const [moveInWindowDays, setMoveInWindowDays] = useState(60);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [hydrated, setHydrated] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  useEffect(() => {
    if (!property || hydrated) return;
    setName(property.name);
    setUnits(property.units);
    setPetsAllowed(property.petsAllowed);
    setMoveInWindowDays(property.moveInWindowDays);
    setHydrated(true);
  }, [property, hydrated]);

  const handleSave = async () => {
    setStatus("saving");
    await save({ name, units, petsAllowed, moveInWindowDays });
    setStatus("idle");
    toast("Property saved — knowledge base is re-syncing");
  };

  const handleModalSave = (unit: Unit) => {
    setUnits((prev) => {
      if (editingIndex === null) return prev;
      if (editingIndex === -1) return [...prev, unit];
      return prev.map((u, i) => (i === editingIndex ? unit : u));
    });
    setEditingIndex(null);
  };

  const handleDelete = (index: number) => {
    setUnits((prev) => prev.filter((_, i) => i !== index));
    setEditingIndex(null);
  };

  const handleCsvUpload = async (file: File) => {
    setCsvError(null);
    try {
      const text = await file.text();
      const parsed = parseUnitsCsv(text);
      if (parsed.length === 0) {
        setCsvError("No valid rows found. Expect columns: bedrooms,rentMin,rentMax,available");
        return;
      }
      setUnits(parsed);
      toast(`Loaded ${parsed.length} units from CSV`);
    } catch {
      setCsvError("Could not read that file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Property</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These rules drive the agent&apos;s qualification check on every call — they are not
          decided by the AI, they are read straight from here.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Property name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-input px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={petsAllowed}
              onChange={(e) => setPetsAllowed(e.target.checked)}
              className="h-4 w-4"
            />
            <PawPrint className="h-4 w-4 text-muted-foreground" />
            Pets allowed
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-input px-3 py-2.5 text-sm">
            <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="shrink-0">Move-in window</span>
            <input
              type="number"
              value={moveInWindowDays}
              onChange={(e) => setMoveInWindowDays(Number(e.target.value))}
              className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring"
            />
            <span className="text-muted-foreground">days</span>
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Units</h2>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCsvUpload(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload CSV
            </button>
            <button
              onClick={() => setEditingIndex(-1)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add unit
            </button>
          </div>
        </div>

        {csvError && <p className="text-xs text-destructive">{csvError}</p>}
        <p className="text-xs text-muted-foreground">
          CSV columns: bedrooms, rentMin, rentMax, available — uploading replaces the table below.
        </p>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Bedrooms</th>
                <th className="px-4 py-3 font-medium">Rent min</th>
                <th className="px-4 py-3 font-medium">Rent max</th>
                <th className="px-4 py-3 font-medium">Available</th>
              </tr>
            </thead>
            <tbody>
              {units.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No units yet — add one or upload a CSV.
                  </td>
                </tr>
              )}
              {units.map((unit, i) => (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setEditingIndex(i)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                >
                  <td className="px-4 py-3 font-medium">{unit.bedrooms}</td>
                  <td className="px-4 py-3 tabular-nums">${unit.rentMin}</td>
                  <td className="px-4 py-3 tabular-nums">${unit.rentMax}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        unit.available ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {unit.available ? "Yes" : "No"}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save property"}
        </button>
      </div>

      <AnimatePresence>
        {editingIndex !== null && (
          <UnitModal
            unit={editingIndex === -1 ? EMPTY_UNIT : units[editingIndex]}
            isNew={editingIndex === -1}
            onSave={handleModalSave}
            onDelete={editingIndex >= 0 ? () => handleDelete(editingIndex) : undefined}
            onClose={() => setEditingIndex(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function UnitModal({
  unit,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  unit: Unit;
  isNew: boolean;
  onSave: (unit: Unit) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [bedrooms, setBedrooms] = useState(unit.bedrooms);
  const [rentMin, setRentMin] = useState(unit.rentMin);
  const [rentMax, setRentMax] = useState(unit.rentMax);
  const [available, setAvailable] = useState(unit.available);

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
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isNew ? "Add unit" : "Edit unit"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Bedrooms</span>
          <input
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            placeholder="studio, 1br, 2br, 3br+"
            className={inputClass}
          />
        </label>

        <div className="flex gap-3">
          <label className="block flex-1 space-y-1.5">
            <span className="text-sm font-medium">Rent min</span>
            <input
              type="number"
              value={rentMin}
              onChange={(e) => setRentMin(Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="block flex-1 space-y-1.5">
            <span className="text-sm font-medium">Rent max</span>
            <input
              type="number"
              value={rentMax}
              onChange={(e) => setRentMax(Number(e.target.value))}
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          Available
        </label>

        <div className="flex items-center justify-between pt-2">
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
            <button onClick={onClose} className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent">
              Cancel
            </button>
            <button
              onClick={() => onSave({ bedrooms, rentMin, rentMax, available })}
              disabled={!bedrooms.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
