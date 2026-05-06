const STORAGE_KEY = "controle-leads:v1";

const statuses = [
  { value: "primeiro-contato", label: "Primeiro ctt", tone: "" },
  { value: "oferta-enviada", label: "Oferta enviada", tone: "" },
  { value: "oferta-desconto", label: "Oferta desconto", tone: "warn" },
  { value: "follow-up", label: "Follow-up", tone: "warn" },
  { value: "fechado", label: "Fechado", tone: "closed" },
  { value: "perdido", label: "Perdido", tone: "lost" },
];

const els = {
  leadList: document.querySelector("#leadList"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  dialog: document.querySelector("#leadDialog"),
  form: document.querySelector("#leadForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  leadId: document.querySelector("#leadId"),
  leadName: document.querySelector("#leadName"),
  leadPhone: document.querySelector("#leadPhone"),
  leadStatus: document.querySelector("#leadStatus"),
  leadSource: document.querySelector("#leadSource"),
  leadValue: document.querySelector("#leadValue"),
  leadNextContact: document.querySelector("#leadNextContact"),
  leadNotes: document.querySelector("#leadNotes"),
  leadInteraction: document.querySelector("#leadInteraction"),
  deleteLeadButton: document.querySelector("#deleteLeadButton"),
  importFile: document.querySelector("#importFile"),
};

let state = {
  leads: loadLeads(),
  filterStatus: "todos",
  query: "",
  sort: "updated-desc",
};

function loadLeads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedLeads();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function seedLeads() {
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

function saveLeads() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.leads));
}

function statusInfo(value) {
  return statuses.find((item) => item.value === value) || statuses[0];
}

