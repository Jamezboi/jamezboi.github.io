/* license-web.js — client-side AetherScan license key verification.
   Exact JavaScript port of licensing/license_manager.py so keys generated
   by the desktop engine activate identically on the web console.
   Keys: AETH-XXXX-XXXX-<PRO|ULTI>-<checksum4>, checksum = keyed HMAC-SHA256
   over "AETH-G1-G2-TIER" mapped into the base-32-style key alphabet. */

(function () {
  "use strict";

  const KEY_BYTES = new TextEncoder().encode(
    "aetherscan-lumen-v1-offline-signing-key-2026");
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const DEV_KEY = "AETHER-DEV-2026";

  async function hmacHex(body) {
    const key = await crypto.subtle.importKey(
      "raw", KEY_BYTES, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function checksumGroup(body) {
    const digest = await hmacHex(body);
    const chars = [];
    let i = 0;
    while (chars.length < 4) {
      const nibble = parseInt(digest[i % digest.length], 16);
      chars.push(ALPHABET[(nibble + i) % ALPHABET.length]);
      i += 1;
    }
    return chars.join("");
  }

  async function keyValid(key) {
    const parts = (key || "").trim().toUpperCase().split("-");
    if (parts.length !== 5 || parts[0] !== "AETH") return false;
    const group = parts[3];
    if (!/^(PRO|ULTI)$/.test(group)) return false;
    const body = parts.slice(0, 4).join("-");
    const expected = await checksumGroup(body);
    // constant-time-ish comparison
    if (expected.length !== parts[4].length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[4].charCodeAt(i);
    return diff === 0;
  }

  async function tierOf(key) {
    const group = (key || "").trim().toUpperCase().split("-")[3] || "";
    return group.startsWith("ULT") ? "ultimate" : "pro";
  }

  function isDevKey(key) {
    return (key || "").trim().toUpperCase() === DEV_KEY;
  }

  function randomGroup() {
    let out = "";
    const rnd = new Uint32Array(4);
    crypto.getRandomValues(rnd);
    for (let i = 0; i < 4; i++) out += ALPHABET[rnd[i] % ALPHABET.length];
    return out;
  }

  async function generateKey(tier) {
    const tierGroup = String(tier || "pro").toUpperCase().startsWith("ULT") ? "ULTI" : "PRO";
    const body = ["AETH", randomGroup(), randomGroup(), tierGroup].join("-");
    return body + "-" + (await checksumGroup(body));
  }

  window.AetherLicense = { keyValid, tierOf, isDevKey, checksumGroup,
                           generateKey, DEV_KEY };
})();
