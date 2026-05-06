import type { Lead, LeadType } from "./types";
import { supabase } from "./supabaseClient";
import { UNDEFINED_AREA_SLUG } from "./areas";

type DbLead = {
  id: string;
  name: string;
  phone: string;
  status: Lead["status"];
  source: string | null;
  value: number | string | null;
  next_contact: string | null;
  notes: string | null;
  interactions: unknown;
  created_at: string;
  updated_at: string;
  // Colunas adicionadas pela refatoração — podem não existir ainda.
  area_atuacao?: string | null;
  lead_type?: LeadType | null;
  cold_message?: string | null;
};

function toAppLead(row: DbLead): Lead {
  return {
    id: row.id,
    name: row.name ?? "",
    phone: row.phone ?? "",
    areaAtuacao: row.area_atuacao ?? UNDEFINED_AREA_SLUG,
    leadType: row.lead_type === "frio" ? "frio" : "normal",
    coldMessage: row.cold_message ?? "",
    status: row.status,
    source: row.source ?? "",
    value: Number(row.value ?? 0) || 0,
    nextContact: row.next_contact ?? "",
    notes: row.notes ?? "",
    interactions: Array.isArray(row.interactions) ? (row.interactions as any) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Detecta quando o erro do Supabase é causado por colunas/atributos novos
 * que ainda não foram aplicados no schema. Quando isso acontece, removemos
 * as chaves desconhecidas do payload e tentamos novamente — assim o app
 * roda imediatamente em produção e os campos novos só são persistidos no
 * Supabase depois que o SQL for executado.
 */
function isUnknownColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  // Códigos típicos do PostgREST/Postgres para coluna desconhecida.
  if (e.code === "PGRST204" || e.code === "42703") return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("column") &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find"))
  );
}

const NEW_FIELDS: Array<keyof DbLead> = ["area_atuacao", "lead_type", "cold_message"];

function stripNewFields<T extends Record<string, unknown>>(payload: T): T {
  const copy: Record<string, unknown> = { ...payload };
  for (const field of NEW_FIELDS) delete copy[field as string];
  return copy as T;
}

export async function listLeads(opts?: { areaAtuacao?: string; status?: Lead["status"] | "todos" }) {
  // Filtragem opcional no servidor; só aplica quando a coluna existir.
  // Se não existir, o catch tenta sem o eq e o filtro acaba sendo aplicado no cliente.
  const tryFetch = async (withArea: boolean) => {
    let q = supabase.from("leads").select("*").order("updated_at", { ascending: false });
    if (withArea && opts?.areaAtuacao && opts.areaAtuacao !== "todos") {
      q = q.eq("area_atuacao", opts.areaAtuacao);
    }
    if (opts?.status && opts.status !== "todos") {
      q = q.eq("status", opts.status);
    }
    return q;
  };

  let { data, error } = await tryFetch(true);
  if (error && isUnknownColumnError(error)) {
    ({ data, error } = await tryFetch(false));
  }
  if (error) throw error;
  return (data as DbLead[]).map(toAppLead);
}

export async function upsertLead(lead: Lead) {
  const fullPayload = {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    status: lead.status,
    source: lead.source || null,
    value: lead.value ?? 0,
    next_contact: lead.nextContact || null,
    notes: lead.notes || null,
    interactions: lead.interactions ?? [],
    area_atuacao: lead.areaAtuacao || UNDEFINED_AREA_SLUG,
    lead_type: lead.leadType || "normal",
    cold_message: lead.leadType === "frio" ? lead.coldMessage || null : null,
  };

  let { data, error } = await supabase.from("leads").upsert(fullPayload).select("*").single();

  if (error && isUnknownColumnError(error)) {
    // Schema antigo: persiste apenas os campos legados. Os novos seguem
    // valendo no estado local + localStorage.
    const legacyPayload = stripNewFields(fullPayload);
    ({ data, error } = await supabase.from("leads").upsert(legacyPayload).select("*").single());
  }

  if (error) throw error;
  const saved = toAppLead(data as DbLead);
  // Garante que os campos novos sobrevivam mesmo quando o DB ainda não os retorna.
  return {
    ...saved,
    areaAtuacao: saved.areaAtuacao || lead.areaAtuacao || UNDEFINED_AREA_SLUG,
    leadType: saved.leadType || lead.leadType || "normal",
    coldMessage: saved.coldMessage || lead.coldMessage || "",
  } satisfies Lead;
}

export async function deleteLead(id: string) {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;
}
