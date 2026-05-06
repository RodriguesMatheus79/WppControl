import type { Lead } from "./types";

export type MessageTemplate = {
  id: string;
  /** slug da área a que se aplica, ou "*" para qualquer área. */
  area: string;
  label: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export const TEMPLATES_STORAGE_KEY = "controle-leads:templates:v1";

const SEED: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">[] = [
  {
    area: "advogados",
    label: "Advogado — abertura padrão",
    body: "Olá {primeiro_nome}, tudo bem? Vi que você atua na área jurídica. Posso te mostrar como tenho ajudado escritórios a captar clientes via WhatsApp?",
  },
  {
    area: "estetica",
    label: "Estética — agendamento",
    body: "Oi {primeiro_nome}! Trabalho com agendamento automatizado para clínicas de estética. Tem 5 minutos pra ver como funciona?",
  },
  {
    area: "personal-trainer",
    label: "Personal — captação de alunos",
    body: "Fala {primeiro_nome}! Ajudo personals a fechar mais alunos pelo WhatsApp sem virar atendente. Posso te mandar um exemplo?",
  },
  {
    area: "saloes",
    label: "Salão — fluxo de clientes",
    body: "Oi {primeiro_nome}, ajudo salões a manter a agenda cheia com lembretes automáticos. Quer ver um caso parecido com o seu?",
  },
  {
    area: "*",
    label: "Genérico — primeiro toque",
    body: "Olá {primeiro_nome}! Tudo bem? Falando rapidinho pra entender se faz sentido a gente bater um papo.",
  },
];

function nowIso() {
  return new Date().toISOString();
}

export function loadTemplates(): MessageTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) {
      const seeded = SEED.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }));
      window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as MessageTemplate[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t) => t && typeof t.id === "string" && typeof t.body === "string" && typeof t.label === "string",
    );
  } catch {
    return [];
  }
}

export function saveTemplates(templates: MessageTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

export function templatesForArea(templates: MessageTemplate[], area: string): MessageTemplate[] {
  return templates.filter((t) => t.area === area || t.area === "*");
}

/**
 * Renderiza um template substituindo variáveis simples.
 * Suporta: {nome}, {primeiro_nome}, {telefone}, {area}.
 * Vars desconhecidas ficam intactas (visível pro usuário corrigir).
 */
export function renderTemplate(body: string, lead: Pick<Lead, "name" | "phone" | "areaAtuacao">): string {
  if (!body) return "";
  const firstName = (lead.name || "").trim().split(/\s+/)[0] || "";
  const map: Record<string, string> = {
    nome: lead.name || "",
    primeiro_nome: firstName,
    telefone: lead.phone || "",
    area: lead.areaAtuacao || "",
  };
  return body.replace(/\{(\w+)\}/g, (full, key) => {
    return key in map ? map[key] : full;
  });
}

export function newTemplate(area: string, label = "", body = ""): MessageTemplate {
  return {
    id: crypto.randomUUID(),
    area,
    label,
    body,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}
