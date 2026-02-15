/** Management modal: add ideas, triage inbox, manage backlog, plan quests */

import { poll } from "./state-poller.js";

const CAT_COLORS = { build: "#2ecc71", ship: "#e67e22", reach: "#3498db" };
const CAT_ICONS = { build: "\u{1F528}", ship: "\u{1F680}", reach: "\u{1F3AF}" };

let modal, currentTab;

export function initManagement() {
  modal = document.getElementById("mgmt-modal");
  const menuBtn = document.getElementById("menu-btn");
  const closeBtn = document.getElementById("mgmt-close");

  menuBtn.addEventListener("click", () => openModal());
  closeBtn.addEventListener("click", () => closeModal());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Tabs
  document.querySelectorAll(".mgmt-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // Add form
  const addInput = document.getElementById("add-input");
  const addBtn = document.getElementById("add-btn");
  addBtn.addEventListener("click", () => addIdea());
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addIdea();
  });

  // Triage button
  document.getElementById("triage-btn").addEventListener("click", () => triageInbox());
}

function openModal() {
  modal.classList.add("show");
  switchTab("add");
  document.getElementById("add-input").focus();
}

function closeModal() {
  modal.classList.remove("show");
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".mgmt-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  document.querySelectorAll(".mgmt-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tab}`);
  });

  if (tab === "inbox") loadInbox();
  if (tab === "backlog") loadBacklog();
  if (tab === "plan") loadPlanView();
  if (tab === "grimorio") loadGrimorio();
  if (tab === "eventos") loadEventos();
}

// ── Add ──
async function addIdea() {
  const input = document.getElementById("add-input");
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;
  const res = await apiPost("/api/add", { text });
  input.disabled = false;

  if (res.ok) {
    input.value = "";
    showFeedback("add-feedback", `\u2713 "${res.text}" adicionado ao inbox!`, "success");
    input.focus();
  } else {
    showFeedback("add-feedback", res.error || "Erro", "error");
  }
}

// ── Inbox ──
async function loadInbox() {
  const list = document.getElementById("inbox-list");
  list.innerHTML = '<div class="mgmt-loading">Carregando...</div>';

  const res = await fetch("/api/inbox");
  const items = await res.json();

  if (items.length === 0) {
    list.innerHTML = '<div class="mgmt-empty">Inbox vazio. Adicione ideias na aba "Adicionar".</div>';
    document.getElementById("triage-btn").disabled = true;
    return;
  }

  document.getElementById("triage-btn").disabled = false;
  list.innerHTML = items
    .map((text, i) => `<div class="mgmt-item inbox-item"><span class="mgmt-item-num">${i + 1}</span><span>${esc(text)}</span></div>`)
    .join("");
}

async function triageInbox() {
  const btn = document.getElementById("triage-btn");
  btn.disabled = true;
  btn.textContent = "Processando...";

  const res = await apiPost("/api/triage", {});

  if (res.ok) {
    showFeedback("triage-feedback", `\u2713 ${res.added.length} item(ns) movidos para o backlog!`, "success");
    loadInbox();
    setTimeout(() => {
      btn.textContent = "Processar Inbox \u2192 Backlog";
      btn.disabled = false;
    }, 1000);
  } else {
    showFeedback("triage-feedback", res.error || "Erro", "error");
    btn.textContent = "Processar Inbox \u2192 Backlog";
    btn.disabled = false;
  }
}

// ── Backlog ──
async function loadBacklog() {
  const list = document.getElementById("backlog-list");
  list.innerHTML = '<div class="mgmt-loading">Carregando...</div>';

  const res = await fetch("/api/backlog");
  const items = await res.json();

  if (items.length === 0) {
    list.innerHTML = '<div class="mgmt-empty">Backlog vazio. Adicione ideias e processe o inbox.</div>';
    return;
  }

  list.innerHTML = items
    .map((item) => {
      const color = CAT_COLORS[item.category] || "#7f8c9b";
      const icon = CAT_ICONS[item.category] || "";
      return `
        <div class="mgmt-item backlog-item" data-id="${item.id}">
          <div class="backlog-main">
            <span class="backlog-cat" style="color:${color}">${icon} ${item.category.toUpperCase()}</span>
            <span class="backlog-title">${esc(item.title)}</span>
          </div>
          <div class="backlog-meta">
            <span class="backlog-id">${item.id}</span>
            <span>Impacto: ${item.impact}</span>
            <span>~${item.effort_minutes}min</span>
            <div class="backlog-actions">
              <select class="backlog-cat-select" data-id="${item.id}">
                <option value="build" ${item.category === "build" ? "selected" : ""}>Build</option>
                <option value="ship" ${item.category === "ship" ? "selected" : ""}>Ship</option>
                <option value="reach" ${item.category === "reach" ? "selected" : ""}>Reach</option>
              </select>
              <button class="backlog-plan-btn" data-id="${item.id}" title="Iniciar como quest">&#x26A1;</button>
              <button class="backlog-del-btn" data-id="${item.id}" title="Remover">&times;</button>
            </div>
          </div>
        </div>`;
    })
    .join("");

  // Wire handlers
  list.querySelectorAll(".backlog-cat-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await apiPost("/api/backlog/edit", { id: sel.dataset.id, category: sel.value });
      loadBacklog();
    });
  });

  list.querySelectorAll(".backlog-plan-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await planQuest(btn.dataset.id);
    });
  });

  list.querySelectorAll(".backlog-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await apiPost("/api/backlog/delete", { id: btn.dataset.id });
      loadBacklog();
    });
  });
}

// ── Plan ──
async function loadPlanView() {
  const content = document.getElementById("plan-content");
  content.innerHTML = '<div class="mgmt-loading">Carregando...</div>';

  // Check if quest already active
  const todayRes = await fetch("/api/today");
  const today = await todayRes.json();

  if (today.active) {
    content.innerHTML = `
      <div class="plan-active">
        <div class="plan-active-label">Quest ativa:</div>
        <div class="plan-active-title">${esc(today.title)}</div>
        <div class="plan-active-meta">${today.category.toUpperCase()} \u00B7 ~${today.effort_minutes}min</div>
        <div class="plan-hint">Conclua a quest atual antes de planejar uma nova.</div>
      </div>`;
    return;
  }

  // Load backlog for planning
  const res = await fetch("/api/backlog");
  const items = await res.json();

  if (items.length === 0) {
    content.innerHTML = '<div class="mgmt-empty">Backlog vazio. Adicione ideias primeiro.</div>';
    return;
  }

  let html = `
    <button class="mgmt-btn-primary plan-auto-btn" id="plan-auto">\u26A1 Auto-selecionar melhor quest</button>
    <div class="plan-divider">ou escolha manualmente:</div>
    <div class="plan-candidates">`;

  for (const item of items) {
    const color = CAT_COLORS[item.category] || "#7f8c9b";
    const icon = CAT_ICONS[item.category] || "";
    html += `
      <div class="plan-candidate" data-id="${item.id}">
        <span class="plan-cand-cat" style="color:${color}">${icon}</span>
        <span class="plan-cand-title">${esc(item.title)}</span>
        <span class="plan-cand-effort">~${item.effort_minutes}min</span>
      </div>`;
  }

  html += "</div>";
  content.innerHTML = html;

  // Auto plan
  document.getElementById("plan-auto").addEventListener("click", () => planQuest(null));

  // Manual pick
  content.querySelectorAll(".plan-candidate").forEach((el) => {
    el.addEventListener("click", () => planQuest(el.dataset.id));
  });
}

async function planQuest(backlogId) {
  const body = backlogId ? { backlog_id: backlogId } : {};
  const res = await apiPost("/api/plan", body);

  if (res.ok) {
    closeModal();
    poll(); // Refresh game state
  } else {
    const content = document.getElementById("plan-content");
    content.innerHTML = `<div class="mgmt-error">${res.error || "Erro ao planejar"}</div>`;
  }
}

// ── Grimorio (Loot Collection Book) ──
const ALL_LOOT = [
  { id: "build_shard", name: "Build Shard",  icon: "\u2692",       rarity: "common", desc: "Fragmento de construcao" },
  { id: "ship_token",  name: "Ship Token",   icon: "\u26F5",       rarity: "common", desc: "Token de entrega" },
  { id: "reach_leaf",  name: "Reach Leaf",   icon: "\uD83C\uDF3F", rarity: "common", desc: "Folha de crescimento" },
  { id: "common_gem",  name: "Gema Comum",   icon: "\uD83D\uDC8E", rarity: "common", desc: "Gema basica" },
  { id: "rare_badge",  name: "Badge Raro",   icon: "\u2605",       rarity: "rare",   desc: "Insignia rara - sorte!" },
  { id: "epic_badge",  name: "Badge Epico",  icon: "\u2605\u2605", rarity: "epic",   desc: "Insignia epica - lendario!" },
];

const RARITY_COLORS = { common: "#7f8c9b", rare: "#3498db", epic: "#8e44ad" };

async function loadGrimorio() {
  const container = document.getElementById("grimorio-content");
  if (!container) return;
  container.innerHTML = '<div class="mgmt-loading">Carregando...</div>';

  const res = await fetch("/api/state");
  const state = await res.json();
  const discovered = new Set(state.inventory || []);

  try {
    const logRes = await fetch("/api/log?limit=1000");
    const log = await logRes.json();
    for (const entry of log) {
      if (entry.loot) {
        for (const item of entry.loot) discovered.add(item);
      }
    }
  } catch { /* ok */ }

  const discoveredCount = ALL_LOOT.filter(l => discovered.has(l.id)).length;
  let html = `<div class="grimorio-header">Itens Descobertos: ${discoveredCount}/${ALL_LOOT.length}</div>`;
  html += `<div class="grimorio-grid">`;

  for (const loot of ALL_LOOT) {
    const found = discovered.has(loot.id);
    const rarityColor = RARITY_COLORS[loot.rarity];
    html += `<div class="grimorio-item ${found ? 'discovered' : 'undiscovered'}">
      <div class="grimorio-icon">${found ? loot.icon : "?"}</div>
      <div class="grimorio-name" style="color:${found ? rarityColor : '#3a3a5a'}">${found ? loot.name : "???"}</div>
      <div class="grimorio-rarity" style="color:${rarityColor}">${loot.rarity.toUpperCase()}</div>
      ${found ? `<div class="grimorio-desc">${loot.desc}</div>` : ''}
    </div>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}

