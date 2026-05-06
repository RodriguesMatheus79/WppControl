import type { Lead, LeadStatus } from "./types";

/**
 * Cadência padrão: dias até o próximo contato a partir do estado atual.
 * "Fechado" e "Perdido" não geram próximos toques (terminais).
 */
export const CADENCE_DAYS: Partial<Record<LeadStatus, number>> = {
  "primeiro-contato": 2,
  "oferta-enviada": 3,
  "oferta-desconto": 2,
  "follow-up": 7,
};

export function addDaysIso(days: number, base = new Date()): string {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dado um lead, devolve o nextContact sugerido pela cadência (ou string vazia). */
export function suggestedNextContact(status: LeadStatus, base = new Date()): string {
  const days = CADENCE_DAYS[status];
  if (days == null) return "";
  return addDaysIso(days, base);
}

/**
 * Aplica cadência somente quando faz sentido:
 *   - status mudou para um estado com cadência;
 *   - lead não tem nextContact ou está atrasado;
 *   - estado novo não é terminal.
 */
export function applyCadence(
  next: Lead,
  previousStatus: LeadStatus | null,
): Lead {
  if (next.status === "fechado" || next.status === "perdido") return next;
  const days = CADENCE_DAYS[next.status];
  if (days == null) return next;

  const today = todayIso();
  const statusChanged = previousStatus !== next.status;
  const noNext = !next.nextContact;
  const overdue = next.nextContact && next.nextContact < today;

  if (statusChanged || noNext || overdue) {
    return { ...next, nextContact: suggestedNextContact(next.status) };
  }
  return next;
}

export type AgendaBucket = "overdue" | "today" | "upcoming";

export function bucketOf(lead: Lead): AgendaBucket | null {
  if (!lead.nextContact) return null;
  if (lead.status === "fechado" || lead.status === "perdido") return null;
  const today = todayIso();
  if (lead.nextContact < today) return "overdue";
  if (lead.nextContact === today) return "today";
  return "upcoming";
}
