export type LeadStatus =
  | "primeiro-contato"
  | "oferta-enviada"
  | "oferta-desconto"
  | "follow-up"
  | "fechado"
  | "perdido";

export type LeadStatusFilter = LeadStatus | "todos";

export type LeadType = "frio" | "normal";

// Slug normalizado (lowercase, sem acento). Mantemos string livre para
// permitir áreas dinâmicas criadas pelo usuário.
export type AreaAtuacao = string;

export type AreaFilter = AreaAtuacao | "todos";

export type AreaDefinition = {
  slug: string; // chave canônica, ex: "advogados"
  label: string; // como aparece na UI, ex: "Advogados"
  builtin?: boolean; // áreas-padrão não removíveis
};

export type SortMode = "updated-desc" | "next-asc" | "name-asc" | "status-asc";

export type Interaction = {
  text: string;
  date: string;
};

export type Lead = {
  id: string;
  name: string;
  phone: string;

  // Categoria do lead (área de atuação) — filtro primário na sidebar.
  areaAtuacao: AreaAtuacao;

  // Tipo do lead. Frios trazem mensagem inicial pré-cadastrada para WhatsApp.
  leadType: LeadType;
  coldMessage?: string;

  // Estado da conversa — usado como filtro secundário e badge na lista.
  status: LeadStatus;

  source: string;
  value: number;
  nextContact: string; // YYYY-MM-DD
  notes: string;
  interactions: Interaction[];
  createdAt: string;
  updatedAt: string;
};
