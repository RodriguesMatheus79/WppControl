"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type {
  AreaDefinition,
  AreaFilter,
  Lead,
  LeadStatusFilter,
  LeadType,
  SortMode,
} from "@/lib/types";
import {
  dateLabel,
  isTodayOrLate,
  money,
  searchableText,
  sortLeads,
  STATUSES,
  statusInfo,
  whatsAppLinkForLead,
} from "@/lib/leads";
import { loadLeads, saveLeads } from "@/lib/storage";
import {
  AREA_FILTER_STORAGE_KEY,
  STATUS_FILTER_STORAGE_KEY,
  UNDEFINED_AREA_SLUG,
  areaLabel as resolveAreaLabel,
  loadAreas,
  mostUsedArea,
  saveAreas,
  slugifyArea,
} from "@/lib/areas";
import {
  type MessageTemplate,
  loadTemplates,
  newTemplate,
  renderTemplate,
  saveTemplates,
  templatesForArea,
} from "@/lib/templates";
import { applyCadence, bucketOf } from "@/lib/cadence";
import { maskPhoneInput, parsePhone, samePhone } from "@/lib/phone";
import { supabase } from "@/lib/supabaseClient";
import * as supaLeads from "@/lib/supabaseLeads";

type Editing = {
  open: boolean;
  lead: Lead | null;
};

function emptyLead(defaultArea: string): Omit<Lead, "id" | "createdAt" | "updatedAt"> & { id?: string } {
  return {
    id: "",
    name: "",
    phone: "",
    areaAtuacao: defaultArea,
    leadType: "normal",
    coldMessage: "",
    status: STATUSES[0].value,
    source: "",
    value: 0,
    nextContact: "",
    notes: "",
    interactions: [],
  };
}

