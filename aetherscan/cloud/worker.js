// AetherScan license + account backend (Cloudflare Worker, D1 binding "DB").
//
// Responsibilities:
//   * Google sign-in (ID token verified against Google JWKS server-side)
//   * Email/password accounts with email verification codes
//   * Key issuance (admin only), one-time atomic redemption, cloud listing
//   * Session tokens (HMAC HS256 JWT) for authenticated key operations
//
// Key format (parity with the desktop engine + web console):
//   AETH-XXXX-XXXX-<PRO|ULTI>-<check4>
// The check group is the first 4 hex nibbles of an HMAC-SHA256 over the
// first 4 groups, using the same signing key the clients ship. One-time
// use is enforced by the DATABASE, not the checksum.

const SIGNING_KEY = "aetherscan-lumen-v1-offline-signing-key-2026";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

/* ------------------------------------------------------------------ */
/* tiny helpers                                                         */
/* ------------------------------------------------------------------ */

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

const b64url = (buf) => btoa(typeof buf === "string" ? buf
  : String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const b64urlDecode = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function checksumGroup(body, digestHex) {
  const chars = [];
  for (let i = 0; i < 4; i++) {
    const nibble = parseInt(digestHex[i], 16);
    chars.push(ALPHABET[(nibble + i) % ALPHABET.length]);
  }
  return chars.join("");
}

async function generateKey(tier) {
  const tierGroup = String(tier).toUpperCase().startsWith("ULT") ? "ULTI" : "PRO";
  const g1 = [...crypto.getRandomValues(new Uint8Array(4))].map(b => ALPHABET[b % ALPHABET.length]).join("");
  const g2 = [...crypto.getRandomValues(new Uint8Array(4))].map(b => ALPHABET[b % ALPHABET.length]).join("");
  const body = ["AETH", g1, g2, tierGroup].join("-");
  const digest = await hmacHex(SIGNING_KEY, body);
  return body + "-" + checksumGroup(body, digest);
}

/* ------------------------------------------------------------------ */
/* session JWT (HS256)                                                  */
/* ------------------------------------------------------------------ */

async function hmacSig(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return new Uint8Array(sig);
}

async function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(await hmacSig(secret, `${header}.${body}`));
  return `${header}.${body}.${sig}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = b64url(await hmacSig(secret, `${parts[0]}.${parts[1]}`));
  if (expected !== parts[2]) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* passwords (PBKDF2)                                                    */
/* ------------------------------------------------------------------ */

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password),
    "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$100000$${b64url(salt)}$${b64url(bits)}`;
}

async function verifyPassword(password, stored) {
  try {
    const parts = stored.split("$");
    const iterations = parseInt(parts[1], 10);
    const salt = b64urlDecode(parts[2]);
    const expected = parts[3];
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password),
      "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
    return b64url(bits) === expected;
  } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* Google ID-token verification                                         */
/* ------------------------------------------------------------------ */

async function verifyGoogleToken(idToken, env) {
  const [h, p] = idToken.split(".");
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  const resp = await fetch(GOOGLE_CERTS);
  if (!resp.ok) throw new Error("google certs unavailable");
  const jwk = (await resp.json()).keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown google key");
  const key = await crypto.subtle.importKey("jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key,
    b64urlDecode(idToken.split(".")[2]), new TextEncoder().encode(`${h}.${p}`));
  const now = Math.floor(Date.now() / 1000);
  if (!ok) throw new Error("bad signature");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) throw new Error("bad iss");
  if (payload.exp < now) throw new Error("expired");
  if (env.GOOGLE_CLIENT_ID && payload.aud !== env.GOOGLE_CLIENT_ID) throw new Error("bad aud");
  if (!payload.email) throw new Error("no email");
  return {
    email: payload.email,
    name: payload.name || payload.email.split("@")[0],
    sub: payload.sub,
    verified: payload.email_verified !== false,
  };
}

