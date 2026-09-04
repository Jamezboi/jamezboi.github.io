/* license-web.js — AetherScan web license verification/generation. */
(function () {
  "use strict";
  const KEY_BYTES = new TextEncoder().encode("aetherscan-lumen-v1-offline-signing-key-2026");
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  async function hmacHex(body) {
    const key = await crypto.subtle.importKey("raw", KEY_BYTES, {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }
  async function checksumGroup(body) {
    const digest = await hmacHex(body), chars=[];
    for (let i=0;i<4;i++) chars.push(ALPHABET[(parseInt(digest[i],16)+i)%ALPHABET.length]);
    return chars.join("");
  }
  async function keyValid(key) {
    const parts=(key||"").trim().toUpperCase().split("-");
    if(parts.length!==5 || parts[0]!=="AETH" || !/^(PRO|ULTI)$/.test(parts[3])) return false;
    const expected=await checksumGroup(parts.slice(0,4).join("-"));
    if(expected.length!==parts[4].length) return false;
    let diff=0; for(let i=0;i<expected.length;i++) diff|=expected.charCodeAt(i)^parts[4].charCodeAt(i);
    return diff===0;
  }
  async function tierOf(key){ return ((key||"").trim().toUpperCase().split("-")[3]||"").startsWith("ULT")?"ultimate":"pro"; }
  function randomGroup(){let out="";const rnd=new Uint32Array(4);crypto.getRandomValues(rnd);for(let i=0;i<4;i++)out+=ALPHABET[rnd[i]%ALPHABET.length];return out;}
  async function generateKey(tier){const tg=String(tier||"pro").toUpperCase().startsWith("ULT")?"ULTI":"PRO";const body=["AETH",randomGroup(),randomGroup(),tg].join("-");return body+"-"+await checksumGroup(body);}
  // Development/unlock keys are intentionally no longer supported.
  function isDevKey(){ return false; }
  window.AetherLicense={keyValid,tierOf,checksumGroup,generateKey,isDevKey};
  document.addEventListener("DOMContentLoaded",()=>document.querySelectorAll(".dev-unlock").forEach(el=>el.remove()));
})();