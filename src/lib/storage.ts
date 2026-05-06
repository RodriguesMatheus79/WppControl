import type { Lead } from "./types";
import { seedLeads, STORAGE_KEY } from "./leads";

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeLead(input: any): Lead | null {
  if (!input || typeof input !== "object") return null;
  if (typeof input.id !== "string") return null;

  const interactions = Array.isArray(input.interactions) ? input.interactions : [];
  return {
    id: input.id,
    name: String(input.name ?? "").trim(),
    phone: String(input.phone ?? "").trim(),
    status: input.status,
    source: String(input.source ?? ""),
    value: Number(input.value ?? 0) || 0,
    nextContact: String(input.nextContact ?? ""),
    notes: String(input.notes ?? ""),
    interactions: interactions
      .map((it: any) => ({ text: String(it?.text ?? ""), date: String(it?.date ?? "") }))
      .filter((it: any) => it.text && it.date),
    createdAt: String(input.createdAt ?? new Date().toISOString()),
    updatedAt: String(input.updatedAt ?? new Date().toISOString()),
  } as Lead;
}

export function loadLeads(): Lead[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (!parsed) return seedLeads();
  if (!Array.isArray(parsed)) return [];
  const normalized = parsed.map(normalizeLead).filter(Boolean) as Lead[];
  return normalized.length ? normalized : [];
}

export function saveLeads(leads: Lead[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