/* ------------------------------------------------------------------ */
/* auth: read identity from Authorization header, or admin secret       */
/* ------------------------------------------------------------------ */

async function currentUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const payload = await verifyJwt(auth.slice(7), env.APP_SECRET);
    return payload ? { id: payload.sub, email: payload.email } : null;
  }
  return null;
}

function isAdmin(request, env, user) {
  if (request.headers.get("X-Aether-Admin") === env.ADMIN_SECRET) return true;
  return !!(user && user.email && user.email.toLowerCase() === (env.ADMIN_EMAIL || "").toLowerCase());
}

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === "/health") return json({ ok: true, service: "aetherscan-license" });

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Aether-Admin",
    };
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const wrap = (r) => { for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); return r; };

    try {
      const user = await currentUser(request, env);

      // ---- auth --------------------------------------------------------
      if (path === "/auth/google" && method === "POST") {
        const { idToken } = await request.json();
        const g = await verifyGoogleToken(idToken, env);
        // upsert by google_sub (or email)
        let row = await env.DB.prepare("SELECT * FROM users WHERE google_sub = ?").bind(g.sub).first()
          || await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(g.email).first();
        if (!row) {
          const id = crypto.randomUUID();
          await env.DB.prepare(
            "INSERT INTO users (id, email, username, google_sub, verified) VALUES (?,?,?,?,?)")
            .bind(id, g.email, g.name, g.sub, g.verified ? 1 : 0).run();
          row = { id, email: g.email, username: g.name, verified: g.verified ? 1 : 0 };
        } else if (!row.google_sub) {
          await env.DB.prepare("UPDATE users SET google_sub = ?, verified = 1 WHERE id = ?")
            .bind(g.sub, row.id).run();
          row.google_sub = g.sub; row.verified = 1;
        }
        const token = await signJwt(
          { sub: row.id, email: row.email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL },
          env.APP_SECRET);
        return wrap(json({ ok: true, token, user: publicUser(row) }));
      }

      if (path === "/auth/register" && method === "POST") {
        const { email, username, password } = await request.json();
        if (!email || !password || password.length < 6)
          return wrap(json({ ok: false, error: "email and a 6+ char password are required" }, 400));
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
          return wrap(json({ ok: false, error: "invalid email" }, 400));
        const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (existing) return wrap(json({ ok: false, error: "email already registered" }, 409));
        const id = crypto.randomUUID();
        const hash = await hashPassword(password);
        await env.DB.prepare(
          "INSERT INTO users (id, email, username, password_hash, verified) VALUES (?,?,?,?,0)")
          .bind(id, email, username || email.split("@")[0], hash).run();
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await env.DB.prepare(
          "INSERT OR REPLACE INTO email_codes (email, code, expires_at) VALUES (?,?,?)")
          .bind(email, code, new Date(Date.now() + 15 * 60 * 1000).toISOString()).run();
        await sendVerification(env, email, code);
        const token = await signJwt({ sub: id, email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, env.APP_SECRET);
        return wrap(json({ ok: true, token, user: { id, email, username, verified: 0 }, verificationRequired: true }));
      }

      if (path === "/auth/login" && method === "POST") {
        const { email, password } = await request.json();
        const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        if (!row || !row.password_hash || !(await verifyPassword(password, row.password_hash)))
          return wrap(json({ ok: false, error: "wrong email or password" }, 401));
        const token = await signJwt({ sub: row.id, email: row.email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, env.APP_SECRET);
        return wrap(json({ ok: true, token, user: publicUser(row) }));
      }

      if (path === "/auth/verify-email" && method === "POST") {
        const { email, code } = await request.json();
        const c = await env.DB.prepare("SELECT * FROM email_codes WHERE email = ?").bind(email).first();
        if (!c || c.code !== String(code) || new Date(c.expires_at) < new Date())
          return wrap(json({ ok: false, error: "code invalid or expired" }, 400));
        await env.DB.prepare("UPDATE users SET verified = 1 WHERE email = ?").bind(email).run();
        await env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
        return wrap(json({ ok: true }));
      }

      // ---- keys --------------------------------------------------------
      if (path === "/keys/issue" && method === "POST") {
        if (!isAdmin(request, env, user))
          return wrap(json({ ok: false, error: "unauthorized" }, 403));
        const body = await request.json().catch(() => ({}));
        const tier = String(body.tier || "pro");
        const count = Math.min(100, Math.max(1, parseInt(body.count, 10) || 1));
        const keys = [];
        for (let i = 0; i < count; i++) {
          const key = await generateKey(tier);
          await env.DB.prepare(
            "INSERT INTO licenses (key, tier, status, issued_by) VALUES (?,?,?,?)")
            .bind(key, tier.toLowerCase() === "ultimate" ? "ultimate" : "pro", "available",
                  user ? user.email : "admin-secret").run();
          keys.push(key);
        }
        return wrap(json({ ok: true, keys }));
      }

      if (path === "/keys/redeem" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const key = String(body.key || "").trim().toUpperCase();
        const machineId = String(body.machine_id || "").slice(0, 64);
        if (!/^AETH-[A-Z0-9]{4}-[A-Z0-9]{4}-(PRO|ULTI)-[A-Z0-9]{4}$/.test(key))
          return wrap(json({ ok: false, error: "invalid key format" }, 400));
        const row = await env.DB.prepare("SELECT * FROM licenses WHERE key = ?").bind(key).first();
        if (!row) return wrap(json({ ok: false, error: "unknown key" }, 404));
        if (row.status === "revoked") return wrap(json({ ok: false, error: "key revoked" }, 403));
        if (row.status === "redeemed")
          return wrap(json({ ok: false, error: "key already redeemed" }, 409));
        const who = user ? user.id : (machineId ? `engine:${machineId}` : "anonymous");
        const result = await env.DB.prepare(
          "UPDATE licenses SET status = 'redeemed', redeemed_at = datetime('now'), redeemed_by = ? WHERE key = ? AND redeemed_at IS NULL")
          .bind(who, key).run();
        if (!result.meta.changes) return wrap(json({ ok: false, error: "key already redeemed" }, 409));
        return wrap(json({ ok: true, tier: row.tier, redeemedBy: who }));
      }

      if (path === "/keys/check" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const key = String(body.key || "").trim().toUpperCase();
        const row = await env.DB.prepare("SELECT * FROM licenses WHERE key = ?").bind(key).first();
        if (!row) return wrap(json({ ok: true, valid: false, reason: "unknown" }));
        return wrap(json({ ok: true, valid: row.status !== "revoked",
          tier: row.tier, status: row.status }));
      }

      if (path === "/keys/list" && method === "GET") {
        if (!user && !isAdmin(request, env, null))
          return wrap(json({ ok: false, error: "unauthorized" }, 403));
        let rows;
        if (isAdmin(request, env, user)) {
          rows = await env.DB.prepare("SELECT * FROM licenses ORDER BY issued_at DESC LIMIT 500").all();
        } else {
          rows = await env.DB.prepare("SELECT * FROM licenses WHERE redeemed_by = ? ORDER BY redeemed_at DESC LIMIT 500")
            .bind(user.id).all();
        }
        return wrap(json({ ok: true, keys: rows.results }));
      }

      return wrap(json({ ok: false, error: "not found" }, 404));
    } catch (err) {
      return wrap(json({ ok: false, error: err.message || "internal error" }, 500));
    }
  },
};

function publicUser(row) {
  return { id: row.id, email: row.email, username: row.username, verified: !!row.verified };
}

async function sendVerification(env, email, code) {
  if (!env.RESEND_API_KEY) return; // dev: code kept in DB, surfaced nowhere
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "AetherScan <onboarding@resend.dev>",
        to: [email],
        subject: "Your AetherScan verification code",
        text: `Your verification code is ${code}. It expires in 15 minutes.`,
      }),
    });
  } catch { /* non-fatal */ }
}