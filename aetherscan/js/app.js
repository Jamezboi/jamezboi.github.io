/* ═══════════════════════════════════════════════════════════════════════
   AetherScan Console — single-page app
   Talks to the local API (127.0.0.1) with the per-launch session token.
   ═══════════════════════════════════════════════════════════════════════ */

"use strict";

/* ------------------------------------------------------------------ */
/* 0. Small utilities                                                  */
/* ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const TOKEN = new URLSearchParams(location.search).get("token") || "";

function api(path, options = {}) {
  const opts = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Aether-Token": TOKEN,
      ...(options.headers || {}),
    },
  };
  return fetch(`/api${path}`, opts).then(async (resp) => {
    let body = {};
    try { body = await resp.json(); } catch { /* empty body ok */ }
    if (!resp.ok) {
      const err = new Error(body.message || body.error || `HTTP ${resp.status}`);
      err.status = resp.status;
      err.body = body;
      throw err;
    }
    return body;
  });
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(message, kind = "info", ms = 3200) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  $("#toast-stack").appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 320);
  }, ms);
}

function fmtAgo(ts) {
  if (!ts) return "—";
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function debounce(fn, ms = 220) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const TYPE_ICONS = {
  phone: "📱", computer: "💻", router: "📡", iot: "🔌", tv: "📺",
  printer: "🖨️", console: "🎮", nas: "🗄️", vm: "🖥️", camera: "📷",
  unknown: "❓",
};

function toolsHtml(f) {
  if (!f.tools || !f.tools.length) return "";
  return `<div class="finding-tools">
    <div class="finding-tools-title">Investigate</div>
    ${f.tools.map((t, i) => `
      <div class="tool-cmd">
        <span class="tool-label">${esc(t.tool)}</span>
        <code class="tool-code">${esc(t.command)}</code>
        <button class="tool-copy" data-cmd="${esc(t.command)}" title="Copy command">⧉</button>
        ${t.tool === "tcp-console" ? `<button class="tool-open-console btn btn-ghost btn-sm" data-cmd="${esc(t.command)}">Open console</button>` : ""}
      </div>`).join("")}
  </div>`;
}

function scorePillClass(score) {
  if (score == null) return "";
  if (score >= 85) return "score-good";
  if (score >= 60) return "score-warn";
  return "score-bad";
}

/* ------------------------------------------------------------------ */
/* 1. Global state                                                     */
/* ------------------------------------------------------------------ */

const state = {
  status: null,
  devices: [],
  audits: {},
  progress: null,
  progressTimer: null,
  view: "dashboard",
  typeFilter: "all",
  search: "",
  favoritesOnly: false,
  showDemo: true,        // demo-tagged devices; auth flips this off in live mode
  overviewMode: false,
  openDeviceId: null,
  monitorPoll: null,
  config: { profile: "standard", ping: 500, online: false, credAudit: false,
            sweepTcp: false },
};

/* Live mode = paired with a real engine. Demo-tagged clutter is hidden
   there by default and can be purged entirely. */
function isLiveMode() {
  return !!(window.AetherPlatform && window.AetherPlatform.pairing &&
            window.AetherPlatform.pairing.connected);
}

async function purgeDemoDevices(silent) {
  try {
    const res = await api("/demo/clear", { method: "POST" });
    if (!silent) toast(`Removed ${res.removed} demo device(s)`, "ok");
    await refreshDevices();
    return res;
  } catch (err) { if (!silent) toast(err.message, "err"); return null; }
}

/* ------------------------------------------------------------------ */
/* 2. View router                                                      */
/* ------------------------------------------------------------------ */

const VIEW_META = {
  dashboard: ["Dashboard", "Your network at a glance"],
  devices: ["Devices", "Everything we've discovered on this network"],
  security: ["Security", "Non-invasive audit of your own devices"],
  monitor: ["Monitor", "Live watchman for joins, leaves and changes"],
  reports: ["Reports", "Export the inventory and findings"],
  license: ["License", "Edition, tiers and activation"],
  settings: ["Settings", "Tuning and diagnostics"],
};

function showView(view) {
  state.view = view;
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${view}`));
  $$(".nav-item").forEach((n) => n.classList.toggle("is-active", n.dataset.view === view));
  const [title, sub] = VIEW_META[view] || ["AetherScan", ""];
  $("#view-title").textContent = title;
  $("#view-subtitle").textContent = sub;
  $("#sidebar").classList.remove("open");
  if (view === "reports") renderHistory();
  if (view === "license") renderLicense();
  if (view === "settings") loadSettingsView();
  if (view === "monitor") pollMonitor();
}

$$(".nav-item").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
$$("[data-goto]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.goto)));
$("#btn-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#btn-theme").addEventListener("click", () => {
  const cur = document.body.dataset.theme;
  const next = cur === "dark" ? "light" : "dark";
  document.body.dataset.theme = next;
  localStorage.setItem("aetherscan-theme", next);
});
const savedTheme = localStorage.getItem("aetherscan-theme");
if (savedTheme) document.body.dataset.theme = savedTheme;

/* ------------------------------------------------------------------ */
/* 3. Scan engine UI                                                   */
/* ------------------------------------------------------------------ */

async function startScan(profileOverride) {
  const profile = profileOverride || state.config.profile;
  try {
    const res = await api("/scan", {
      method: "POST",
      body: JSON.stringify({ profile, audit: true, deep: true,
                             sweep_tcp: !!state.config.sweepTcp }),
    });
    $("#scan-rail").hidden = false;
    $("#scan-spinner").hidden = false;
    watchProgress();
    toast(`Scan started (${profile} profile)`, "info");
  } catch (err) {
    if (err.status === 402) {
      paywallToast(err.body);
    } else {
      toast(err.message, "err");
    }
  }
}

function watchProgress() {
  clearInterval(state.progressTimer);
  state.progressTimer = setInterval(async () => {
    try {
      const { progress } = await api("/scan/progress");
      renderProgress(progress);
      if (!progress.running) {
        clearInterval(state.progressTimer);
        state.progressTimer = null;
        if (progress.phase === "done") {
          toast(`Scan complete — ${progress.found} devices`, "ok");
          setTimeout(() => { $("#scan-rail").hidden = true; }, 2500);
        }
        await Promise.all([refreshDevices(), refreshStatus()]);
      }
    } catch { /* server restarting; keep polling */ }
  }, 700);
}

function renderProgress(p) {
  $("#scan-rail").hidden = false;
  $("#scan-progress-fill").style.width = `${p.percent}%`;
  $("#scan-percent").textContent = `${p.percent}%`;
  $("#scan-phase-label").textContent = p.phase === "done" ? "Complete"
    : p.phase === "canceled" ? "Canceled"
    : p.phase === "error" ? "Failed"
    : p.phase.charAt(0).toUpperCase() + p.phase.slice(1);
  $("#scan-detail-label").textContent = p.detail || "";
  $("#scan-spinner").hidden = !p.running;
  $("#btn-cancel-scan").style.display = p.running ? "" : "none";
  const log = $("#scan-log");
  log.innerHTML = (p.log || []).slice(-40)
    .map((e) => `<div><b>${esc(e.iso)}</b>${esc(e.message)}</div>`).join("");
  log.scrollTop = log.scrollHeight;
}

$("#btn-scan").addEventListener("click", () => startScan());
$("#btn-first-scan").addEventListener("click", () => startScan());
$("#btn-cancel-scan").addEventListener("click", async () => {
  await api("/scan/cancel", { method: "POST" });
  toast("Canceling…", "info");
});
$("#btn-seed-demo").addEventListener("click", async () => {
  try {
    const res = await api("/demo/seed", { method: "POST" });
    toast(`Seeded ${res.seeded} demo devices`, "ok");
    await Promise.all([refreshDevices(), refreshStatus()]);
  } catch (err) {
    toast(err.status === 403 ? "Demo seeding needs dev mode (run with --dev)" : err.message, "err");
  }
});

function paywallToast(gate) {
  toast(gate.message || "Premium feature", "err", 5000);
  showView("license");
}

/* ------------------------------------------------------------------ */
/* 4. Status + dashboard                                               */
/* ------------------------------------------------------------------ */

async function refreshStatus() {
  try {
    state.status = await api("/status");
    renderStatus();
  } catch (err) {
    if (err.status === 401) $("#view-subtitle").textContent =
      "Session token missing — relaunch from the terminal.";
  }
}

function renderStatus() {
  const s = state.status;
  if (!s) return;
  $("#brand-tier").textContent = s.license.development
    ? "Development build" : `${s.license.tier_label} edition`;
  $("#brand-tier").className = s.license.development ? "dev" : "";

  $("#stat-devices").textContent = s.stats.devices || 0;
  const audits = Object.values(state.audits);
  if (audits.length) {
    const avg = Math.round(audits.reduce((a, r) => a + r.score, 0) / audits.length);
    $("#stat-score").textContent = `${avg} · ${gradeOf(avg)}`;
    setDial(avg);
  }
  if (s.network?.primary) {
    $("#stat-wifi").textContent = s.network.primary.ip;
    $("#net-pill").hidden = false;
    $("#net-pill-label").textContent =
      `${s.network.primary.cidr} · gw ${s.network.gateway || "?"}`;
  }
  const history = s.stats.scan_runs || 0;
  $("#stat-lastscan").textContent = history ? `${history} runs` : "—";
  $("#badge-devices").textContent = s.stats.devices || 0;
  $("#badge-devices").hidden = !s.stats.devices;

  renderTypeBars();
  renderFavorites();
  renderEvents();
}

function gradeOf(score) {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C"
    : score >= 40 ? "D" : "F";
}

function setDial(score) {
  const dial = $("#score-dial");
  dial.style.setProperty("--score-pct", score);
  const color = score >= 85 ? "var(--green)" : score >= 60 ? "var(--orange)" : "var(--red)";
  dial.style.background =
    `radial-gradient(closest-side, var(--surface-strong) 79%, transparent 80% 100%),` +
    `conic-gradient(${color} ${score}%, var(--border) 0)`;
  $("#dial-score").textContent = score;
  $("#dial-grade").textContent = `grade ${gradeOf(score)}`;
}

function renderTypeBars() {
  const byType = state.status?.stats?.by_type || {};
  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  const wrap = $("#type-bars");
  if (!entries.length) {
    wrap.innerHTML = `<p class="empty-hint">Run a scan to populate.</p>`;
    return;
  }
  wrap.innerHTML = entries.map(([type, n]) => `
    <div class="type-bar-row">
      <span class="lbl">${TYPE_ICONS[type] || "❓"} ${esc(type)}</span>
      <div class="type-bar-track"><div class="type-bar-fill" style="width:${(n / max) * 100}%"></div></div>
      <span class="num">${n}</span>
    </div>`).join("");
}

function renderFavorites() {
  const favs = state.devices.filter((d) => d.favorite).slice(0, 8);
  const row = $("#fav-row");
  if (!favs.length) {
    row.innerHTML = `<p class="empty-hint">Star devices to pin them here.</p>`;
    return;
  }
  row.innerHTML = favs.map((d) => `
    <div class="fav-chip" data-device="${esc(d.id)}">
      <div class="device-avatar t-${esc(d.device_type)}">${TYPE_ICONS[d.device_type] || "❓"}</div>
      <div><strong>${esc(d.display_name)}</strong><span>${esc(d.ip)}</span></div>
    </div>`).join("");
  $$(".fav-chip", row).forEach((chip) =>
    chip.addEventListener("click", () => openDrawer(chip.dataset.device)));
}

async function renderEvents() {
  try {
    const { events } = await api("/events?limit=40");
    const feed = $("#feed-activity");
    if (!events.length) {
      feed.innerHTML = `<li class="empty-hint">Events will appear here.</li>`;
      return;
    }
    const tagFor = (kind) =>
      kind.includes("joined") || kind.includes("discovered") ? ["joined", "new"]
      : kind.includes("left") ? ["left", "gone"]
      : kind.includes("audit") || kind.includes("vuln") ? ["security", "audit"]
      : ["info", "info"];
    feed.innerHTML = events.slice(0, 18).map((e) => {
      const [cls, label] = tagFor(e.kind);
      return `<li><time>${esc(e.iso?.slice(11, 16) || "")}</time>
        <span class="feed-tag ${cls}">${label}</span>
        <span>${esc(e.message)}</span></li>`;
    }).join("");
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* 5. Devices                                                          */
/* ------------------------------------------------------------------ */

async function refreshDevices() {
  try {
    const { devices } = await api("/devices");
    state.devices = devices;
    devices.forEach((d) => {
      if (d.ports?.length) {
        // Rough client-side score preview from exposed risky ports.
        const risky = d.ports.filter((p) => p.risk >= 3).length;
        state.audits[d.id] = state.audits[d.id] ||
          { score: Math.max(20, 100 - risky * 18), grade: null, preview: true };
      }
    });
    renderTypeChips();
    renderDevices();
    renderSecurity();
  } catch { /* token error already surfaced by status */ }
}

function renderTypeChips() {
  const types = ["all", ...new Set(state.devices.map((d) => d.device_type))];
  const row = $("#type-chips");
  row.innerHTML = types.map((t) => `
    <button class="chip ${state.typeFilter === t ? "is-active" : ""}" data-type="${esc(t)}">
      ${t === "all" ? "All" : `${TYPE_ICONS[t] || "❓"} ${esc(t)}`}
    </button>`).join("");
  $$(".chip", row).forEach((chip) => chip.addEventListener("click", () => {
    state.typeFilter = chip.dataset.type;
    renderTypeChips();
    renderDevices();
  }));
}

function filteredDevices() {
  const q = state.search.toLowerCase();
  return state.devices.filter((d) => {
    if (state.favoritesOnly && !d.favorite) return false;
    if (!state.showDemo && (d.tags || []).includes("demo")) return false;
    if (state.typeFilter !== "all" && d.device_type !== state.typeFilter) return false;
    if (!q) return true;
    return [d.display_name, d.ip, d.mac, d.vendor, d.hostname, d.model, d.device_type]
      .some((v) => (v || "").toLowerCase().includes(q));
  });
}

function renderOverview() {
  const wrap = $("#overview-wrap");
  if (!wrap) return;
  if (!state.overviewMode) { wrap.hidden = true; wrap.innerHTML = ""; return; }
  wrap.hidden = false;
  const order = { critical: 4, high: 3, medium: 2, low: 1 };
  const rows = filteredDevices().map((d) => {
    const audit = state.audits[d.id];
    const findings = (audit && !audit.preview ? audit.findings : []) || [];
    const top = [...findings].sort((a, b) =>
      (order[b.severity] || 0) - (order[a.severity] || 0))[0];
    const riskyPorts = (d.ports || []).filter(p => p.risk >= 3);
    const risk = top ? top.severity : riskyPorts.length ? "high" : "";
    const ports = (d.ports || []).map(p => p.port);
    return { d, audit, top, risk, ports };
  }).sort((a, b) => {
    const sa = a.audit && !a.audit.preview ? a.audit.score : 100;
    const sb = b.audit && !b.audit.preview ? b.audit.score : 100;
    if (sa !== sb) return sa - sb;
    return (order[b.risk] || 0) - (order[a.risk] || 0);
  });
  wrap.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <header class="card-head"><h2>Risk overview</h2>
        <span class="card-hint">weakest first · click a row for details</span></header>
      <table class="table">
        <thead><tr><th>Device</th><th>IP</th><th>Type</th><th>Ports</th><th>Top exposure</th><th>Score</th></tr></thead>
        <tbody>
        ${rows.map(({ d, audit, top, risk, ports }) => `
          <tr class="overview-row" data-device="${esc(d.id)}" style="cursor:pointer">
            <td><strong>${esc(d.display_name)}</strong>
                <span style="color:var(--text-3);font-size:11px;display:block">${esc(d.vendor || "")}</span></td>
            <td><code>${esc(d.ip)}</code></td>
            <td>${TYPE_ICONS[d.device_type] || "❓"} ${esc(d.device_type)}</td>
            <td style="font-family:var(--mono);font-size:12px">${ports.length ? ports.join(" ") : "—"}</td>
            <td>${top ? `<span class="sev-badge ${esc(top.severity)}">${esc(top.severity)}</span> ${esc(top.title)}`
                      : risk ? `<span class="sev-badge ${esc(risk)}">open</span> risky port exposed`
                      : `<span style="color:var(--text-3)">no findings yet</span>`}</td>
            <td>${audit && !audit.preview
                  ? `<span class="pill ${scorePillClass(audit.score)}">${audit.score}</span>` : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  $$(".overview-row", wrap).forEach((row) =>
    row.addEventListener("click", () => openDrawer(row.dataset.device)));
}

function renderDevices() {
  renderOverview();
  const grid = $("#device-grid");
  const devices = filteredDevices();
  if (!state.devices.length) {
    grid.innerHTML = $("#devices-empty") ? originalEmpty : "";
    return;
  }
  if (!devices.length) {
    grid.innerHTML = `<div class="empty-state"><h3>No matches</h3>
      <p>Try clearing the search or filters.</p></div>`;
    return;
  }
  grid.innerHTML = devices.map((d, i) => deviceCardHTML(d, i)).join("");
  $$(".device-card", grid).forEach((card) => {
    card.addEventListener("click", (ev) => {
      if (ev.target.closest(".fav-star")) return;
      openDrawer(card.dataset.device);
    });
  });
  $$(".fav-star", grid).forEach((star) => star.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const id = star.closest(".device-card").dataset.device;
    const device = state.devices.find((d) => d.id === id);
    try {
      await api(`/device/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ favorite: !device.favorite }),
      });
      device.favorite = !device.favorite;
      renderDevices();
      renderFavorites();
      toast(device.favorite ? "Pinned to favorites" : "Unpinned", "info", 1600);
    } catch (err) { toast(err.message, "err"); }
  }));
}

const originalEmpty = $("#device-grid").innerHTML;

function deviceCardHTML(d, i) {
  const audit = state.audits[d.id];
  const portCount = d.open_port_count || 0;
  const pills = [
    `<span class="pill type">${TYPE_ICONS[d.device_type] || "❓"} ${esc(d.device_type)}</span>`,
    d.is_gateway ? `<span class="pill gateway">GATEWAY</span>` : "",
    portCount ? `<span class="pill ports">${portCount} open port${portCount > 1 ? "s" : ""}</span>` : "",
    audit && !audit.preview ? `<span class="pill ${scorePillClass(audit.score)}">score ${audit.score}</span>` : "",
  ].filter(Boolean).join("");
  return `
  <article class="device-card ${d.is_gateway ? "is-gateway" : ""}" data-device="${esc(d.id)}"
           style="animation-delay:${Math.min(i * 26, 300)}ms">
    <div class="device-card-top">
      <div class="device-avatar t-${esc(d.device_type)}">${TYPE_ICONS[d.device_type] || "❓"}</div>
      <div class="device-id">
        <strong>${esc(d.display_name)}</strong>
        <span>${esc(d.vendor || "Unknown vendor")}${d.model ? " · " + esc(d.model) : ""}</span>
      </div>
    </div>
    <div class="device-meta">${pills}</div>
    <div class="device-mac">${esc(d.ip)} · ${esc(d.mac || "MAC unknown")}</div>
    <button class="fav-star ${d.favorite ? "on" : ""}" title="Favorite">
      <svg viewBox="0 0 24 24" width="15" height="15"><path d="m12 3.6 2.5 5.2 5.7.7-4.2 4 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6-4.2-4 5.7-.7z" fill="currentColor"/></svg>
    </button>
  </article>`;
}

$("#device-search").addEventListener("input", debounce((e) => {
  state.search = e.target.value;
  renderDevices();
}, 150));
$("#chk-favorites").addEventListener("change", (e) => {
  state.favoritesOnly = e.target.checked;
  renderDevices();
});

/* ------------------------------------------------------------------ */
/* 6. Device drawer                                                    */
/* ------------------------------------------------------------------ */

async function openDrawer(deviceId) {
  state.openDeviceId = deviceId;
  try {
    const { device } = await api(`/device/${encodeURIComponent(deviceId)}`);
    renderDrawer(device);
    $("#device-drawer").hidden = false;
    $("#drawer-backdrop").hidden = false;
  } catch (err) { toast(err.message, "err"); }
}

function closeDrawer() {
  $("#device-drawer").hidden = true;
  $("#drawer-backdrop").hidden = true;
  state.openDeviceId = null;
}
$("#drawer-close").addEventListener("click", closeDrawer);
$("#drawer-backdrop").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

function renderDrawer(d) {
  $("#drawer-avatar").textContent = TYPE_ICONS[d.device_type] || "❓";
  $("#drawer-avatar").className = `device-avatar t-${d.device_type}`;
  $("#drawer-name").textContent = d.display_name;
  $("#drawer-sub").textContent =
    `${d.vendor || "Unknown vendor"} · ${d.ip}${d.is_gateway ? " · gateway" : ""}`;

  const audit = state.audits[d.id];
  const era = d.era;
  const profile = d.vendor_profile;

  $("#drawer-body").innerHTML = `
    <div class="drawer-section">
      <div class="drawer-actions">
        <button class="btn btn-ghost btn-sm" data-act="rescan">Re-scan ports</button>
        <button class="btn btn-ghost btn-sm" data-act="audit">Security audit</button>
        <button class="btn btn-ghost btn-sm" data-act="ping">Ping</button>
        ${(d.ports || []).some(p => [23, 2323].includes(p.port)) ? `<button class="btn btn-ghost btn-sm" data-act="telnet">TCP console</button>` : ""}
        <button class="btn btn-danger btn-sm" data-act="forget">Forget</button>
      </div>
      <div class="drawer-input-row">
        <input id="rename-input" placeholder="Custom name…" value="${esc(d.custom_name || "")}" maxlength="64"/>
        <button class="btn btn-primary btn-sm" data-act="rename">Save</button>
      </div>
    </div>

    <div class="drawer-section">
      <h3>Identity</h3>
      <div class="kv-grid">
        <div class="kv"><span>IP address</span><strong>${esc(d.ip)}</strong></div>
        <div class="kv"><span>MAC address</span><strong>${esc(d.mac || "—")}</strong></div>
        <div class="kv"><span>Vendor</span><strong>${esc(d.vendor || "Unknown")}</strong></div>
        <div class="kv"><span>Type</span><strong>${esc(d.device_type)}</strong></div>
        <div class="kv"><span>Hostname</span><strong>${esc(d.hostname || "—")}</strong></div>
        <div class="kv"><span>mDNS name</span><strong>${esc(d.mdns_name || "—")}</strong></div>
        <div class="kv"><span>NetBIOS name</span><strong>${esc(d.netbios_name || "—")}</strong></div>
        <div class="kv"><span>Model (UPnP)</span><strong>${esc(d.model || d.upnp || "—")}</strong></div>
        <div class="kv kv-wide"><span>OS guess</span><strong>${esc(d.os_guess || "—")}</strong></div>
        ${d.locally_administered
          ? `<div class="kv kv-wide"><span>MAC note</span><strong>Randomized / locally-administered MAC — vendor can't be resolved.</strong></div>`
          : ""}
      </div>
    </div>

    ${era ? `
    <div class="drawer-section">
      <h3>Manufacturing era</h3>
      <div class="kv"><span>OUI registered</span><strong>${esc(era.oui_registered)}</strong></div>
      <p class="era-note">${esc(era.era_label)} · ${esc(era.basis)}.</p>
    </div>` : ""}

    ${profile ? `
    <div class="drawer-section">
      <h3>About the maker</h3>
      <div class="kv-grid">
        <div class="kv"><span>Headquarters</span><strong>${esc(profile.hq)}</strong></div>
        <div class="kv"><span>Founded</span><strong>${esc(profile.founded)}</strong></div>
        <div class="kv kv-wide"><span>Note</span><strong>${esc(profile.note)}</strong></div>
      </div>
    </div>` : ""}

    <div class="drawer-section">
      <h3>Open ports</h3>
      ${d.ports?.length ? `
      <table class="port-table">
        <thead><tr><th>Port</th><th>Service</th><th>Risk</th><th>Detail</th></tr></thead>
        <tbody>
          ${d.ports.map((p) => `
          <tr>
            <td><strong>${p.port}</strong>/tcp</td>
            <td>${esc(p.service)}${p.banner ? `<br/><span style="color:var(--text-3);font-size:10.5px">${esc(p.banner.slice(0, 46))}</span>` : ""}</td>
            <td class="risk risk-${p.risk}">${["none", "low", "med", "high", "crit"][p.risk] || "?"}</td>
            <td style="color:var(--text-2);font-size:11.5px">${esc(p.desc)}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<p class="empty-hint">No open ports recorded. Use “Re-scan ports”.</p>`}
    </div>

    ${audit && !audit.preview ? `
    <div class="drawer-section">
      <h3>Latest audit</h3>
      <div class="audit-block">
        <div class="audit-score-line">
          <strong>${audit.score}</strong>
          <span class="grade" style="background:${audit.score >= 85 ? "var(--green)" : audit.score >= 60 ? "var(--orange)" : "var(--red)"}">${esc(audit.grade)}</span>
          <span style="color:var(--text-3);font-size:11.5px">${audit.duration_ms} ms · ${audit.findings.length} finding(s)</span>
        </div>
        ${audit.findings.map((f) => `
          <div class="finding-card sev-${esc(f.severity)}" style="margin-bottom:9px">
            <div class="finding-head"><h3>${esc(f.title)}</h3>
            <span class="sev-badge ${esc(f.severity)}">${esc(f.severity)}</span></div>
            <p class="finding-desc">${esc(f.description)}</p>
            <p class="finding-fix"><b>Fix:</b> ${esc(f.remediation)}</p>
            ${toolsHtml(f)}
          </div>`).join("")}
      </div>
    </div>` : ""}

    <div class="drawer-section">
      <h3>History</h3>
      <div class="kv-grid">
        <div class="kv"><span>First seen</span><strong>${esc(d.first_seen_iso || "—")}</strong></div>
        <div class="kv"><span>Last seen</span><strong>${esc(d.last_seen_iso || "—")}</strong></div>
        <div class="kv"><span>Times seen</span><strong>${d.seen_count || 1}</strong></div>
        <div class="kv"><span>Latency</span><strong>${d.latency_ms != null ? d.latency_ms + " ms" : "—"}</strong></div>
      </div>
    </div>`;

  const byId = (sel) => $(`#${sel}`, $("#drawer-body"));
  $$("[data-act]", $("#drawer-body")).forEach((btn) => btn.addEventListener("click",
    () => drawerAction(btn.dataset.act, d)));
}

async function drawerAction(action, d) {
  const id = encodeURIComponent(d.id);
  try {
    if (action === "rename") {
      const name = $("#rename-input", $("#drawer-body")).value.trim();
      await api(`/device/${id}`, { method: "POST", body: JSON.stringify({ custom_name: name }) });
      toast("Name saved", "ok", 1600);
      await refreshDevices();
      const fresh = await api(`/device/${id}`);
      renderDrawer(fresh.device);
    } else if (action === "rescan") {
      toast(`Scanning ${d.ip}…`, "info");
      const res = await api(`/device/${id}/ports`, {
        method: "POST", body: JSON.stringify({ profile: state.config.profile }),
      });
      toast(`${res.report.open_ports.length} open port(s) found`, "ok");
      await refreshDevices();
      const fresh = await api(`/device/${id}`);
      renderDrawer(fresh.device);
    } else if (action === "audit") {
      toast(`Auditing ${d.ip}…`, "info");
      const res = await api(`/device/${id}/audit`, { method: "POST" });
      state.audits[d.id] = res.report;
      toast(`Audit complete — score ${res.report.score}`, res.report.score >= 85 ? "ok" : "err");
      setDialFromAll();
      await refreshDevices();
      renderDrawer({ ...d, ...state.devices.find((x) => x.id === d.id) });
    } else if (action === "ping") {
      const res = await api(`/device/${id}/ping`, { method: "POST" });
      toast(res.ping.alive ? `${d.ip} alive · ${res.ping.latency_ms ?? "?"} ms · TTL ${res.ping.ttl ?? "?"}`
                            : `${d.ip} did not respond`, res.ping.alive ? "ok" : "err");
      await refreshDevices();
    } else if (action === "telnet") {
      const telnetPort = (d.ports || []).find(p => [23, 2323].includes(p.port));
      openTcpConsole(d.ip, telnetPort ? telnetPort.port : 23);
    } else if (action === "forget") {
      await api(`/device/${id}`, { method: "DELETE" });
      toast("Removed from inventory", "info");
      closeDrawer();
      await Promise.all([refreshDevices(), refreshStatus()]);
    }
  } catch (err) {
    if (err.status === 402) paywallToast(err.body);
    else toast(err.message, "err");
  }
}

/* ── Raw TCP / Telnet console (Ultimate) ─────────────────────────── */
let tcpSessionState = { session: null, host: "", port: 0 };

async function openTcpConsole(host, port = 23) {
  const backdrop = document.createElement("div");
  backdrop.className = "drawer-backdrop";
  backdrop.hidden = false;
  backdrop.innerHTML = "";
  const modal = document.createElement("div");
  modal.className = "aether-modal-backdrop";
  modal.innerHTML = `
    <div class="aether-modal" style="width:min(560px,94vw)">
      <h3>TCP console <span style="color:var(--text-3);font-weight:500">· Ultimate</span></h3>
      <div class="tcp-bar">
        <input id="tcp-host" value="${esc(host || "")}" placeholder="host" spellcheck="false"/>
        <input id="tcp-port" value="${port}" placeholder="23" style="max-width:80px"/>
        <button class="btn btn-primary btn-sm" id="tcp-connect">Connect</button>
      </div>
      <pre class="tcp-out" id="tcp-out">Not connected.</pre>
      <div class="tcp-bar">
        <input id="tcp-input" placeholder="type a command and press Enter" spellcheck="false"
               ${"disabled"}/>
        <button class="btn btn-ghost btn-sm" id="tcp-send" disabled>Send</button>
        <button class="btn btn-ghost btn-sm" id="tcp-close-conn" disabled>Disconnect</button>
      </div>
      <div class="status" id="tcp-status"></div>
      <div class="row" style="display:flex;justify-content:flex-end;margin-top:10px">
        <button class="btn btn-ghost btn-sm" id="tcp-dismiss">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const dismiss = () => {
    if (tcpSessionState.session) {
      api("/tools/tcp/close", { method: "POST",
        body: JSON.stringify({ session: tcpSessionState.session }) }).catch(() => {});
    }
    tcpSessionState = { session: null, host: "", port: 0 };
    modal.remove(); backdrop.remove();
  };
  modal.querySelector("#tcp-dismiss").addEventListener("click", dismiss);
  backdrop.addEventListener("click", dismiss);
  const out = modal.querySelector("#tcp-out");
  const status = modal.querySelector("#tcp-status");
  const input = modal.querySelector("#tcp-input");
  const sendBtn = modal.querySelector("#tcp-send");
  const discBtn = modal.querySelector("#tcp-close-conn");

  async function connect() {
    const h = modal.querySelector("#tcp-host").value.trim();
    const p = parseInt(modal.querySelector("#tcp-port").value, 10) || 23;
    status.textContent = `Connecting to ${h}:${p}…`; status.className = "status";
    try {
      const res = await api("/tools/tcp/open", { method: "POST",
        body: JSON.stringify({ host: h, port: p }) });
      tcpSessionState = { session: res.session, host: h, port: p };
      status.textContent = `Connected to ${h}:${p}`;
      status.className = "status ok";
      input.disabled = false; sendBtn.disabled = false; discBtn.disabled = false;
      out.textContent = "(session open — type a command)";
    } catch (err) {
      if (err.status === 402) { modal.remove(); backdrop.remove(); return paywallToast(err.body); }
      status.textContent = err.message; status.className = "status err";
    }
  }
  async function send() {
    const data = input.value;
    if (!tcpSessionState.session || !data.trim()) return;
    try {
      const res = await api("/tools/tcp/send", { method: "POST",
        body: JSON.stringify({ session: tcpSessionState.session, data }) });
      out.textContent = (res.output || "").slice(-8000) || "(no output)";
      out.scrollTop = out.scrollHeight;
      if (res.closed) {
        status.textContent = "Remote closed the connection."; status.className = "status err";
        tcpSessionState.session = null;
        input.disabled = true; sendBtn.disabled = true; discBtn.disabled = true;
      }
    } catch (err) {
      if (err.status === 402) { dismiss(); return paywallToast(err.body); }
      status.textContent = err.message; status.className = "status err";
    }
  }
  modal.querySelector("#tcp-connect").addEventListener("click", connect);
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  discBtn.addEventListener("click", async () => {
    if (tcpSessionState.session) {
      await api("/tools/tcp/close", { method: "POST",
        body: JSON.stringify({ session: tcpSessionState.session }) }).catch(() => {});
      tcpSessionState.session = null;
    }
    status.textContent = "Disconnected."; status.className = "status";
    input.disabled = true; sendBtn.disabled = true; discBtn.disabled = true;
    out.textContent = "Not connected.";
  });
  setTimeout(() => { if (host) connect(); }, 100);
}

function setDialFromAll() {
  const real = Object.values(state.audits).filter((a) => !a.preview);
  if (real.length) {
    const avg = Math.round(real.reduce((a, r) => a + r.score, 0) / real.length);
    $("#stat-score").textContent = `${avg} · ${gradeOf(avg)}`;
    setDial(avg);
  }
}

/* ------------------------------------------------------------------ */
/* 7. Security center                                                  */
/* ------------------------------------------------------------------ */

$("#btn-audit-all").addEventListener("click", async () => {
  const targets = state.devices.filter((d) => d.ip && !d.is_gateway);
  if (!targets.length) return toast("Scan first — nothing to audit", "err");
  toast(`Auditing ${targets.length} devices…`, "info", 4500);
  let done = 0;
  for (const d of targets) {
    try {
      const res = await api(`/device/${encodeURIComponent(d.id)}/audit`, { method: "POST" });
      state.audits[d.id] = res.report;
    } catch (err) {
      if (err.status === 402) return paywallToast(err.body);
    }
    done++;
    if (done % 4 === 0) toast(`Audited ${done}/${targets.length}…`, "info", 1500);
  }
  setDialFromAll();
  renderSecurity();
  toast(`Audit complete — ${done} devices scored`, "ok");
  const worst = Object.values(state.audits).filter((a) => !a.preview && a.score < 60).length;
  $("#badge-security").textContent = worst || "!";
  $("#badge-security").hidden = false;
});

$("#chk-cred-audit").addEventListener("change", async (e) => {
  state.config.credAudit = e.target.checked;
  await saveConfig();
  toast(e.target.checked
    ? "Factory-credential check ON (your devices only, read-only)"
    : "Factory-credential check off", "info");
});

function renderSecurity() {
  const reports = Object.values(state.audits).filter((a) => !a.preview);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  reports.forEach((r) => r.findings?.forEach((f) => { counts[f.severity] = (counts[f.severity] || 0) + 1; }));
  $("#sec-counts").innerHTML = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([sev, n]) => `<span class="sec-count ${sev}">${n} ${sev}</span>`).join("")
    || `<span class="sec-count low">no findings yet</span>`;

  const wrap = $("#sec-findings");
  const allFindings = [];
  reports.forEach((r) => {
    const device = state.devices.find((d) => d.id === r.device_id) ||
      { ip: r.ip, display_name: r.ip };
    r.findings?.forEach((f) => allFindings.push({ ...f, device }));
  });
  const order = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  allFindings.sort((a, b) => order[b.severity] - order[a.severity]);
  if (!allFindings.length) {
    wrap.innerHTML = `<p class="empty-hint">Run an audit to see findings, prioritized by severity.</p>`;
    return;
  }
  wrap.innerHTML = allFindings.slice(0, 24).map((f) => `
    <article class="finding-card sev-${esc(f.severity)}">
      <div class="finding-head">
        <h3>${esc(f.title)}</h3>
        <span class="sev-badge ${esc(f.severity)}">${esc(f.severity)}</span>
      </div>
      <p class="finding-desc">${esc(f.description)}</p>
      <p class="finding-fix"><b>Fix:</b> ${esc(f.remediation)}</p>
      ${toolsHtml(f)}
      <p class="finding-foot">${esc(f.device.ip)} · ${esc(f.device.display_name)}${f.cve_refs?.length ? " · " + esc(f.cve_refs.join(", ")) : ""}</p>
    </article>`).join("");
  bindToolHandlers(wrap);
}

function bindToolHandlers(scope) {
  $$(".tool-copy", scope).forEach((btn) => btn.addEventListener("click", () => {
    navigator.clipboard.writeText(btn.dataset.cmd).then(
      () => toast("Command copied", "ok", 1500),
      () => toast("Copy failed", "err"));
  }));
  $$(".tool-open-console", scope).forEach((btn) =>
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const ip = btn.closest(".finding-card, .audit-block")?.querySelector(".finding-foot")
        ?.textContent.split(" · ")[0] || "";
      openTcpConsole(ip, 23);
    }));
}

/* ── Network utilities panel ─────────────────────────────────────── */
async function runTool(kind) {
  const host = $("#tools-host")?.value.trim();
  const out = $("#tools-out");
  if (!host) return toast("Enter a host or IP first", "err");
  out.hidden = false;
  out.textContent = `Running ${kind} on ${host}…`;
  try {
    const res = await api("/tools/" + kind, { method: "POST",
      body: JSON.stringify({ host }) });
    out.textContent = res.output || "(no output)";
  } catch (err) {
    if (err.status === 402) { paywallToast(err.body); out.hidden = true; return; }
    out.textContent = `Error: ${err.message}`;
  }
}

$("#btn-tool-ping")?.addEventListener("click", () => runTool("ping"));
$("#btn-tool-trace")?.addEventListener("click", () => runTool("traceroute"));
$("#btn-tool-dns")?.addEventListener("click", () => runTool("dns"));
$("#btn-tool-arp")?.addEventListener("click", () => runTool("arp"));

/* ------------------------------------------------------------------ */
/* 8. Monitor                                                          */
/* ------------------------------------------------------------------ */

$("#btn-monitor-toggle").addEventListener("click", async () => {
  try {
    const { monitor } = await api("/monitor/status");
    if (monitor.running) {
      await api("/monitor/stop", { method: "POST" });
      toast("Monitoring stopped", "info");
    } else {
      await api("/monitor/start", {
        method: "POST",
        body: JSON.stringify({ interval_s: parseInt($("#monitor-interval").value, 10),
                               deep: $("#monitor-deep")?.checked || false }),
      });
      toast("Watchman on duty", "ok");
    }
    pollMonitor();
  } catch (err) {
    if (err.status === 402) paywallToast(err.body);
    else toast(err.message, "err");
  }
});

function pollMonitor() {
  clearInterval(state.monitorPoll);
  state.monitorPoll = setInterval(async () => {
    try {
      const { monitor } = await api("/monitor/status");
      renderMonitor(monitor);
      if (state.view !== "monitor") { /* keep polling quietly */ }
    } catch { /* ignore */ }
  }, 4000);
  api("/monitor/status").then(({ monitor }) => renderMonitor(monitor)).catch(() => {});
}

function renderMonitor(m) {
  const ring = $("#monitor-ring");
  const btn = $("#btn-monitor-toggle");
  ring.classList.toggle("live", !!m.running);
  $("#monitor-state").textContent = m.running
    ? `Watching ${m.cidr || "network"}` : "Monitoring off";
  $("#monitor-detail").textContent = m.running
    ? `Re-sweep every ${m.interval_s}s · ${m.tracked || 0} devices tracked · ${m.rounds || 0} rounds completed. Alerts land in the event stream below.`
    : "The watchman re-sweeps your network on an interval and alerts the moment a device joins, leaves or changes address.";
  btn.textContent = m.running ? "Stop monitoring" : "Start monitoring";
  $("#badge-monitor").hidden = !m.running;
  $("#monitor-rounds").textContent = m.running ? `${m.rounds || 0} rounds` : "";
  if (m.running && state.view === "monitor") loadMonitorFeed();
}

async function loadMonitorFeed() {
  try {
    const { events } = await api("/events?limit=60");
    const feed = $("#feed-monitor");
    const relevant = events.filter((e) => e.kind.startsWith("device.") || e.kind.startsWith("monitor."));
    if (!relevant.length) return;
    feed.innerHTML = relevant.map((e) => {
      const cls = e.kind.includes("joined") ? "joined"
        : e.kind.includes("left") ? "left"
        : e.kind.includes("error") ? "security" : "info";
      return `<li><time>${esc(e.iso)}</time><span class="feed-tag ${cls}">${esc(e.kind.split(".")[1])}</span>
        <span>${esc(e.message)}</span></li>`;
    }).join("");
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* 9. Reports                                                          */
/* ------------------------------------------------------------------ */

$$(".report-tile").forEach((tile) => tile.addEventListener("click", async () => {
  const fmt = tile.dataset.fmt;
  if (fmt === "pdf") {
    window.open(`/api/report?fmt=html&token=${encodeURIComponent(TOKEN)}`, "_blank");
    toast("Tip: use your browser's Print → Save as PDF", "info", 4200);
    return;
  }
  try {
    if (fmt === "html") {
      window.open(`/api/report?fmt=html&token=${encodeURIComponent(TOKEN)}`, "_blank");
      return;
    }
    await api(`/report?fmt=${fmt}&save=1`);
    toast(`${fmt.toUpperCase()} report saved to the reports/ folder`, "ok");
  } catch (err) {
    if (err.status === 402) paywallToast(err.body);
    else toast(err.message, "err");
  }
}));

async function renderHistory() {
  try {
    const { scan_history } = await api("/stats");
    const tbody = $("#history-table tbody");
    if (!scan_history?.length) return;
    tbody.innerHTML = scan_history.map((h) => `
      <tr>
        <td>${esc(h.started_iso)}</td>
        <td><code>${esc(h.subnet)}</code></td>
        <td>${h.found}</td>
        <td>${h.new_devices}</td>
        <td>${(h.duration_ms / 1000).toFixed(1)}s</td>
      </tr>`).join("");
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* 10. License                                                         */
/* ------------------------------------------------------------------ */

function renderLicense() {
  const s = state.status?.license;
  if (!s) return;
  // A completed sandbox checkout hands its key over via sessionStorage.
  const pendingKey = sessionStorage.getItem("aetherscan-pending-key");
  if (pendingKey && !$("#input-license").value) {
    $("#input-license").value = pendingKey;
    $("#license-note").textContent =
      "Your new key is ready — press Activate to finish.";
    $("#license-note").className = "form-note ok";
  }
  const tier = s.development ? "dev" : s.tier;
  $("#lic-title").textContent = s.development ? "Development build"
    : s.trial_active ? `${s.tier_label} (trial · ${s.trial_days_left}d left)`
    : `${s.tier_label} edition`;
  $("#lic-blurb").textContent = s.development
    ? "Every premium feature is unlocked for testing and evaluation. Ship with --dev removed."
    : s.tier === "free"
      ? "Upgrade to unlock the full auditing toolkit — port profiles, security audit, monitoring and reports."
      : "All premium features are active on this machine. Thank you for supporting AetherScan.";
  $("#lic-badge").textContent = s.development ? "DEV" : s.tier.toUpperCase();
  $("#lic-badge").className = `lic-badge ${tier}`;

  // Dev unlock is a developer affordance: only offer it when this install
  // is already running a development engine (or web demo with dev active).
  const devBtn = $("#btn-dev-unlock");
  if (devBtn) devBtn.parentElement.style.display = s.development ? "" : "none";

  $("#tier-grid").innerHTML = (s.tiers || []).map((t) => `
    <article class="tier-card ${t.id === tier ? "is-current" : ""}">
      ${t.id === tier ? `<span class="current-tag">Current</span>` : ""}
      <span class="tier-name">${esc(t.name)}</span>
      <span class="tier-price">${esc(t.price)}</span>
      <span class="tier-blurb">${esc(t.blurb)}</span>
      <ul>${t.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    </article>`).join("");
}

$("#form-activate").addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = $("#input-license").value.trim();
  const note = $("#license-note");
  try {
    const res = await api("/license/activate", {
      method: "POST",
      body: JSON.stringify({ key, licensed_to: $("#input-licensee").value.trim() }),
    });
    note.textContent = res.message;
    note.className = "form-note ok";
    toast(res.message, "ok");
    await refreshStatus();
    renderLicense();
  } catch (err) {
    note.textContent = err.message;
    note.className = "form-note err";
  }
});

// Live check while typing: catch copy mistakes before submit.
$("#input-license")?.addEventListener("blur", async () => {
  const key = $("#input-license").value.trim();
  const note = $("#license-note");
  if (!key) return;
  if (window.AetherLicense?.keyTierGroup && window.AetherLicense.keyValid) {
    if (!window.AetherLicense.keyTierGroup(key)) {
      note.textContent = "Format: AETH-XXXX-XXXX-PRO-XXXX (or -ULTI-XXXX).";
      note.className = "form-note err";
      return;
    }
    const ok = await window.AetherLicense.keyValid(key);
    note.textContent = ok ? "✓ This key is valid."
                          : "Check code doesn't match — the key was copied incorrectly.";
    note.className = ok ? "form-note ok" : "form-note err";
  }
});

$("#btn-dev-unlock").addEventListener("click", async () => {
  try {
    const res = await api("/license/activate", {
      method: "POST",
      body: JSON.stringify({ key: "AETHER-DEV-2026" }),
    });
    $("#license-note").textContent = res.message;
    $("#license-note").className = "form-note ok";
    toast(res.message, "ok");
    await refreshStatus();
    renderLicense();
  } catch (err) {
    $("#license-note").textContent = err.message;
    $("#license-note").className = "form-note err";
  }
});

/* ------------------------------------------------------------------ */
/* 11. Settings + diagnostics                                          */
/* ------------------------------------------------------------------ */

async function loadSettingsView() {
  $("#set-profile").value = state.config.profile;
  $("#set-ping-timeout").value = String(state.config.ping);
  $("#set-online-lookup").checked = state.config.online;
  $("#set-cred-audit").checked = state.config.credAudit;
  if ($("#set-sweep-tcp")) $("#set-sweep-tcp").checked = !!state.config.sweepTcp;
  const s = state.status;
  if (s) {
    $("#about-line").textContent =
      `AetherScan v${s.app.version} “${s.app.codename}” · build ${s.app.build} · ` +
      `${s.network?.platform || "?"} · ${s.network?.hostname || "?"}`;
  }
}

$("#set-profile").addEventListener("change", async (e) => {
  state.config.profile = e.target.value;
  await saveConfig();
});
$("#set-ping-timeout").addEventListener("change", async (e) => {
  state.config.ping = parseInt(e.target.value, 10);
  await saveConfig();
});
$("#set-online-lookup").addEventListener("change", async (e) => {
  state.config.online = e.target.checked;
  await saveConfig();
  toast("Takes effect on the next scan", "info");
});
$("#set-cred-audit").addEventListener("change", (e) => {
  state.config.credAudit = e.target.checked;
  $("#chk-cred-audit").checked = e.target.checked;
});
$("#set-sweep-tcp")?.addEventListener("change", async (e) => {
  state.config.sweepTcp = e.target.checked;
  await saveConfig();
});
$("#btn-clear-demo")?.addEventListener("click", () => purgeDemoDevices(false));

async function saveConfig() {
  // Client-side only for now: the server reads config.json at boot.
  localStorage.setItem("aetherscan-config", JSON.stringify(state.config));
}

/* Demo-visibility toggle lives in the devices toolbar. */
$("#chk-demo")?.addEventListener("change", (e) => {
  state.showDemo = e.target.checked;
  renderDevices();
});
$("#btn-overview")?.addEventListener("click", () => {
  state.overviewMode = !state.overviewMode;
  $("#btn-overview").classList.toggle("is-active", state.overviewMode);
  renderDevices();
});

$("#btn-selftest").addEventListener("click", async () => {
  const out = $("#debug-out");
  out.hidden = false;
  out.textContent = "Running self-test…";
  try {
    const res = await api("/debug/selftest", { method: "POST" });
    out.textContent = res.checks.map((c) =>
      `${c.passed ? "✓" : "✗"}  ${c.name}${c.detail ? " — " + c.detail : ""}`).join("\n") +
      `\n\n${res.score} checks passed`;
    toast(`Self-test: ${res.score}`, res.ok ? "ok" : "err");
  } catch (err) { out.textContent = `Self-test failed: ${err.message}`; }
});

$("#btn-env-dump").addEventListener("click", async () => {
  const out = $("#debug-out");
  out.hidden = false;
  out.textContent = "Collecting environment…";
  try {
    const res = await api("/debug/environment");
    out.textContent = JSON.stringify(res.environment, null, 2);
  } catch (err) { out.textContent = `Failed: ${err.message}`; }
});

/* ------------------------------------------------------------------ */
/* 12. Boot                                                            */
/* ------------------------------------------------------------------ */

(async function boot() {
  // restore client config
  try {
    Object.assign(state.config, JSON.parse(localStorage.getItem("aetherscan-config") || "{}"));
  } catch { /* ignore */ }

  // Signed-in users shouldn't see seeded demo clutter mixed into a real LAN.
  document.addEventListener("aetherscan:auth", async () => {
    state.showDemo = !isLiveMode();
    const toolbarToggle = $("#chk-demo");
    if (toolbarToggle) toolbarToggle.checked = state.showDemo;
    if (isLiveMode()) await purgeDemoDevices(true);
    renderDevices();
  });

  if (window.AetherAuth && window.AetherAuth.getSession()) {
    state.showDemo = !isLiveMode();
  }

  await refreshStatus();
  await refreshDevices();

  // hydrate any stored audits? (kept session-only by design)
  renderSecurity();

  const progress = state.status?.engine;
  if (progress?.running) {
    renderProgress(progress);
    watchProgress();
  } else if (progress && progress.phase !== "idle" && progress.phase !== "done") {
    renderProgress(progress);
  }

  pollMonitor();
  // Keep status fresh (license trial countdown, monitor heartbeat, etc.)
  setInterval(() => { refreshStatus(); }, 10000);
})();
