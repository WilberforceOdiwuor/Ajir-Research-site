// research-overview.js
// Research Overview page only. No inline script — the page CSP is script-src 'self'.

/* ============================
   Helpers
============================ */

function ovFormatDate(dateStr) {
  if (typeof dateStr !== "string") return "";
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const date = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(dateStr);
  if (isNaN(date)) return dateStr;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Same allowlist the research index uses: relative paths into Research/ or legals/ only.
function ovIsSafePath(path) {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed) return false;
  if (/^(?:[a-z]+:|\/\/|#)/i.test(trimmed)) return false;
  return /^(?:\.{1,2}\/)?(?:Research|legals)\//.test(trimmed);
}

// Images are relative paths under assets/ only.
function ovIsSafeImage(path) {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed) return false;
  if (/^(?:[a-z]+:|\/\/|#)/i.test(trimmed)) return false;
  return /^(?:\.{1,2}\/)?assets\//.test(trimmed);
}

/* ============================
   Publications — rails, filters, modal
============================ */

function ovCreateFigure(item, variant) {
  const figure = document.createElement("figure");
  figure.className = `ov-figure ov-figure--${variant}`;

  if (ovIsSafeImage(item.image)) {
    const img = document.createElement("img");
    img.src = item.image;
    img.alt = "";           // decorative; the title carries the meaning
    img.loading = "lazy";
    img.decoding = "async";
    // A missing file leaves the quiet grey frame rather than a broken icon.
    img.addEventListener("error", () => img.remove());
    figure.appendChild(img);
  }

  return figure;
}

function ovCreateCard(item, onOpen) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "ov-card";
  card.setAttribute("aria-haspopup", "dialog");

  const title = document.createElement("h3");
  title.className = "ov-card__title";
  title.textContent = item.title || "";

  const meta = document.createElement("p");
  meta.className = "ov-card__meta";

  const type = document.createElement("span");
  type.className = "ov-card__type";
  type.textContent = item.type || "";

  const date = document.createElement("span");
  date.textContent = ovFormatDate(item.date);

  meta.append(type, date);
  card.append(ovCreateFigure(item, "card"), title, meta);
  card.addEventListener("click", () => onOpen(item));
  return card;
}

function ovCreateRail(type, items, onOpen) {
  const group = document.createElement("div");
  group.className = "ov-rail-group";
  group.dataset.railType = type;

  const head = document.createElement("div");
  head.className = "ov-rail-head ov-wrap";

  const title = document.createElement("h3");
  title.className = "ov-rail-title";
  title.textContent = type;

  const count = document.createElement("span");
  count.className = "ov-rule-label";
  count.textContent = items.length === 1 ? "1 paper" : `${items.length} papers`;

  head.append(title, count);

  const rail = document.createElement("div");
  rail.className = "ov-rail";
  rail.setAttribute("role", "list");
  rail.setAttribute("tabindex", "0");
  rail.setAttribute("aria-label", `${type} papers, newest first`);

  items.forEach(item => {
    const cell = document.createElement("div");
    cell.setAttribute("role", "listitem");
    cell.appendChild(ovCreateCard(item, onOpen));
    rail.appendChild(cell);
  });

  group.append(head, rail);
  return group;
}

function ovInitModal() {
  const dialog = document.querySelector("[data-paper-modal]");
  if (!dialog) return null;

  const titleEl = dialog.querySelector("[data-modal-title]");
  const metaEl = dialog.querySelector("[data-modal-meta]");
  const abstractEl = dialog.querySelector("[data-modal-abstract]");
  const findingsEl = dialog.querySelector("[data-modal-findings]");
  const linkEl = dialog.querySelector("[data-modal-link]");
  const closeEl = dialog.querySelector("[data-modal-close]");

  let lastFocused = null;

  if (closeEl) closeEl.addEventListener("click", () => dialog.close());

  // Click on the backdrop (outside the panel) closes.
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  });

  return function open(item) {
    lastFocused = document.activeElement;

    titleEl.textContent = item.title || "";

    metaEl.replaceChildren();
    const type = document.createElement("span");
    type.textContent = item.type || "";
    const date = document.createElement("span");
    date.textContent = ovFormatDate(item.date);
    metaEl.append(type, date);

    abstractEl.textContent = item.abstract || item.summary || "";

    findingsEl.replaceChildren();
    (item.findings || []).forEach(text => {
      const li = document.createElement("li");
      li.textContent = text;
      findingsEl.appendChild(li);
    });

    linkEl.href = ovIsSafePath(item.path) ? item.path : "./index.html";

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    if (closeEl) closeEl.focus();
  };
}

function ovInitFilters(buttons, groups) {
  function apply(active) {
    buttons.forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.filter === active));
    });
    groups.forEach(group => {
      group.hidden = active !== "all" && group.dataset.railType !== active;
    });
  }

  buttons.forEach(button => {
    button.type = "button";
    button.addEventListener("click", () => apply(button.dataset.filter));
  });

  apply("all");
}

async function ovInitPublications() {
  const host = document.querySelector("[data-publications]");
  if (!host) return;

  const source = host.dataset.source;
  if (!source) return;

  let items;
  try {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.items)) throw new Error("Invalid research JSON structure.");
    items = data.items;
  } catch (err) {
    console.error("Failed to load research index:", err);
    const fallback = document.createElement("p");
    fallback.className = "ov-rail-empty";
    fallback.textContent = "Papers could not be loaded. Browse the Research Index instead.";
    host.appendChild(fallback);
    return;
  }

  // Newest first, everywhere.
  const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Only build a rail for a type that actually has documents behind it.
  const byType = new Map();
  sorted.forEach(item => {
    const type = item.type || "Other";
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(item);
  });

  const openModal = ovInitModal();
  const groups = [];

  byType.forEach((typeItems, type) => {
    const group = ovCreateRail(type, typeItems, openModal || (() => {}));
    host.appendChild(group);
    groups.push(group);
  });

  // Chips are generated from the types present, so a type with no papers
  // never gets a chip.
  const filterHost = document.querySelector("[data-publication-filters]");
  if (filterHost) {
    const buttons = [];
    const makeButton = (value, label) => {
      const button = document.createElement("button");
      button.dataset.filter = value;
      button.textContent = label;
      button.setAttribute("aria-pressed", "false");
      filterHost.appendChild(button);
      buttons.push(button);
    };

    makeButton("all", "All");
    byType.forEach((typeItems, type) => makeButton(type, type));
    ovInitFilters(buttons, groups);
  }
}

document.addEventListener("DOMContentLoaded", ovInitPublications);
