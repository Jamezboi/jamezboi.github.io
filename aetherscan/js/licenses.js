/* licenses.js — client for the AetherScan cloud backend (Cloudflare Worker).
   When `config.licenseServer` is set, key operations go through the server so
   keys are one-time, cloud-listed, and account-linked. When it is empty, the
   console falls back to its local (offline) behavior so the demo still works. */

(function () {
  "use strict";

  const cfg = window.AETHERSCAN_CONFIG || {};
  const LS = "aetherscan-cloud-session";

  const server = () => (cfg.licenseServer || "").replace(/\/+$/, "");

  let session = null;
  try { session = JSON.parse(localStorage.getItem(LS) || "null"); } catch { session = null; }

  function saveSession(s) { session = s; if (s) localStorage.setItem(LS, JSON.stringify(s)); else localStorage.removeItem(LS); }

  async function call(path, { method = "POST", body, adminSecret, useSession = true } = {}) {
    const base = server();
    if (!base) return { ok: false, error: "no license server configured" };
    const headers = { "Content-Type": "application/json" };
    if (useSession && session && session.token) headers.Authorization = `Bearer ${session.token}`;
    if (adminSecret) headers["X-Aether-Admin"] = adminSecret;
    const resp = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await resp.json(); } catch { /* non-JSON */ }
    if (resp.status >= 400 && data.ok === undefined) data.ok = false;
    return data;
  }

  window.AetherCloud = {
    enabled: () => !!server(),
    user: () => session ? session.user : null,

    // auth
    async loginGoogle(idToken) {
      const r = await call("/auth/google", { body: { idToken }, useSession: false });
      if (r.ok) saveSession({ token: r.token, user: r.user });
      return r;
    },
    async register(email, username, password) {
      const r = await call("/auth/register", { body: { email, username, password }, useSession: false });
      if (r.ok) saveSession({ token: r.token, user: r.user });
      return r;
    },
    async login(email, password) {
      const r = await call("/auth/login", { body: { email, password }, useSession: false });
      if (r.ok) saveSession({ token: r.token, user: r.user });
      return r;
    },
    async verifyEmail(email, code) {
      return call("/auth/verify-email", { body: { email, code } });
    },
    async dev(code) {
      return call("/auth/dev", { body: { code } });
    },
    async me() {
      return call("/me", { method: "GET", useSession: true });
    },
    async saveState(patch) {
      return call("/me/save", { body: patch, useSession: true });
    },
    async consume(kind) {
      const r = await call("/me/consume", { body: { kind }, useSession: true });
      if (r.ok && session?.user) {
        if (kind === "audit") session.user.free_audit_credits = r.free_audit_credits;
        else session.user.free_scan_credits = r.free_scan_credits;
        saveSession(session);
      }
      return r;
    },
    signOut() { saveSession(null); },

    // keys
    async issueKeys(tier, count, adminSecret) {
      return call("/keys/issue", { body: { tier, count }, adminSecret });
    },
    async redeemKey(key, machineId) {
      return call("/keys/redeem", { body: { key, machine_id: machineId } });
    },
    async checkKey(key) {
      return call("/keys/check", { body: { key }, useSession: false });
    },
    async listKeys(adminSecret) {
      return call("/keys/list", { method: "GET", adminSecret });
    },
    async adminOverview() {
      return call("/admin/overview", { method: "GET", useSession: true });
    },
  };
})();