function money(value) {
  const number = Number(value || 0);
  if (!number) return "Sem valor";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value) {
  if (!value) return "Sem proximo contato";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function isTodayOrLate(value) {
  if (!value) return false;
  const today = new Date().toISOString().slice(0, 10);
  return value <= today;
}

function searchableText(lead) {
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

function filteredLeads() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.leads.filter((lead) => {
    const matchesStatus = state.filterStatus === "todos" || lead.status === state.filterStatus;
    const matchesQuery = !query || searchableText(lead).includes(query);
    return matchesStatus && matchesQuery;
  });

  return filtered.sort((a, b) => {
    if (state.sort === "name-asc") return a.name.localeCompare(b.name, "pt-BR");
    if (state.sort === "status-asc") return statusInfo(a.status).label.localeCompare(statusInfo(b.status).label, "pt-BR");
    if (state.sort === "next-asc") return (a.nextContact || "9999-12-31").localeCompare(b.nextContact || "9999-12-31");
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function render() {
  const leads = filteredLeads();
  renderCounts();
  renderMetrics();
  document.querySelector("#resultSummary").textContent = `${leads.length} lead${leads.length === 1 ? "" : "s"} encontrado${leads.length === 1 ? "" : "s"}`;
  els.emptyState.classList.toggle("visible", leads.length === 0);
  els.leadList.innerHTML = leads.map(leadTemplate).join("");
}

function renderCounts() {
  const counts = Object.fromEntries(statuses.map((item) => [item.value, 0]));
  state.leads.forEach((lead) => {
    counts[lead.status] = (counts[lead.status] || 0) + 1;
  });

  document.querySelector("#countTodos").textContent = state.leads.length;
  document.querySelector("#countPrimeiroContato").textContent = counts["primeiro-contato"] || 0;
  document.querySelector("#countOfertaEnviada").textContent = counts["oferta-enviada"] || 0;
  document.querySelector("#countOfertaDesconto").textContent = counts["oferta-desconto"] || 0;
  document.querySelector("#countFollowUp").textContent = counts["follow-up"] || 0;
  document.querySelector("#countFechado").textContent = counts.fechado || 0;
  document.querySelector("#countPerdido").textContent = counts.perdido || 0;
}

function renderMetrics() {
  const total = state.leads.length;
  const closed = state.leads.filter((lead) => lead.status === "fechado").length;
  const lost = state.leads.filter((lead) => lead.status === "perdido").length;
  const today = state.leads.filter((lead) => isTodayOrLate(lead.nextContact) && !["fechado", "perdido"].includes(lead.status)).length;
  const conversionBase = closed + lost;
  const conversion = conversionBase ? Math.round((closed / conversionBase) * 100) : 0;

  document.querySelector("#metricTotal").textContent = total;
  document.querySelector("#metricOpen").textContent = state.leads.filter((lead) => !["fechado", "perdido"].includes(lead.status)).length;
  document.querySelector("#metricToday").textContent = today;
  document.querySelector("#metricConversion").textContent = `${conversion}%`;
}

function leadTemplate(lead) {
  const status = statusInfo(lead.status);
  const latest = (lead.interactions || [])[0];
  const nextClass = isTodayOrLate(lead.nextContact) && !["fechado", "perdido"].includes(lead.status) ? "badge warn" : "lead-meta";

  return `
    <article class="lead-card" data-lead-id="${lead.id}">
      <div class="lead-main">
        <p class="lead-name">${escapeHtml(lead.name)}</p>
        <div class="lead-phone">${escapeHtml(lead.phone)}</div>
      </div>
      <div>
        <div class="badge ${status.tone}">${status.label}</div>
      </div>
      <div class="lead-meta">${money(lead.value)}</div>
      <div>
        <div class="${nextClass}">${dateLabel(lead.nextContact)}</div>
        <div class="lead-note">${escapeHtml(latest ? latest.text : lead.notes || "Sem historico")}</div>
      </div>
      <div class="lead-actions">
        <button class="icon-button" type="button" title="Editar" aria-label="Editar" data-edit="${lead.id}">✎</button>
        <a class="icon-button" title="Abrir WhatsApp" aria-label="Abrir WhatsApp" href="${whatsAppLink(lead.phone)}" target="_blank" rel="noreferrer">↗</a>
      </div>
    </article>
  `;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function whatsAppLink(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/55${digits.replace(/^55/, "")}` : "#";
}

function openDialog(lead = null) {
  els.form.reset();
  els.leadStatus.innerHTML = statuses.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
  els.deleteLeadButton.hidden = !lead;
  els.dialogTitle.textContent = lead ? "Editar lead" : "Novo lead";

  if (lead) {
    els.leadId.value = lead.id;
    els.leadName.value = lead.name || "";
    els.leadPhone.value = lead.phone || "";
    els.leadStatus.value = lead.status || statuses[0].value;
    els.leadSource.value = lead.source || "";
    els.leadValue.value = lead.value || "";
    els.leadNextContact.value = lead.nextContact || "";
    els.leadNotes.value = lead.notes || "";
  } else {
    els.leadId.value = "";
    els.leadStatus.value = statuses[0].value;
  }

  els.dialog.showModal();
  els.leadName.focus();
}

function formToLead() {
  const now = new Date().toISOString();
  const existing = state.leads.find((lead) => lead.id === els.leadId.value);
  const interaction = els.leadInteraction.value.trim();
  const interactions = existing ? [...(existing.interactions || [])] : [];

  if (interaction) {
    interactions.unshift({ text: interaction, date: now });
  } else if (!existing) {
    interactions.unshift({ text: `Lead cadastrado em ${statusInfo(els.leadStatus.value).label}.`, date: now });
  }

  return {
    id: existing?.id || crypto.randomUUID(),
    name: els.leadName.value.trim(),
    phone: els.leadPhone.value.trim(),
    status: els.leadStatus.value,
    source: els.leadSource.value.trim(),
    value: Number(els.leadValue.value || 0),
    nextContact: els.leadNextContact.value,
    notes: els.leadNotes.value.trim(),
    interactions,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function upsertLead(lead) {
  const index = state.leads.findIndex((item) => item.id === lead.id);
  if (index >= 0) state.leads[index] = lead;
  else state.leads.unshift(lead);
  saveLeads();
  render();
}

function deleteLead(id) {
  state.leads = state.leads.filter((lead) => lead.id !== id);
  saveLeads();
  render();
}

document.querySelector("#newLeadButton").addEventListener("click", () => openDialog());
document.querySelector("[data-empty-new]").addEventListener("click", () => openDialog());
document.querySelector("#closeDialogButton").addEventListener("click", () => els.dialog.close());
document.querySelector("#cancelButton").addEventListener("click", () => els.dialog.close());

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  upsertLead(formToLead());
  els.dialog.close();
});

els.deleteLeadButton.addEventListener("click", () => {
  if (!els.leadId.value) return;
  if (confirm("Excluir este lead?")) {
    deleteLead(els.leadId.value);
    els.dialog.close();
  }
});

els.leadList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit]");
  if (!button) return;
  const lead = state.leads.find((item) => item.id === button.dataset.edit);
  if (lead) openDialog(lead);
});

document.querySelectorAll("[data-filter-status]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filterStatus = button.dataset.filterStatus;
    document.querySelectorAll("[data-filter-status]").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

els.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.leads, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "controle-leads.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#importButton").addEventListener("click", () => els.importFile.click());

els.importFile.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported)) throw new Error("Formato invalido");
    state.leads = imported;
    saveLeads();
    render();
  } catch {
    alert("Nao foi possivel importar o arquivo.");
  } finally {
    event.target.value = "";
  }
});

saveLeads();
render();