export default function LeadApp() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [areas, setAreas] = useState<AreaDefinition[]>([]);
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("todos");
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>("todos");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("updated-desc");
  const [editing, setEditing] = useState<Editing>({ open: false, lead: null });
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [newAreaInput, setNewAreaInput] = useState("");
  const [showNewAreaForm, setShowNewAreaForm] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false);
  const [duplicate, setDuplicate] = useState<{ candidate: Lead; existing: Lead } | null>(null);

  // Boot inicial — carrega áreas, filtros persistidos, templates e leads.
  useEffect(() => {
    setAreas(loadAreas());
    setTemplates(loadTemplates());
    if (typeof window !== "undefined") {
      const savedArea = window.localStorage.getItem(AREA_FILTER_STORAGE_KEY);
      if (savedArea) setAreaFilter(savedArea);
      const savedStatus = window.localStorage.getItem(STATUS_FILTER_STORAGE_KEY);
      if (savedStatus) setStatusFilter(savedStatus as LeadStatusFilter);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSessionEmail(data.session?.user.email ?? null);

      if (data.session) {
        try {
          const remote = await supaLeads.listLeads();
          if (!cancelled) setLeads(remote);
        } catch (e: any) {
          if (!cancelled) setSyncError(e?.message ?? "Falha ao carregar do Supabase");
          const local = loadLeads();
          if (!cancelled) setLeads(local);
        }
      } else {
        const local = loadLeads();
        setLeads(local);
      }
    }

    void boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSessionEmail(nextSession?.user.email ?? null);
      if (nextSession) {
        void (async () => {
          try {
            const remote = await supaLeads.listLeads();
            setLeads(remote);
            setSyncError(null);
          } catch (e: any) {
            setSyncError(e?.message ?? "Falha ao carregar do Supabase");
          }
        })();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!leads.length) return;
    saveLeads(leads);
  }, [leads]);

  // Persiste filtros entre sessões para que o usuário retome onde estava.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AREA_FILTER_STORAGE_KEY, areaFilter);
  }, [areaFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STATUS_FILTER_STORAGE_KEY, statusFilter);
  }, [statusFilter]);

  // Garante que áreas referenciadas pelos leads (vindas do localStorage / Supabase /
  // import) apareçam na sidebar mesmo que não estejam cadastradas explicitamente.
  useEffect(() => {
    if (!leads.length || !areas.length) return;
    const known = new Set(areas.map((a) => a.slug));
    const missing: AreaDefinition[] = [];
    for (const lead of leads) {
      const slug = lead.areaAtuacao || UNDEFINED_AREA_SLUG;
      if (!known.has(slug)) {
        known.add(slug);
        missing.push({
          slug,
          label: slug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
        });
      }
    }
    if (missing.length) {
      const next = [...areas, ...missing];
      setAreas(next);
      saveAreas(next);
    }
  }, [leads, areas]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const subset = leads.filter((lead) => {
      const matchesArea = areaFilter === "todos" || lead.areaAtuacao === areaFilter;
      const matchesStatus = statusFilter === "todos" || lead.status === statusFilter;
      const matchesQuery = !q || searchableText(lead).includes(q);
      return matchesArea && matchesStatus && matchesQuery;
    });
    return sortLeads(subset, sort);
  }, [leads, areaFilter, statusFilter, query, sort]);

  // Sidebar (áreas): mostra o universo total por nicho, sem cruzar com estado.
  const areaCounts = useMemo(() => {
    const map: Record<string, number> = { todos: leads.length };
    for (const lead of leads) {
      const slug = lead.areaAtuacao || UNDEFINED_AREA_SLUG;
      map[slug] = (map[slug] ?? 0) + 1;
    }
    return map;
  }, [leads]);

  // Tabs de estado: dentro do nicho selecionado mostram quantos estão em cada etapa.
  const statusCounts = useMemo(() => {
    const base: Record<string, number> = { todos: 0 };
    for (const s of STATUSES) base[s.value] = 0;
    const scope = areaFilter === "todos" ? leads : leads.filter((l) => l.areaAtuacao === areaFilter);
    base.todos = scope.length;
    for (const lead of scope) base[lead.status] = (base[lead.status] ?? 0) + 1;
    return base;
  }, [leads, areaFilter]);

  const metrics = useMemo(() => {
    const total = leads.length;
    const closed = leads.filter((l) => l.status === "fechado").length;
    const lost = leads.filter((l) => l.status === "perdido").length;
    const today = leads.filter(
      (l) => isTodayOrLate(l.nextContact) && !["fechado", "perdido"].includes(l.status),
    ).length;
    const conversionBase = closed + lost;
    const conversion = conversionBase ? Math.round((closed / conversionBase) * 100) : 0;
    const open = leads.filter((l) => !["fechado", "perdido"].includes(l.status)).length;
    return { total, open, today, conversion };
  }, [leads]);

  // Agenda: leads atrasados e leads com próximo contato hoje (no escopo do filtro de área).
  const agenda = useMemo(() => {
    const scope = areaFilter === "todos" ? leads : leads.filter((l) => l.areaAtuacao === areaFilter);
    const overdue: Lead[] = [];
    const today: Lead[] = [];
    for (const l of scope) {
      const b = bucketOf(l);
      if (b === "overdue") overdue.push(l);
      else if (b === "today") today.push(l);
    }
    return { overdue, today };
  }, [leads, areaFilter]);

  // Breakdown por área: leads abertos, fechados, taxa de conversão.
  const areaBreakdown = useMemo(() => {
    const acc = new Map<string, { total: number; open: number; closed: number; lost: number }>();
    for (const l of leads) {
      const slug = l.areaAtuacao || UNDEFINED_AREA_SLUG;
      const cur = acc.get(slug) ?? { total: 0, open: 0, closed: 0, lost: 0 };
      cur.total++;
      if (l.status === "fechado") cur.closed++;
      else if (l.status === "perdido") cur.lost++;
      else cur.open++;
      acc.set(slug, cur);
    }
    return Array.from(acc.entries())
      .map(([slug, v]) => {
        const base = v.closed + v.lost;
        const conv = base ? Math.round((v.closed / base) * 100) : null;
        return { slug, ...v, conv };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
  }, [leads]);

  // Áreas exibidas na sidebar — colocamos "Não definido" sempre por último,
  // builtins primeiro na ordem definida, depois customizadas.
  const sortedAreas = useMemo(() => {
    const undef = areas.find((a) => a.slug === UNDEFINED_AREA_SLUG);
    const rest = areas
      .filter((a) => a.slug !== UNDEFINED_AREA_SLUG)
      .sort((a, b) => {
        if (a.builtin && !b.builtin) return -1;
        if (!a.builtin && b.builtin) return 1;
        return a.label.localeCompare(b.label, "pt-BR");
      });
    return undef ? [...rest, undef] : rest;
  }, [areas]);

  function openDialog(lead: Lead | null) {
    setEditing({ open: true, lead });
    queueMicrotask(() => dialogRef.current?.showModal());
  }

  function closeDialog() {
    dialogRef.current?.close();
    setEditing({ open: false, lead: null });
  }

  function persistLead(next: Lead) {
    setLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === next.id);
      const copy = [...prev];
      if (idx >= 0) copy[idx] = next;
      else copy.unshift(next);
      return copy;
    });

    if (sessionEmail) {
      void (async () => {
        try {
          const saved = await supaLeads.upsertLead(next);
          setSyncError(null);
          setLeads((prev) => {
            const idx = prev.findIndex((l) => l.id === saved.id);
            const copy = [...prev];
            if (idx >= 0) copy[idx] = saved;
            return copy;
          });
        } catch (e: any) {
          setSyncError(e?.message ?? "Falha ao salvar no Supabase");
        }
      })();
    }
  }

  function upsertLead(next: Lead) {
    // Aplica cadência automática quando o estado muda (ou quando entra novo).
    const previous = leads.find((l) => l.id === next.id) ?? null;
    const withCadence = applyCadence(next, previous?.status ?? null);

    // Dedupe por telefone — só dispara para leads novos (sem id pré-existente em leads[]).
    if (!previous && withCadence.phone) {
      const existing = leads.find((l) => l.id !== withCadence.id && samePhone(l.phone, withCadence.phone));
      if (existing) {
        setDuplicate({ candidate: withCadence, existing });
        return;
      }
    }
    persistLead(withCadence);
  }

  function mergeDuplicate(candidate: Lead, existing: Lead) {
    // Estratégia de merge: mantém o ID e createdAt do existente, prefere campos preenchidos
    // do candidate (mais recentes), e concatena interactions sem duplicar pelo conteúdo+data.
    const seen = new Set<string>();
    const interactions = [...(candidate.interactions ?? []), ...(existing.interactions ?? [])]
      .filter((it) => {
        const key = `${it.date}::${it.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const merged: Lead = {
      ...existing,
      name: candidate.name || existing.name,
      phone: candidate.phone || existing.phone,
      areaAtuacao: candidate.areaAtuacao || existing.areaAtuacao,
      leadType: candidate.leadType || existing.leadType,
      coldMessage: candidate.coldMessage || existing.coldMessage,
      status: candidate.status || existing.status,
      source: candidate.source || existing.source,
      value: candidate.value || existing.value,
      nextContact: candidate.nextContact || existing.nextContact,
      notes: [existing.notes, candidate.notes].filter(Boolean).join("\n---\n"),
      interactions,
      updatedAt: new Date().toISOString(),
    };
    persistLead(merged);
    setDuplicate(null);
  }

  function deleteLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    if (sessionEmail) {
      void (async () => {
        try {
          await supaLeads.deleteLead(id);
          setSyncError(null);
        } catch (e: any) {
          setSyncError(e?.message ?? "Falha ao excluir no Supabase");
        }
      })();
    }
  }

  function createArea(label: string): string | null {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const slug = slugifyArea(trimmed) || `area-${Date.now()}`;
    if (areas.some((a) => a.slug === slug)) return slug;
    const next = [...areas, { slug, label: trimmed }];
    setAreas(next);
    saveAreas(next);
    return slug;
  }

  function handleCreateAreaInline() {
    const slug = createArea(newAreaInput);
    if (slug) {
      setAreaFilter(slug);
      setNewAreaInput("");
      setShowNewAreaForm(false);
    }
  }

  async function exportJson() {
    const blob = new Blob([JSON.stringify(leads, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "controle-leads.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(file: File) {
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported)) throw new Error("Formato invalido");
      setLeads(imported as Lead[]);
      saveLeads(imported as Lead[]);
      if (sessionEmail) {
        for (const lead of imported as Lead[]) {
          try {
            await supaLeads.upsertLead(lead);
          } catch (e: any) {
            setSyncError(e?.message ?? "Falha ao sincronizar import com Supabase");
            break;
          }
        }
      }
    } catch {
      alert("Nao foi possivel importar o arquivo.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  const resultSummary = `${filtered.length} lead${filtered.length === 1 ? "" : "s"} encontrado${
    filtered.length === 1 ? "" : "s"
  }`;

  const defaultAreaForNewLead = mostUsedArea(leads);

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">CL</span>
            <div>
              <h1>Controle de Leads</h1>
              <p>Por área de atuação</p>
            </div>
          </div>

          <nav className="status-nav" aria-label="Filtrar por área de atuação">
            <button
              className={`status-chip ${areaFilter === "todos" ? "active" : ""}`}
              onClick={() => setAreaFilter("todos")}
              type="button"
            >
              <span>Todos</span>
              <strong>{leads.length}</strong>
            </button>
            {sortedAreas.map((a) => (
              <button
                key={a.slug}
                className={`status-chip ${areaFilter === a.slug ? "active" : ""}`}
                onClick={() => setAreaFilter(a.slug)}
                type="button"
              >
                <span>{a.label}</span>
                <strong>{areaCounts[a.slug] || 0}</strong>
              </button>
            ))}

            {showNewAreaForm ? (
              <div className="new-area-form">
                <input
                  autoFocus
                  placeholder="Nome da área"
                  value={newAreaInput}
                  onChange={(e) => setNewAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateAreaInline();
                    } else if (e.key === "Escape") {
                      setShowNewAreaForm(false);
                      setNewAreaInput("");
                    }
                  }}
                />
                <div className="new-area-actions">
                  <button type="button" className="ghost-button" onClick={handleCreateAreaInline}>
                    Criar
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setShowNewAreaForm(false);
                      setNewAreaInput("");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="status-chip add-area"
                onClick={() => setShowNewAreaForm(true)}
                type="button"
                aria-label="Criar nova área"
              >
                <span>+ Nova área</span>
              </button>
            )}
          </nav>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <div className="search-wrap">
              <label htmlFor="searchInput">Buscar</label>
              <input
                id="searchInput"
                type="search"
                placeholder="Nome, telefone, área, origem ou observacao"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="toolbar">
              {sessionEmail ? (
                <button
                  className="ghost-button"
                  type="button"
                  title={`Logado como ${sessionEmail}`}
                  onClick={() => supabase.auth.signOut()}
                >
                  Sair
                </button>
              ) : (
                <>
                  <input
                    style={{ maxWidth: 220 }}
                    placeholder="Email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                  <input
                    style={{ maxWidth: 160 }}
                    placeholder="Senha"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={async () => {
                      setSyncError(null);
                      const { error } = await supabase.auth.signInWithPassword({
                        email: authEmail,
                        password: authPassword,
                      });
                      if (error) setSyncError(error.message);
                    }}
                  >
                    Entrar
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={async () => {
                      setSyncError(null);
                      const { error } = await supabase.auth.signUp({
                        email: authEmail,
                        password: authPassword,
                      });
                      if (error) setSyncError(error.message);
                    }}
                  >
                    Criar conta
                  </button>
                </>
              )}
              <button
                className="ghost-button"
                type="button"
                title="Templates de mensagem"
                onClick={() => setShowTemplatesPanel(true)}
              >
                Templates
              </button>
              <button
                className="icon-button"
                type="button"
                title="Exportar leads"
                aria-label="Exportar leads"
                onClick={exportJson}
              >
                <span aria-hidden="true">⇩</span>
              </button>
              <button
                className="icon-button"
                type="button"
                title="Importar leads"
                aria-label="Importar leads"
                onClick={() => importInputRef.current?.click()}
              >
                <span aria-hidden="true">⇧</span>
              </button>
              <button className="primary-button" type="button" onClick={() => openDialog(null)}>
                Novo lead
              </button>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportFile(file);
              }}
            />
          </header>

          {syncError ? (
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: 12,
                background: "var(--panel)",
                color: "var(--danger)",
              }}
            >
              {syncError}
              {!sessionEmail ? (
                <div style={{ marginTop: 6, color: "var(--muted)" }}>
                  Dica: com RLS ligado no Supabase, você precisa estar logado para gravar.
                </div>
              ) : null}
            </div>
          ) : null}

          {agenda.overdue.length + agenda.today.length > 0 ? (
            <section className="agenda" aria-label="Agenda do dia">
              <header>
                <h2>Hoje</h2>
                <p>
                  {agenda.overdue.length} atrasado{agenda.overdue.length === 1 ? "" : "s"} ·{" "}
                  {agenda.today.length} para hoje
                </p>
              </header>
              <ul className="agenda-list">
                {[...agenda.overdue, ...agenda.today].slice(0, 6).map((lead) => {
                  const isOverdue = bucketOf(lead) === "overdue";
                  return (
                    <li key={lead.id} className={`agenda-item ${isOverdue ? "overdue" : ""}`}>
                      <button
                        type="button"
                        className="agenda-name"
                        onClick={() => openDialog(lead)}
                        title="Abrir lead"
                      >
                        {lead.name}
                      </button>
                      <span className="agenda-meta">
                        {resolveAreaLabel(areas, lead.areaAtuacao)} · {statusInfo(lead.status).label}
                      </span>
                      <span className="agenda-when">
                        {isOverdue ? "Atrasado " : "Hoje "}
                        <time>{dateLabel(lead.nextContact)}</time>
                      </span>
                      <a
                        className="icon-button"
                        href={whatsAppLinkForLead(lead)}
                        target="_blank"
                        rel="noreferrer"
                        title="WhatsApp"
                        aria-label="WhatsApp"
                      >
                        ↗
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="metrics" aria-label="Indicadores">
            <div className="metric">
              <span>Total</span>
              <strong>{metrics.total}</strong>
            </div>
            <div className="metric">
              <span>Abertos</span>
              <strong>{metrics.open}</strong>
            </div>
            <div className="metric">
              <span>Para hoje</span>
              <strong>{metrics.today}</strong>
            </div>
            <div className="metric">
              <span>Conversao</span>
              <strong>{metrics.conversion}%</strong>
            </div>
          </section>

          {areaBreakdown.length > 1 ? (
            <section className="area-breakdown" aria-label="Performance por área">
              {areaBreakdown.map((row) => (
                <button
                  key={row.slug}
                  type="button"
                  className={`area-row ${areaFilter === row.slug ? "active" : ""}`}
                  onClick={() => setAreaFilter(row.slug)}
                  title="Filtrar pelo nicho"
                >
                  <strong>{resolveAreaLabel(areas, row.slug)}</strong>
                  <span>
                    {row.open} aberto{row.open === 1 ? "" : "s"} · {row.closed} fechado
                    {row.closed === 1 ? "" : "s"}
                    {row.conv != null ? ` · ${row.conv}% conv.` : ""}
                  </span>
                </button>
              ))}
            </section>
          ) : null}

          <section className="lead-board">
            <div className="board-head">
              <div>
                <h2>Leads</h2>
                <p>{resultSummary}</p>
              </div>
              <select
                aria-label="Ordenar leads"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
              >
                <option value="updated-desc">Atualizados primeiro</option>
                <option value="next-asc">Proximo contato</option>
                <option value="name-asc">Nome A-Z</option>
                <option value="status-asc">Etapa</option>
              </select>
            </div>

            <div className="status-tabs" role="tablist" aria-label="Filtrar por estado da conversa">
              <button
                role="tab"
                aria-selected={statusFilter === "todos"}
                className={`status-tab ${statusFilter === "todos" ? "active" : ""}`}
                onClick={() => setStatusFilter("todos")}
                type="button"
              >
                Todos <span className="tab-count">{statusCounts.todos}</span>
              </button>
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  role="tab"
                  aria-selected={statusFilter === s.value}
                  className={`status-tab ${statusFilter === s.value ? "active" : ""}`}
                  onClick={() => setStatusFilter(s.value)}
                  type="button"
                >
                  {s.label} <span className="tab-count">{statusCounts[s.value] || 0}</span>
                </button>
              ))}
            </div>

            <div className="lead-list" aria-live="polite">
              {filtered.map((lead) => {
                const status = statusInfo(lead.status);
                const latest = (lead.interactions || [])[0];
                const nextClass =
                  isTodayOrLate(lead.nextContact) && !["fechado", "perdido"].includes(lead.status)
                    ? "badge warn"
                    : "lead-meta";
                const areaName = resolveAreaLabel(areas, lead.areaAtuacao);

                return (
                  <article key={lead.id} className="lead-card">
                    <div className="lead-main">
                      <p className="lead-name">{lead.name}</p>
                      <div className="lead-phone">{lead.phone}</div>
                    </div>
                    <div className="lead-tags">
                      <div className={`badge ${status.tone ?? ""}`}>{status.label}</div>
                      <div className="chip area" title="Área de atuação">
                        {areaName}
                        {lead.leadType === "frio" ? <span className="cold-mark" title="Lead frio">❄</span> : null}
                      </div>
                    </div>
                    <div className="lead-meta">{money(lead.value)}</div>
                    <div>
                      <div className={nextClass}>{dateLabel(lead.nextContact)}</div>
                      <div className="lead-note">{latest ? latest.text : lead.notes || "Sem historico"}</div>
                    </div>
                    <div className="lead-actions">
                      <button
                        className="icon-button"
                        type="button"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => openDialog(lead)}
                      >
                        ✎
                      </button>
                      <a
                        className="icon-button"
                        title={
                          lead.leadType === "frio" && lead.coldMessage
                            ? "Abrir WhatsApp com mensagem inicial"
                            : "Abrir WhatsApp"
                        }
                        aria-label="Abrir WhatsApp"
                        href={whatsAppLinkForLead(lead)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ↗
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className={`empty-state ${filtered.length === 0 ? "visible" : ""}`}>
              <h3>Comece pelo primeiro contato</h3>
              <p>
                Cadastre um lead para acompanhar etapa, telefone, ultimo toque e proxima abordagem.
              </p>
              <button className="primary-button" type="button" onClick={() => openDialog(null)}>
                Novo lead
              </button>
            </div>
          </section>
        </main>
      </div>

      <LeadDialog
        ref={dialogRef}
        open={editing.open}
        lead={editing.lead}
        areas={areas}
        defaultArea={defaultAreaForNewLead}
        templates={templates}
        onCreateArea={createArea}
        onClose={closeDialog}
        onDelete={(id) => deleteLead(id)}
        onSave={(next) => upsertLead(next)}
      />

      {duplicate ? (
        <DuplicateModal
          existing={duplicate.existing}
          candidate={duplicate.candidate}
          areas={areas}
          onMerge={() => mergeDuplicate(duplicate.candidate, duplicate.existing)}
          onCreateAnyway={() => {
            persistLead(duplicate.candidate);
            setDuplicate(null);
          }}
          onCancel={() => setDuplicate(null)}
        />
      ) : null}

      {showTemplatesPanel ? (
        <TemplatesPanel
          templates={templates}
          areas={areas}
          onClose={() => setShowTemplatesPanel(false)}
          onSave={(next) => {
            setTemplates(next);
            saveTemplates(next);
          }}
        />
      ) : null}
    </>
  );
}

type LeadDialogProps = {
  open: boolean;
  lead: Lead | null;
  areas: AreaDefinition[];
  defaultArea: string;
  templates: MessageTemplate[];
  onCreateArea: (label: string) => string | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSave: (lead: Lead) => void;
};

const LeadDialog = forwardRef<HTMLDialogElement, LeadDialogProps>(function LeadDialogInner(props, ref) {
  const { lead, areas, defaultArea, templates, onCreateArea, onClose, onDelete, onSave } = props;
  const [form, setForm] = useState(emptyLead(defaultArea));
  const [interaction, setInteraction] = useState("");
  const [showAreaInput, setShowAreaInput] = useState(false);
  const [areaInput, setAreaInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!lead) {
      setForm(emptyLead(defaultArea));
      setInteraction("");
      setValidationError(null);
      return;
    }
    setForm({ ...lead });
    setInteraction("");
    setValidationError(null);
  }, [lead, defaultArea]);

  function submit() {
    if (!form.areaAtuacao) {
      setValidationError("Área de atuação é obrigatória.");
      return;
    }
    const phoneCheck = parsePhone(form.phone);
    if (!phoneCheck.valid) {
      setValidationError("Telefone inválido. Use DDD + número (10 ou 11 dígitos).");
      return;
    }
    if (form.leadType === "frio" && !(form.coldMessage ?? "").trim()) {
      setValidationError("Lead frio precisa de uma mensagem inicial.");
      return;
    }

    const now = new Date().toISOString();
    const existing = lead;
    const interactions = existing ? [...(existing.interactions || [])] : [];
    const trimmed = interaction.trim();
    if (trimmed) interactions.unshift({ text: trimmed, date: now });
    else if (!existing)
      interactions.unshift({
        text: `Lead cadastrado em ${statusInfo(form.status).label}.`,
        date: now,
      });

    const next: Lead = {
      id: existing?.id || crypto.randomUUID(),
      name: form.name.trim(),
      phone: parsePhone(form.phone).display || form.phone.trim(),
      areaAtuacao: form.areaAtuacao,
      leadType: form.leadType,
      coldMessage: form.leadType === "frio" ? (form.coldMessage ?? "").trim() : "",
      status: form.status,
      source: form.source.trim(),
      value: Number(form.value || 0),
      nextContact: form.nextContact,
      notes: form.notes.trim(),
      interactions,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    onSave(next);
    onClose();
  }

  function handleCreateAreaInDialog() {
    const slug = onCreateArea(areaInput);
    if (slug) {
      setForm((p) => ({ ...p, areaAtuacao: slug }));
      setAreaInput("");
      setShowAreaInput(false);
    }
  }

  return (
    <dialog ref={ref}>
      <form
        id="leadForm"
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="dialog-head">
          <div>
            <h2>{lead ? "Editar lead" : "Novo lead"}</h2>
            <p>Categoria, contato e abordagem inicial</p>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Fechar"
            aria-label="Fechar"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="form-grid">
          <label>
            Nome
            <input
              value={form.name}
              required
              autoComplete="name"
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </label>
          <label>
            Telefone
            <input
              value={form.phone}
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 99999-0000"
              onChange={(e) => setForm((p) => ({ ...p, phone: maskPhoneInput(e.target.value) }))}
            />
          </label>

          <label>
            Área de atuação *
            <div className="area-field">
              <select
                value={form.areaAtuacao}
                required
                onChange={(e) => setForm((p) => ({ ...p, areaAtuacao: e.target.value }))}
              >
                {areas.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowAreaInput((v) => !v)}
                title="Criar nova área"
              >
                +
              </button>
            </div>
            {showAreaInput ? (
              <div className="area-create">
                <input
                  autoFocus
                  placeholder="Nome da nova área (ex: Dentistas)"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateAreaInDialog();
                    }
                  }}
                />
                <button type="button" className="ghost-button" onClick={handleCreateAreaInDialog}>
                  Adicionar
                </button>
              </div>
            ) : null}
          </label>

          <label>
            Tipo do lead *
            <select
              value={form.leadType}
              onChange={(e) =>
                setForm((p) => ({ ...p, leadType: e.target.value as LeadType }))
              }
            >
              <option value="normal">Normal</option>
              <option value="frio">Frio (com abordagem inicial)</option>
            </select>
          </label>

          <label>
            Estado da conversa
            <select
              value={form.status}
              required
              onChange={(e) =>
                setForm((p) => ({ ...p, status: e.target.value as Lead["status"] }))
              }
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origem
            <input
              value={form.source}
              placeholder="Instagram, indicacao, trafego..."
              onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
            />
          </label>
          <label>
            Valor potencial
            <input
              value={String(form.value ?? "")}
              type="number"
              min={0}
              step={0.01}
              placeholder="0,00"
              onChange={(e) => setForm((p) => ({ ...p, value: Number(e.target.value || 0) }))}
            />
          </label>
          <label>
            Proximo contato
            <input
              value={form.nextContact}
              type="date"
              onChange={(e) => setForm((p) => ({ ...p, nextContact: e.target.value }))}
            />
          </label>

          {form.leadType === "frio" ? (
            <ColdMessageField
              templates={templates}
              area={form.areaAtuacao}
              value={form.coldMessage ?? ""}
              onChange={(v) => setForm((p) => ({ ...p, coldMessage: v }))}
              previewLead={{
                name: form.name,
                phone: form.phone,
                areaAtuacao: form.areaAtuacao,
              }}
            />
          ) : null}

          <label className="full">
            Observacoes
            <textarea
              value={form.notes}
              rows={3}
              placeholder="Contexto da conversa, dores, objeções, preferencias..."
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
          <label className="full">
            Nova abordagem
            <textarea
              value={interaction}
              rows={2}
              placeholder="Ex.: Enviei proposta com desconto de 10%"
              onChange={(e) => setInteraction(e.target.value)}
            />
          </label>
        </div>

        {validationError ? (
          <div
            style={{
              marginTop: 12,
              color: "var(--danger)",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {validationError}
          </div>
        ) : null}

        <div className="dialog-actions">
          <button
            className="ghost-button danger"
            type="button"
            hidden={!lead}
            onClick={() => {
              if (!lead) return;
              if (confirm("Excluir este lead?")) {
                onDelete(lead.id);
                onClose();
              }
            }}
          >
            Excluir
          </button>
          <div>
            <button className="ghost-button" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary-button" type="submit">
              Salvar
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
});

type ColdMessageFieldProps = {
  templates: MessageTemplate[];
  area: string;
  value: string;
  onChange: (next: string) => void;
  previewLead: { name: string; phone: string; areaAtuacao: string };
};

function ColdMessageField({ templates, area, value, onChange, previewLead }: ColdMessageFieldProps) {
  const choices = templatesForArea(templates, area);
  const preview = renderTemplate(value, previewLead);

  return (
    <label className="full">
      Mensagem inicial *{" "}
      <span style={{ fontWeight: 400, color: "var(--muted)" }}>
        (vai abrir o WhatsApp com este texto — use {"{primeiro_nome}"}, {"{nome}"}, {"{area}"})
      </span>
      {choices.length ? (
        <select
          className="template-picker"
          value=""
          onChange={(e) => {
            const t = choices.find((x) => x.id === e.target.value);
            if (t) onChange(t.body);
          }}
        >
          <option value="">Escolher template...</option>
          {choices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      ) : null}
      <textarea
        value={value}
        rows={3}
        required
        placeholder="Olá {primeiro_nome}, vi que você atua com..."
        onChange={(e) => onChange(e.target.value)}
      />
      {preview && preview !== value ? (
        <div className="template-preview" aria-label="Pré-visualização">
          <strong>Pré-visualização:</strong> {preview}
        </div>
      ) : null}
    </label>
  );
}

type DuplicateModalProps = {
  existing: Lead;
  candidate: Lead;
  areas: AreaDefinition[];
  onMerge: () => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
};

function DuplicateModal({ existing, candidate, areas, onMerge, onCreateAnyway, onCancel }: DuplicateModalProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="overlay-card">
        <h2>Telefone já cadastrado</h2>
        <p>
          Já existe um lead com este telefone. O que deseja fazer?
        </p>
        <div className="dup-compare">
          <div>
            <h3>Existente</h3>
            <p><strong>{existing.name}</strong></p>
            <p>{existing.phone}</p>
            <p>{areas.find((a) => a.slug === existing.areaAtuacao)?.label ?? existing.areaAtuacao}</p>
            <p>{statusInfo(existing.status).label}</p>
          </div>
          <div>
            <h3>Novo</h3>
            <p><strong>{candidate.name}</strong></p>
            <p>{candidate.phone}</p>
            <p>{areas.find((a) => a.slug === candidate.areaAtuacao)?.label ?? candidate.areaAtuacao}</p>
            <p>{statusInfo(candidate.status).label}</p>
          </div>
        </div>
        <div className="overlay-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="ghost-button" type="button" onClick={onCreateAnyway}>
            Criar mesmo assim
          </button>
          <button className="primary-button" type="button" onClick={onMerge}>
            Mesclar (recomendado)
          </button>
        </div>
      </div>
    </div>
  );
}

type TemplatesPanelProps = {
  templates: MessageTemplate[];
  areas: AreaDefinition[];
  onSave: (next: MessageTemplate[]) => void;
  onClose: () => void;
};

function TemplatesPanel({ templates, areas, onSave, onClose }: TemplatesPanelProps) {
  const [draft, setDraft] = useState<MessageTemplate[]>(templates);
  const [filter, setFilter] = useState<string>("*");

  const visible = filter === "*" ? draft : draft.filter((t) => t.area === filter || t.area === "*");

  function update(id: string, patch: Partial<MessageTemplate>) {
    setDraft((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
    );
  }
  function remove(id: string) {
    setDraft((prev) => prev.filter((t) => t.id !== id));
  }
  function add() {
    setDraft((prev) => [newTemplate(filter === "*" ? "*" : filter, "Novo template", ""), ...prev]);
  }
  function commit() {
    onSave(draft);
    onClose();
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="overlay-card overlay-card-wide">
        <div className="dialog-head">
          <div>
            <h2>Templates de mensagem</h2>
            <p>Reaproveite abordagens. Variáveis: {"{primeiro_nome}, {nome}, {telefone}, {area}"}.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="templates-toolbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="*">Todas as áreas</option>
            {areas.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.label}
              </option>
            ))}
          </select>
          <button className="primary-button" type="button" onClick={add}>
            + Novo template
          </button>
        </div>

        <div className="templates-list">
          {visible.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Nenhum template por aqui ainda.</p>
          ) : (
            visible.map((t) => (
              <div key={t.id} className="template-row">
                <div className="template-meta">
                  <input
                    value={t.label}
                    placeholder="Nome do template"
                    onChange={(e) => update(t.id, { label: e.target.value })}
                  />
                  <select value={t.area} onChange={(e) => update(t.id, { area: e.target.value })}>
                    <option value="*">Todas as áreas</option>
                    {areas.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="ghost-button danger"
                    type="button"
                    onClick={() => remove(t.id)}
                  >
                    Remover
                  </button>
                </div>
                <textarea
                  value={t.body}
                  rows={3}
                  placeholder="Olá {primeiro_nome}..."
                  onChange={(e) => update(t.id, { body: e.target.value })}
                />
              </div>
            ))
          )}
        </div>

        <div className="overlay-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" type="button" onClick={commit}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
