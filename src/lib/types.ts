export type LeadStatus =
  | "primeiro-contato"
  | "oferta-enviada"
  | "oferta-desconto"
  | "follow-up"
  | "fechado"
  | "perdido";

export type LeadStatusFilter = LeadStatus | "todos";

export type SortMode = "updated-desc" | "next-asc" | "name-asc" | "status-asc";

export type Interaction = {
  text: string;
  date: string;
};

export type Lead = {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  source: string;
  value: number;
  nextContact: string; // YYYY-MM-DD
  notes: string;
  interactions: Interaction[];
  createdAt: string;
  updatedAt: string;
};

