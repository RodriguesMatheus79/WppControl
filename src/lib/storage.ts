import type { Lead, LeadType } from "./types";
import { seedLeads, STORAGE_KEY } from "./leads";
import { UNDEFINED_AREA_SLUG } from "./areas";

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeLeadType(input: unknown): LeadType {
  return input === "frio" ? "frio" : "normal";
}

function normalizeLead(input: any): Lead | null {
  if (!input || typeof input !== "object") return null;
  if (typeof input.id !== "string") return null;

  const interactions = Array.isArray(input.interactions) ? input.interactions : [];
  const leadType = normalizeLeadType(input.leadType);
  const coldMessageRaw = typeof input.coldMessage === "string" ? input.coldMessage : "";

  return {
    id: input.id,
    name: String(input.name ?? "").trim(),
    phone: String(input.phone ?? "").trim(),
    // Campo novo: leads antigos não têm areaAtuacao — caem no slug "nao-definido"
    // para que a sidebar agrupe sem perda de visibilidade.
    areaAtuacao:
      typeof input.areaAtuacao === "string" && input.areaAtuacao
        ? input.areaAtuacao
        : UNDEFINED_AREA_SLUG,
    leadType,
    coldMessage: coldMessageRaw,
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
