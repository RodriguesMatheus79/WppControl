import type { Lead } from "./types";
import { supabase } from "./supabaseClient";

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
};

function toAppLead(row: DbLead): Lead {
  return {
    id: row.id,
    name: row.name ?? "",
    phone: row.phone ?? "",
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

export async function listLeads() {
  const { data, error } = await supabase.from("leads").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as DbLead[]).map(toAppLead);
}

export async function upsertLead(lead: Lead) {
  const payload = {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    status: lead.status,
    source: lead.source || null,
    value: lead.value ?? 0,
    next_contact: lead.nextContact || null,
    notes: lead.notes || null,
    interactions: lead.interactions ?? [],
  };

  const { data, error } = await supabase.from("leads").upsert(payload).select("*").single();
  if (error) throw error;
  return toAppLead(data as DbLead);
}

export async function deleteLead(id: string) {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;
}