// ── Eventos (Celebrate + Revenue) ──
const SIZE_OPTIONS = [
  { id: "small",  label: "Pequeno",  desc: "Bug fix, feature menor",       gold: 10,  icon: "\u2B50" },
  { id: "medium", label: "Medio",    desc: "Lancamento, feature grande",   gold: 25,  icon: "\u2B50\u2B50" },
  { id: "big",    label: "Grande",   desc: "Primeira venda, deploy loja",  gold: 50,  icon: "\uD83C\uDF1F" },
  { id: "epic",   label: "Epico!",   desc: "Marco enorme, 1000 usuarios",  gold: 100, icon: "\uD83C\uDF86" },
];

async function loadEventos() {
  const container = document.getElementById("eventos-content");
  if (!container) return;

  // Fetch current revenue and celebrations
  const [revRes, celRes] = await Promise.all([
    fetch("/api/revenue").then(r => r.json()),
    fetch("/api/celebrations").then(r => r.json()),
  ]);

  let html = "";

  // ── Revenue tracker ──
  html += `<div class="eventos-section">
    <div class="eventos-title">\uD83D\uDCB0 Revenue Tracker</div>
    <div class="eventos-revenue-total">\u20AC${revRes.total?.toFixed(2) || "0.00"}</div>
    <div class="eventos-revenue-form">
      <input type="number" id="revenue-amount" class="mgmt-input" placeholder="Valor em EUR" step="0.01" min="0.01" style="width:120px">
      <input type="text" id="revenue-note" class="mgmt-input" placeholder="Nota (ex: venda app)" style="flex:1">
      <button class="mgmt-btn-primary" id="revenue-add-btn">+ Adicionar</button>
    </div>`;

  // Recent revenue entries
  if (revRes.entries?.length > 0) {
    const recent = revRes.entries.slice(-5).reverse();
    html += `<div class="eventos-history-mini">`;
    for (const e of recent) {
      html += `<div class="eventos-rev-entry"><span>\u20AC${e.amount.toFixed(2)}</span><span class="eventos-rev-note">${esc(e.note || "")}</span><span class="eventos-rev-date">${e.date}</span></div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  // ── Celebrate form ──
  html += `<div class="eventos-section">
    <div class="eventos-title">\uD83C\uDF89 Celebrar Conquista</div>
    <input type="text" id="celebrate-text" class="mgmt-input" placeholder="O que aconteceu? (ex: Lancei v1.0!)" style="width:100%;margin-bottom:8px">
    <div class="eventos-sizes">`;

  for (const s of SIZE_OPTIONS) {
    html += `<button class="eventos-size-btn" data-size="${s.id}">
      <span class="eventos-size-icon">${s.icon}</span>
      <span class="eventos-size-label">${s.label}</span>
      <span class="eventos-size-desc">${s.desc}</span>
      <span class="eventos-size-gold">+${s.gold}g</span>
    </button>`;
  }

  html += `</div>
    <div id="celebrate-feedback" class="mgmt-feedback"></div>
  </div>`;

  // ── History ──
  if (celRes.length > 0) {
    html += `<div class="eventos-section">
      <div class="eventos-title">\uD83D\uDCDC Historico</div>
      <div class="eventos-history">`;
    for (const c of celRes.slice(0, 20)) {
      const sizeInfo = SIZE_OPTIONS.find(s => s.id === c.size) || SIZE_OPTIONS[0];
      html += `<div class="eventos-hist-item">
        <span class="eventos-hist-icon">${sizeInfo.icon}</span>
        <span class="eventos-hist-text">${esc(c.text)}</span>
        <span class="eventos-hist-gold">+${c.gold}g</span>
        <span class="eventos-hist-date">${c.ts?.slice(0, 10) || ""}</span>
      </div>`;
    }
    html += `</div></div>`;
  }

  container.innerHTML = html;

  // Wire revenue add
  document.getElementById("revenue-add-btn").addEventListener("click", async () => {
    const amountInput = document.getElementById("revenue-amount");
    const noteInput = document.getElementById("revenue-note");
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) return;

    const res = await apiPost("/api/revenue", { amount, note: noteInput.value });
    if (res.ok) {
      amountInput.value = "";
      noteInput.value = "";
      loadEventos(); // refresh
      poll(); // refresh game state
    }
  });

  // Wire celebrate buttons
  container.querySelectorAll(".eventos-size-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const text = document.getElementById("celebrate-text").value.trim();
      if (!text) {
        showFeedback("celebrate-feedback", "Descreva o que aconteceu!", "error");
        return;
      }
      const size = btn.dataset.size;
      const res = await apiPost("/api/celebrate", { text, size });
      if (res.ok) {
        document.getElementById("celebrate-text").value = "";
        showFeedback("celebrate-feedback", `\uD83C\uDF89 ${res.text} — +${res.gold}g!`, "success");
        loadEventos(); // refresh history
        poll(); // refresh game state
      } else {
        showFeedback("celebrate-feedback", res.error || "Erro", "error");
      }
    });
  });
}

// ── Helpers ──
async function apiPost(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  } catch {
    return { error: "Erro de rede" };
  }
}

function showFeedback(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `mgmt-feedback ${type}`;
  setTimeout(() => {
    el.textContent = "";
    el.className = "mgmt-feedback";
  }, 3000);
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ── Power Rating Calculator ──
export function calcPowerRating(state) {
  if (!state) return 0;
  const p = state.player;
  const tableLevels = ["build", "ship", "reach"].reduce(
    (sum, cat) => sum + (state.tables[cat]?.level || 1),
    0
  );
  // Formula: level*100 + XP/10 + streak*20 + tableLevels*50 + totalDone*10 + fortune/2
  let fortune = 0;
  const LOOT_VALUES = {
    build_shard: 15, ship_token: 15, reach_leaf: 15,
    common_gem: 10, rare_badge: 50, epic_badge: 100,
  };
  for (const item of state.inventory || []) {
    fortune += LOOT_VALUES[item] || 0;
  }

  return Math.floor(
    p.level * 100 +
    p.xp / 10 +
    p.streak * 20 +
    tableLevels * 50 +
    state.stats.total_done * 10 +
    fortune / 2
  );
}
