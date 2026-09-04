/* auth.js — cloud account gate for the AetherScan console.
   When a license server is configured, nothing loads until the user signs in:
     * "Continue with Google" (ID token verified server-side, account linked)
     * email + username + password, with a nice verification-code step
   The account carries a plan (free/pro/ultimate) and saves its settings and
   device inventory server-side. A local demo session remains ONLY as a
   fallback when no backend is configured (offline development). */

(function () {
  "use strict";

  const cfg = window.AETHERSCAN_CONFIG || {};
  const LS_DEMO = "aetherscan-demo-session";

  function signOut() {
    if (window.AetherCloud) window.AetherCloud.signOut();
    localStorage.removeItem(LS_DEMO);
    if (window.google?.accounts?.id) { try { google.accounts.id.disableAutoSelect(); } catch {} }
    location.reload();
  }

  /* ---------------- gate UI ------------------------------------------- */

  function ensureStyles() {
    if (document.getElementById("aether-auth-style")) return;
    const style = document.createElement("style");
    style.id = "aether-auth-style";
    style.textContent = `
    #aether-auth-gate{position:fixed;inset:0;z-index:300;display:grid;place-items:center;overflow:auto;
      background:radial-gradient(1100px 500px at 85% -10%, rgba(94,92,230,.16), transparent 60%),
                 radial-gradient(900px 460px at -10% 110%, rgba(10,132,255,.14), transparent 60%), #0b0d12;}
    .auth-card{width:min(430px,92vw);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
      border-radius:24px;padding:34px;color:#f2f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;
      animation:authIn .4s cubic-bezier(.22,.8,.3,1);margin:40px auto}
    @keyframes authIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
    .auth-mark{width:56px;height:56px;border-radius:18px;margin:0 auto 16px;display:grid;place-items:center;
      background:linear-gradient(135deg,#0a84ff,#5e5ce6);box-shadow:0 8px 24px rgba(10,132,255,.4)}
    .auth-card h1{font-size:21px;letter-spacing:-.4px;text-align:center;margin-bottom:6px}
    .auth-card .sub{font-size:13px;color:#a6adbb;margin-bottom:22px;text-align:center;line-height:1.5}
    .auth-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;
      padding:11px 16px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;
      border:1px solid transparent;transition:transform .15s,box-shadow .15s;margin-top:10px}
    .auth-btn:active{transform:scale(.97)}
    .auth-btn.google{background:#fff;color:#1f1f1f}
    .auth-btn.google:hover{box-shadow:0 6px 18px rgba(255,255,255,.18)}
    .auth-btn.primary{background:linear-gradient(135deg,#0a84ff,#5e5ce6);color:#fff}
    .auth-btn.ghost{background:rgba(255,255,255,.07);color:#f2f4f8;border-color:rgba(255,255,255,.14)}
    .auth-divider{display:flex;align-items:center;gap:10px;color:#6b7280;font-size:11px;margin:18px 0 4px;
      text-transform:uppercase;letter-spacing:1px}
    .auth-divider::before,.auth-divider::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.1)}
    .auth-tabs{display:flex;gap:6px;margin-bottom:12px;background:rgba(255,255,255,.05);border-radius:11px;padding:4px}
    .auth-tab{flex:1;padding:7px;text-align:center;border-radius:8px;font-size:13px;font-weight:600;
      color:#a6adbb;cursor:pointer;background:transparent;border:none}
    .auth-tab.on{background:rgba(255,255,255,.1);color:#fff}
    .auth-field{margin-bottom:10px}
    .auth-field label{display:block;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;
      color:#6b7280;margin-bottom:4px}
    .auth-input{width:100%;padding:10px 13px;border-radius:11px;background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.12);color:#f2f4f8;font-size:14px;outline:none;box-sizing:border-box}
    .auth-input:focus{border-color:#0a84ff}
    .auth-code{letter-spacing:10px;text-align:center;font-size:20px;font-family:ui-monospace,Menlo,Consolas,monospace}
    .auth-error{margin-top:12px;font-size:12.5px;color:#ff453a;min-height:16px}
    .auth-hint{margin-top:12px;font-size:11px;color:#6b7280;line-height:1.5;text-align:center}
    .auth-code-badge{margin:4px auto 14px;width:fit-content;background:rgba(10,132,255,.12);border:1px dashed rgba(10,132,255,.4);
      border-radius:12px;padding:10px 16px;color:#64d2ff;font-size:13px;text-align:center}
    .auth-userchip{display:flex;align-items:center;gap:8px;padding:4px 8px 4px 4px;border-radius:99px;
      background:var(--surface-strong);border:1px solid var(--border);cursor:pointer}
    .auth-userchip .av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#0a84ff,#5e5ce6);
      display:grid;place-items:center;color:#fff;font-size:12px;font-weight:700}
    .auth-userchip span{font-size:12px;color:var(--text-2);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .auth-userchip .plan{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;
      padding:2px 6px;border-radius:99px;background:var(--surface-strong);color:var(--text-3)}
    `;
    document.head.appendChild(style);
  }

  const MARK = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none">
      <circle cx="12" cy="12" r="2.4" fill="#fff"/><circle cx="12" cy="12" r="6.2" stroke="#fff" stroke-width="1.4" opacity=".55"/>
      <circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="1.2" opacity=".25"/></svg>`;
  const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.2 2.1 30 0 24 0 14.6 0 6.6 5.8 2.6 14.2l7.8 6.1C12.2 14 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.5-.1-3-.4-4.4H24v8.9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-9.9 6.9-17.5z"/><path fill="#FBBC05" d="M10.4 27.7c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.8-6.1C.9 15.9 0 19.8 0 24s.9 8.1 2.4 11.4l8-7.7z"/><path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.5 2.2-6.3 0-11.6-4.3-13.6-10l-8 7.7C6.6 42.2 14.6 48 24 48z"/></svg>`;

  function showGate(verificationEmail) {
    ensureStyles();
    if (document.getElementById("aether-auth-gate")) return;
    const gate = document.createElement("div");
    gate.id = "aether-auth-gate";
    gate.innerHTML = `
      <div class="auth-card">
        <div class="auth-mark">${MARK}</div>
        <h1>${verificationEmail ? "Check your email" : "Sign in to AetherScan"}</h1>
        <p class="sub">${verificationEmail
          ? `We sent a 6-digit code to <b style="color:#fff">${verificationEmail}</b>. Enter it below to finish setting up your account.`
          : "Your account syncs your settings, devices and plan across browsers. Create one to get started."}</p>
        <div id="auth-body"></div>
        <div class="auth-error" id="auth-error"></div>
        <p class="auth-hint" style="margin-top:20px">Sign-in is verified by the AetherScan license server. By continuing you agree to the
          <a href="terms.html" style="color:#64d2ff">Terms</a> and <a href="privacy.html" style="color:#64d2ff">Privacy Policy</a>.</p>
      </div>`;
    document.body.appendChild(gate);

    const body = gate.querySelector("#auth-body");
    const errEl = gate.querySelector("#auth-error");

    if (verificationEmail) {
      renderCodeStep(body, verificationEmail, errEl, gate);
      return;
    }

    const googleSlot = document.createElement("div");
    googleSlot.id = "auth-slot-google";
    body.appendChild(googleSlot);
    const divider = document.createElement("div");
    divider.className = "auth-divider"; divider.textContent = "or with email";
    body.appendChild(divider);

    const tabs = document.createElement("div");
    tabs.className = "auth-tabs";
    tabs.innerHTML = `<button class="auth-tab on" data-m="login">Sign in</button>
                      <button class="auth-tab" data-m="register">Create account</button>`;
    body.appendChild(tabs);

    const form = document.createElement("div");
    body.appendChild(form);

    function renderEmailForm(mode) {
      const isRegister = mode === "register";
      form.innerHTML = `
        ${isRegister ? `<div class="auth-field"><label>Username</label>
          <input class="auth-input" id="auth-username" placeholder="how you'll appear" autocomplete="off"/></div>` : ""}
        <div class="auth-field"><label>Email</label>
          <input class="auth-input" id="auth-email" type="email" placeholder="you@example.com" autocomplete="off"/></div>
        <div class="auth-field"><label>Password</label>
          <input class="auth-input" id="auth-password" type="password" placeholder="${isRegister ? "6+ characters" : "your password"}" autocomplete="off"/></div>
        <button class="auth-btn primary" id="auth-email-submit">${isRegister ? "Create account & send code" : "Sign in"}</button>
        ${isRegister ? `<p class="auth-hint">We'll email a verification code — check spam if it doesn't arrive.</p>` : ""}`;
      form.querySelector("#auth-email-submit").addEventListener("click", () => emailSubmit(isRegister));
      form.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") emailSubmit(isRegister); }));
    }

    async function emailSubmit(isRegister) {
      const email = form.querySelector("#auth-email").value.trim();
      const password = form.querySelector("#auth-password").value;
      errEl.textContent = "";
      let r;
      if (isRegister) {
        const username = form.querySelector("#auth-username").value.trim() || email.split("@")[0];
        r = await window.AetherCloud.register(email, username, password);
        if (r.ok && r.verificationRequired) {
          gate.remove();
          showGate(email);
          return;
        }
      } else {
        r = await window.AetherCloud.login(email, password);
      }
      if (r.ok) finish(r.user);
      else errEl.textContent = r.error || "Something went wrong.";
    }

    tabs.querySelectorAll(".auth-tab").forEach((t) => t.addEventListener("click", () => {
      tabs.querySelectorAll(".auth-tab").forEach((x) => x.classList.remove("on"));
      t.classList.add("on");
      renderEmailForm(t.dataset.m);
    }));
    renderEmailForm("login");

    const clientId = (cfg.clientId || "").trim();
    if (clientId) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => {
        try {
          google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential });
          google.accounts.id.renderButton(googleSlot, { theme: "filled_black", size: "large", shape: "pill", width: 360 });
        } catch (e) { errEl.textContent = "Google sign-in failed to initialize."; }
      };
      document.head.appendChild(script);
    } else {
      googleSlot.innerHTML = `<button class="auth-btn google" disabled style="opacity:.5">${GOOGLE_G} Google sign-in not configured</button>`;
    }
  }

  async function handleGoogleCredential(response) {
    const gate = document.getElementById("aether-auth-gate");
    const err = gate ? gate.querySelector("#auth-error") : null;
    try {
      const r = await window.AetherCloud.loginGoogle(response.credential);
      if (r.ok) finish(r.user);
      else if (err) err.textContent = r.error || "Google sign-in failed.";
    } catch (e) {
      if (err) err.textContent = e.message || "Google sign-in failed.";
    }
  }

  function renderCodeStep(body, email, errEl, gate) {
    body.innerHTML = `
      <div class="auth-code-badge">Code sent to ${email}</div>
      <div class="auth-field"><input class="auth-input auth-code" id="auth-code" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="off"/></div>
      <button class="auth-btn primary" id="auth-code-submit">Verify email</button>
      <p class="auth-hint">Didn't get it? <a id="auth-resend" style="color:#64d2ff;cursor:pointer">Resend code</a> ·
         <a id="auth-email-back" style="color:#64d2ff;cursor:pointer">Use a different email</a></p>`;

    async function submit() {
      const code = body.querySelector("#auth-code").value.trim();
      const r = await window.AetherCloud.verifyEmail(email, code);
      if (r.ok) {
        const me = await window.AetherCloud.me();
        finish(me.user);
      } else errEl.textContent = r.error || "That code didn't work.";
    }
    body.querySelector("#auth-code-submit").addEventListener("click", submit);
    body.querySelector("#auth-code").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    body.querySelector("#auth-email-back").addEventListener("click", () => { gate.remove(); showGate(); });
  }

  /* ---------------- finish ------------------------------------------- */

  function finish(user) {
    const gate = document.getElementById("aether-auth-gate");
    if (gate) gate.remove();
    const app = document.getElementById("app");
    if (app) app.style.removeProperty("filter");
    document.dispatchEvent(new CustomEvent("aetherscan:auth", { detail: { user } }));
    userChip(user);
    // load saved profile (settings/devices/plan) for the console
    if (window.AetherCloud) {
      window.AetherCloud.me().then((me) => {
        if (me.ok) document.dispatchEvent(new CustomEvent("aetherscan:profile", { detail: me.state }));
      }).catch(() => {});
    }
  }

  function userChip(user) {
    const host = document.querySelector(".topbar-right");
    if (!host || document.getElementById("aether-userchip")) return;
    const chip = document.createElement("div");
    chip.className = "auth-userchip";
    chip.id = "aether-userchip";
    const initial = (user.username || user.email || "?").trim()[0].toUpperCase();
    chip.innerHTML = `<span class="av">${initial}</span>
      <span>${user.username || user.email}</span>
      <span class="plan">${user.plan || "free"}</span>`;
    chip.title = `${user.email} — click to sign out`;
    chip.addEventListener("click", () => { if (confirm("Sign out of AetherScan?")) signOut(); });
    host.prepend(chip);
  }

  /* ---------------- boot ----------------------------------------------- */

  async function boot() {
    const cloud = window.AetherCloud;
    if (cloud && cloud.enabled()) {
      const session = cloud.user();
      if (session) {
        const me = await cloud.me().catch(() => null);
        if (me && me.ok) {
          finish(me.user);
          return;
        }
        cloud.signOut();
      }
      showGate();
      const app = document.getElementById("app");
      if (app) app.style.setProperty("filter", "blur(6px)");
    } else {
      // No backend configured → offline demo fallback (development only).
      const s = JSON.parse(localStorage.getItem(LS_DEMO) || "null");
      if (!s || s.exp < Date.now() / 1000) {
        const gate = document.createElement("div");
        gate.id = "aether-auth-gate";
        gate.style.cssText = "position:fixed;inset:0;z-index:300;display:grid;place-items:center;background:#0b0d12";
        gate.innerHTML = `<div class="auth-card"><div class="auth-mark">${MARK}</div><h1>AetherScan (demo)</h1>
          <p class="sub">No license backend is configured. Enter a name to use the offline demo.</p>
          <div class="auth-field"><input class="auth-input" id="demo-name" placeholder="Name"/></div>
          <button class="auth-btn primary" id="demo-go">Enter demo</button></div>`;
        document.body.appendChild(gate);
        gate.querySelector("#demo-go").addEventListener("click", () => {
          const n = gate.querySelector("#demo-name").value.trim() || "Demo";
          localStorage.setItem(LS_DEMO, JSON.stringify({ name: n, exp: Date.now() / 1000 + 7 * 86400 }));
          gate.remove();
          const app = document.getElementById("app"); if (app) app.style.removeProperty("filter");
          window.dispatchEvent(new CustomEvent("aetherscan:profile", { detail: null }));
        });
        const app = document.getElementById("app");
        if (app) app.style.setProperty("filter", "blur(6px)");
      }
    }
  }

  window.AetherAuth = { boot, signOut, userChip, finish };
  boot();
})();