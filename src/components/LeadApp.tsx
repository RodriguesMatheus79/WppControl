"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { Lead, LeadStatusFilter, SortMode } from "@/lib/types";
import { dateLabel, isTodayOrLate, money, searchableText, sortLeads, STATUSES, statusInfo, whatsAppLink } from "@/lib/leads";
import { loadLeads, saveLeads } from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";
import * as supaLeads from "@/lib/supabaseLeads";

type Editing = {
  open: boolean;
  lead: Lead | null;
};

function emptyLead(): Omit<Lead, "id" | "createdAt" | "updatedAt"> & { id?: string } {
  return {
    id: "",
    name: "",
    phone: "",
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
  const [filterStatus, setFilterStatus] = useState<LeadStatusFilter>("todos");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("updated-desc");
  const [editing, setEditing] = useState<Editing>({ open: false, lead: null });
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [syncError, setSyncError] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const subset = leads.filter((lead) => {
      const matchesStatus = filterStatus === "todos" || lead.status === filterStatus;
      const matchesQuery = !q || searchableText(lead).includes(q);
      return matchesStatus && matchesQuery;
    });
    return sortLeads(subset, sort);
  }, [leads, filterStatus, query, sort]);

  const counts = useMemo(() => {
    const base = Object.fromEntries(STATUSES.map((s) => [s.value, 0])) as Record<string, number>;
    for (const lead of leads) base[lead.status] = (base[lead.status] ?? 0) + 1;
    return base;
  }, [leads]);

  const metrics = useMemo(() => {
    const total = leads.length;
    const closed = leads.filter((l) => l.status === "fechado").length;
    const lost = leads.filter((l) => l.status === "perdido").length;
    const today = leads.filter((l) => isTodayOrLate(l.nextContact) && !["fechado", "perdido"].includes(l.status)).length;
    const conversionBase = closed + lost;
    const conversion = conversionBase ? Math.round((closed / conversionBase) * 100) : 0;
    const open = leads.filter((l) => !["fechado", "perdido"].includes(l.status)).length;
    return { total, open, today, conversion };
  }, [leads]);

  function openDialog(lead: Lead | null) {
    setEditing({ open: true, lead });
    queueMicrotask(() => dialogRef.current?.showModal());
  }

  function closeDialog() {
    dialogRef.current?.close();
    setEditing({ open: false, lead: null });
  }

  function upsertLead(next: Lead) {
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
          // best-effort sync
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

  const resultSummary = `${filtered.length} lead${filtered.length === 1 ? "" : "s"} encontrado${filtered.length === 1 ? "" : "s"}`;

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">CL</span>
            <div>
              <h1>Controle de Leads</h1>
              <p>Abordagens, ofertas e proximos passos</p>
            </div>
          </div>

          <nav className="status-nav" aria-label="Resumo por etapa">
            <button className={`status-chip ${filterStatus === "todos" ? "active" : ""}`} onClick={() => setFilterStatus("todos")} type="button">
              <span>Todos</span>
              <strong>{leads.length}</strong>
            </button>
            {STATUSES.map((s) => (
              <button
                key={s.value}
                className={`status-chip ${filterStatus === s.value ? "active" : ""}`}
                onClick={() => setFilterStatus(s.value)}
                type="button"
              >
                <span>{s.label}</span>
                <strong>{counts[s.value] || 0}</strong>
              </button>
            ))}
          </nav>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <div className="search-wrap">
              <label htmlFor="searchInput">Buscar</label>
              <input
                id="searchInput"
                type="search"
                placeholder="Nome, telefone, origem ou observacao"
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
                      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
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
                      const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
                      if (error) setSyncError(error.message);
                    }}
                  >
                    Criar conta
                  </button>
                </>
              )}
              <button className="icon-button" type="button" title="Exportar leads" aria-label="Exportar leads" onClick={exportJson}>
                <span aria-hidden="true">⇩</span>
              </button>
              <button className="icon-button" type="button" title="Importar leads" aria-label="Importar leads" onClick={() => importInputRef.current?.click()}>
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
            <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "var(--panel)", color: "var(--danger)" }}>
              {syncError}
              {!sessionEmail ? <div style={{ marginTop: 6, color: "var(--muted)" }}>Dica: com RLS ligado no Supabase, você precisa estar logado para gravar.</div> : null}
            </div>
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

          <section className="lead-board">
            <div className="board-head">
              <div>
                <h2>Leads</h2>
                <p>{resultSummary}</p>
              </div>
              <select aria-label="Ordenar leads" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
                <option value="updated-desc">Atualizados primeiro</option>
                <option value="next-asc">Proximo contato</option>
                <option value="name-asc">Nome A-Z</option>
                <option value="status-asc">Etapa</option>
              </select>
            </div>

            <div className="lead-list" aria-live="polite">
              {filtered.map((lead) => {
                const status = statusInfo(lead.status);
                const latest = (lead.interactions || [])[0];
                const nextClass =
                  isTodayOrLate(lead.nextContact) && !["fechado", "perdido"].includes(lead.status) ? "badge warn" : "lead-meta";

                return (
                  <article key={lead.id} className="lead-card">
                    <div className="lead-main">
                      <p className="lead-name">{lead.name}</p>
                      <div className="lead-phone">{lead.phone}</div>
                    </div>
                    <div>
                      <div className={`badge ${status.tone ?? ""}`}>{status.label}</div>
                    </div>
                    <div className="lead-meta">{money(lead.value)}</div>
                    <div>
                      <div className={nextClass}>{dateLabel(lead.nextContact)}</div>
                      <div className="lead-note">{latest ? latest.text : lead.notes || "Sem historico"}</div>
                    </div>
                    <div className="lead-actions">
                      <button className="icon-button" type="button" title="Editar" aria-label="Editar" onClick={() => openDialog(lead)}>
                        ✎
                      </button>
                      <a
                        className="icon-button"
                        title="Abrir WhatsApp"
                        aria-label="Abrir WhatsApp"
                        href={whatsAppLink(lead.phone)}
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
              <p>Cadastre um lead para acompanhar etapa, telefone, ultimo toque e proxima abordagem.</p>
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
        onClose={closeDialog}
        onDelete={(id) => deleteLead(id)}
        onSave={(next) => upsertLead(next)}
      />
    </>
  );
}

type LeadDialogProps = {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSave: (lead: Lead) => void;
};

const LeadDialog = forwardRef<HTMLDialogElement, LeadDialogProps>(function LeadDialogInner(props, ref) {
  const { lead, onClose, onDelete, onSave } = props;
  const [form, setForm] = useState(emptyLead());
  const [interaction, setInteraction] = useState("");

  useEffect(() => {
    if (!lead) {
      setForm(emptyLead());
      setInteraction("");
      return;
    }
    setForm({ ...lead });
    setInteraction("");
  }, [lead]);

  function submit() {
    const now = new Date().toISOString();
    const existing = lead;
    const interactions = existing ? [...(existing.interactions || [])] : [];
    const trimmed = interaction.trim();
    if (trimmed) interactions.unshift({ text: trimmed, date: now });
    else if (!existing) interactions.unshift({ text: `Lead cadastrado em ${statusInfo(form.status).label}.`, date: now });

    const next: Lead = {
      id: existing?.id || crypto.randomUUID(),
      name: form.name.trim(),
      phone: form.phone.trim(),
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
            <p>Dados principais e proxima abordagem</p>
          </div>
          <button className="icon-button" type="button" title="Fechar" aria-label="Fechar" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="form-grid">
          <label>
            Nome
            <input value={form.name} required autoComplete="name" onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <label>
            Telefone
            <input
              value={form.phone}
              required
              inputMode="tel"
              autoComplete="tel"
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </label>
          <label>
            Estado da conversa
            <select value={form.status} required onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Lead["status"] }))}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origem
            <input value={form.source} placeholder="Instagram, indicacao, trafego..." onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} />
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
            <input value={form.nextContact} type="date" onChange={(e) => setForm((p) => ({ ...p, nextContact: e.target.value }))} />
          </label>
          <label className="full">
            Observacoes
            <textarea value={form.notes} rows={3} placeholder="Contexto da conversa, dores, objeções, preferencias..." onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </label>
          <label className="full">
            Nova abordagem
            <textarea value={interaction} rows={2} placeholder="Ex.: Enviei proposta com desconto de 10%" onChange={(e) => setInteraction(e.target.value)} />
          </label>
        </div>

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

