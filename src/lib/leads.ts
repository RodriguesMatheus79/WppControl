import type { Lead, LeadStatus, SortMode } from "./types";

export const STORAGE_KEY = "controle-leads:v1";

export const STATUSES: Array<{ value: LeadStatus; label: string; tone?: string }> = [
  { value: "primeiro-contato", label: "Primeiro ctt" },
  { value: "oferta-enviada", label: "Oferta enviada" },
  { value: "oferta-desconto", label: "Oferta desconto", tone: "warn" },
  { value: "follow-up", label: "Follow-up", tone: "warn" },
  { value: "fechado", label: "Fechado", tone: "closed" },
  { value: "perdido", label: "Perdido", tone: "lost" },
];

export function statusInfo(value: LeadStatus) {
  return STATUSES.find((item) => item.value === value) ?? STATUSES[0];
}

export function money(value: number) {
  const number = Number(value || 0);
  if (!number) return "Sem valor";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dateLabel(value: string) {
  if (!value) return "Sem proximo contato";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function isTodayOrLate(value: string) {
  if (!value) return false;
  const today = new Date().toISOString().slice(0, 10);
  return value <= today;
}

export function whatsAppLink(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/55${digits.replace(/^55/, "")}` : "#";
}

export function searchableText(lead: Lead) {
  return [
    lead.name,
    lead.phone,
    lead.source,
    lead.notes,
    statusInfo(lead.status).label,
    ...(lead.interactions || []).map((item) => item.text),
  ]
    .join(" ")
    .toLowerCase();
}

export function seedLeads(): Lead[] {
  const now = new Date().toISOString();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return [
    {
      id: crypto.randomUUID(),
      name: "Maria Oliveira",
      phone: "(11) 99999-0000",
      status: "oferta-enviada",
      source: "Instagram",
      value: 1200,
      nextContact: tomorrow,
      notes: "Pediu detalhes sobre prazo e forma de pagamento.",
      interactions: [{ text: "Oferta enviada pelo WhatsApp.", date: now }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Carlos Mendes",
      phone: "(31) 98888-0000",
      status: "primeiro-contato",
      source: "Indicacao",
      value: 800,
      nextContact: "",
      notes: "Quer entender a proposta antes de marcar conversa.",
      interactions: [{ text: "Primeiro contato feito.", date: now }],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function sortLeads(leads: Lead[], sort: SortMode) {
  const copy = [...leads];
  return copy.sort((a, b) => {
    if (sort === "name-asc") return a.name.localeCompare(b.name, "pt-BR");
    if (sort === "status-asc")
      return statusInfo(a.status).label.localeCompare(statusInfo(b.status).label, "pt-BR");
    if (sort === "next-asc")
      return (a.nextContact || "9999-12-31").localeCompare(b.nextContact || "9999-12-31");
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

