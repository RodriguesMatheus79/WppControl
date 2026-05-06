import type { AreaDefinition, Lead } from "./types";

export const AREAS_STORAGE_KEY = "controle-leads:areas:v1";
export const AREA_FILTER_STORAGE_KEY = "controle-leads:area-filter:v1";
export const STATUS_FILTER_STORAGE_KEY = "controle-leads:status-filter:v1";

export const UNDEFINED_AREA_SLUG = "nao-definido";

export const DEFAULT_AREAS: AreaDefinition[] = [
  { slug: "advogados", label: "Advogados", builtin: true },
  { slug: "estetica", label: "Estética", builtin: true },
  { slug: "personal-trainer", label: "Personal Trainer", builtin: true },
  { slug: "saloes", label: "Salões", builtin: true },
  { slug: UNDEFINED_AREA_SLUG, label: "Não definido", builtin: true },
];

export function slugifyArea(input: string): string {
  // U+0300 a U+036F cobre o bloco Combining Diacritical Marks (acentos).
  const stripped = input.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
  return stripped
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function loadAreas(): AreaDefinition[] {
  if (typeof window === "undefined") return DEFAULT_AREAS;
  try {
    const raw = window.localStorage.getItem(AREAS_STORAGE_KEY);
    if (!raw) return DEFAULT_AREAS;
    const parsed = JSON.parse(raw) as AreaDefinition[];
    if (!Array.isArray(parsed)) return DEFAULT_AREAS;
    // Faz merge — garante que builtins continuam presentes mesmo se o
    // storage estiver corrompido ou desatualizado.
    const map = new Map<string, AreaDefinition>();
    for (const a of DEFAULT_AREAS) map.set(a.slug, a);
    for (const a of parsed) {
      if (!a || typeof a.slug !== "string" || typeof a.label !== "string") continue;
      const existing = map.get(a.slug);
      if (existing?.builtin) continue;
      map.set(a.slug, { slug: a.slug, label: a.label });
    }
    return Array.from(map.values());
  } catch {
    return DEFAULT_AREAS;
  }
}

export function saveAreas(areas: AreaDefinition[]) {
  if (typeof window === "undefined") return;
  // Persiste apenas as áreas customizadas — builtins são reaplicadas na carga.
  const custom = areas.filter((a) => !a.builtin);
  window.localStorage.setItem(AREAS_STORAGE_KEY, JSON.stringify(custom));
}

export function findArea(areas: AreaDefinition[], slug: string): AreaDefinition | undefined {
  return areas.find((a) => a.slug === slug);
}

export function areaLabel(areas: AreaDefinition[], slug: string): string {
  return findArea(areas, slug)?.label ?? slug;
}

/**
 * Sugere a área mais frequente entre os leads existentes — usada para
 * pré-selecionar o select ao abrir "Novo lead".
 */
export function mostUsedArea(leads: Lead[], fallback = UNDEFINED_AREA_SLUG): string {
  if (!leads.length) return fallback;
  const tally = new Map<string, number>();
  for (const l of leads) {
    const key = l.areaAtuacao || fallback;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = -1;
  for (const [slug, count] of tally) {
    if (count > bestCount) {
      best = slug;
      bestCount = count;
    }
  }
  return best;
}
