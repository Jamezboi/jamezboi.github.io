/* demo-api.js — AetherScan web platform layer.
   ▸ DEMO mode: intercepts /api/* and answers from a realistic simulated LAN
     (the same 12-device demo dataset the desktop engine ships with), with a
     full scan-pipeline simulation, audits, monitoring and licensing.
   ▸ LIVE mode: when paired with a locally running AetherScan engine, /api/*
     requests are transparently proxied to http://127.0.0.1:<port> — the site
     becomes a remote console for the real scanner on your own machine.
   Loaded before app.js; app.js requires no changes. */

(function () {
  "use strict";

  const cfg = window.AETHERSCAN_CONFIG || {};
  const LS_PAIR = "aetherscan-pairing";
  const LS_LICENSE = "aetherscan-web-license";

  /* ------------------------------------------------------------------ */
  /* Pairing state                                                       */
  /* ------------------------------------------------------------------ */

  const pairing = {
    base: null,           // e.g. http://127.0.0.1:8765
    token: null,
    connected: false,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(LS_PAIR) || "null");
    if (saved && saved.base && saved.token) {
      pairing.base = saved.base;
      pairing.token = saved.token;
    }
  } catch { /* fresh */ }

  function savePairing() {
    if (pairing.base && pairing.token) {
      localStorage.setItem(LS_PAIR, JSON.stringify({ base: pairing.base, token: pairing.token }));
    } else {
      localStorage.removeItem(LS_PAIR);
    }
  }

  async function probeEngine(base, token) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const resp = await fetch(`${base}/api/status`, {
        headers: { "X-Aether-Token": token },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        const body = await resp.json();
        return body && body.ok ? { ok: true, version: body.app?.version } : { ok: false };
      }
      return { ok: false, status: resp.status };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, error: err.message };
    }
  }

  async function tryAutoConnect() {
    if (!pairing.base || !pairing.token) return false;
    const probe = await probeEngine(pairing.base, pairing.token);
    pairing.connected = !!probe.ok;
    renderPill();
    return pairing.connected;
  }

  /* ------------------------------------------------------------------ */
  /* Demo dataset — mirrors core/engine.seed_demo_devices()              */
  /* ------------------------------------------------------------------ */

  const REG = {
    80:  ["http", "HTTP", 0, "Web interface"],
    443: ["https", "HTTPS", 0, "Secure web interface"],
    22:  ["ssh", "SSH", 0, "Secure shell remote administration"],
    53:  ["domain", "DNS", 0, "DNS resolver"],
    88:  ["kerberos", "Kerberos", 0, "Authentication service"],
    135: ["msrpc", "MSRPC", 2, "Windows RPC endpoint mapper"],
    139: ["netbios-ssn", "NetBIOS", 3, "Legacy Windows file sharing"],
    445: ["microsoft-ds", "SMB", 3, "Windows file/printer sharing"],
    500: ["isakmp", "VPN", 1, "IPsec VPN key exchange"],
    631: ["ipp", "IPP", 1, "Internet printing"],
    1883:["mqtt", "MQTT", 2, "IoT message bus"],
    1900:["upnp", "UPnP", 2, "SSDP / UPnP discovery"],
    5000:["upnp-alt", "HTTP", 1, "Router admin / Synology DSM"],
    5001:["synology", "HTTPS", 1, "Synology DSM"],
    7547:["tr069", "TR-069", 4, "ISP router management"],
    8123:["hass", "Home Assistant", 1, "Home Assistant API"],
    8883:["mqtt-tls", "MQTT", 0, "MQTT over TLS"],
    902: ["vmware-auth", "VMware", 1, "VMware authentication daemon"],
    9100:["jetdirect", "Printing", 1, "Raw printer port"],
    3000:["node-dev", "HTTP", 1, "Dev web app"],
    9955:["unknown", "Unknown", 1, "Unregistered service"],
  };

  function port(p) {
    const meta = REG[p] || ["unknown", "TCP", 1, "Unregistered service"];
    return { port: p, open: true, service: meta[0], protocol: meta[1],
             risk: meta[2], desc: meta[3], banner: "", tls: null };
  }

  const now = Date.now() / 1000;
  const day = 86400;

  const demoDevices = [
    { id: "3c:37:86:9a:11:04", ip: "192.168.1.1", mac: "3c:37:86:9a:11:04", custom_name: "Gateway",
      hostname: "rt-ax86u", vendor: "ASUSTek Computer", vendor_badge: "asus", device_type: "router",
      model: "RT-AX86U", os_guess: "Linux / macOS / iOS / Android (TTL 64)", ttl: 64, latency_ms: 1.2,
      is_gateway: true, ports: [80, 443, 7547].map(port), favorite: true,
      era: { oui_registered: 2020, era_label: "2020 or later (current generation)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "ASUSTek Computer", hq: "Taipei, Taiwan", founded: 1989,
        note: "Consumer and enthusiast routers; ZenWiFi/ROG lines." },
      tags: ["demo"], notes: "", mdns_name: "", netbios_name: "", upnp: "ASUS Router",
      locally_administered: false, seen_count: 14,
      first_seen: now - 30 * day, last_seen: now - 60 },
    { id: "ac:de:48:00:11:22", ip: "192.168.1.20", mac: "ac:de:48:00:11:22", custom_name: "James's MacBook Pro",
      hostname: "macbooks-pro.local", vendor: "Apple, Inc.", vendor_badge: "apple", device_type: "computer",
      model: "MacBookPro18,3", os_guess: "Linux / macOS / iOS / Android (TTL 64)", ttl: 64, latency_ms: 2.1,
      is_gateway: false, ports: [88, 445, 5000].map(port), favorite: true,
      era: { oui_registered: 2008, era_label: "~2008–2015 (early smart era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "Apple, Inc.", hq: "Cupertino, CA, USA", founded: 1976,
        note: "Devices randomize Wi-Fi MACs by default; the address seen here may be per-network." },
      tags: [], notes: "", mdns_name: "James's MacBook Pro", netbios_name: "", upnp: "",
      locally_administered: false, seen_count: 9,
      first_seen: now - 21 * day, last_seen: now - 45 },
    { id: "f0:18:98:33:44:55", ip: "192.168.1.23", mac: "f0:18:98:33:44:55", custom_name: "James's iPhone",
      hostname: "James-iPhone", vendor: "Apple, Inc.", vendor_badge: "apple", device_type: "phone",
      model: "iPhone15,3", os_guess: "Linux / macOS / iOS / Android (TTL 64)", ttl: 64, latency_ms: 3.4,
      is_gateway: false, ports: [], favorite: false,
      era: { oui_registered: 2010, era_label: "~2010–2015 (early smart era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "Apple, Inc.", hq: "Cupertino, CA, USA", founded: 1976,
        note: "Devices randomize Wi-Fi MACs by default." },
      tags: [], notes: "", mdns_name: "James-iPhone", netbios_name: "", upnp: "",
      locally_administered: false, seen_count: 22,
      first_seen: now - 40 * day, last_seen: now - 20 },
    { id: "b8:27:eb:aa:bb:cc", ip: "192.168.1.31", mac: "b8:27:eb:aa:bb:cc", custom_name: "home-lab-pi",
      hostname: "home-lab-pi", vendor: "Raspberry Pi Trading", vendor_badge: "raspberry", device_type: "computer",
      model: "Raspberry Pi 4B", os_guess: "Linux / macOS / iOS / Android (TTL 64)", ttl: 64, latency_ms: 1.8,
      is_gateway: false, ports: [22, 80, 8123].map(port), favorite: false,
      era: { oui_registered: 2012, era_label: "~2012–2015 (early smart era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "Raspberry Pi Trading", hq: "Cambridge, UK", founded: 2012,
        note: "Single-board computers; extremely common in home labs." },
      tags: ["homelab"], notes: "Runs Home Assistant + Pi-hole.", mdns_name: "home-lab-pi",
      netbios_name: "", upnp: "", locally_administered: false, seen_count: 31,
      first_seen: now - 60 * day, last_seen: now - 120 },
    { id: "5c:cf:7f:dd:ee:ff", ip: "192.168.1.42", mac: "5c:cf:7f:dd:ee:ff", custom_name: "Smart Plug (ESP8266)",
      hostname: "", vendor: "Espressif (ESP IoT)", vendor_badge: "espressif", device_type: "iot",
      model: "ESP8266EX", os_guess: "Embedded/IoT firmware (low TTL)", ttl: 46, latency_ms: 4.2,
      is_gateway: false, ports: [80, 1883].map(port), favorite: false,
      era: { oui_registered: 2014, era_label: "~2014–2020 (modern era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "Espressif (ESP IoT)", hq: "Shanghai, China", founded: 2008,
        note: "ESP8266/ESP32 Wi-Fi silicon inside most budget IoT devices." },
      tags: [], notes: "", mdns_name: "", netbios_name: "", upnp: "",
      locally_administered: false, seen_count: 3,
      first_seen: now - 6 * day, last_seen: now - 90 },
    { id: "00:17:88:12:34:56", ip: "192.168.1.55", mac: "00:17:88:12:34:56", custom_name: "Hue Bridge",
      hostname: "", vendor: "Philips Lighting (Hue)", vendor_badge: "philips", device_type: "iot",
      model: "BSB002", os_guess: "Linux / macOS / iOS / Android (TTL 64)", ttl: 64, latency_ms: 2.9,
      is_gateway: false, ports: [80, 443].map(port), favorite: false,
      era: { oui_registered: 2008, era_label: "~2008–2015 (early smart era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "Philips Lighting (Hue)", hq: "Eindhoven, Netherlands", founded: 1891,
        note: "Hue smart lighting." },
      tags: [], notes: "", mdns_name: "", netbios_name: "", upnp: "Philips hue",
      locally_administered: false, seen_count: 12,
      first_seen: now - 25 * day, last_seen: now - 200 },
    { id: "44:65:0d:77:88:99", ip: "192.168.1.60", mac: "44:65:0d:77:88:99", custom_name: "Echo Show 8",
      hostname: "", vendor: "Amazon Technologies", vendor_badge: "amazon", device_type: "iot",
      model: "Echo Show 8", os_guess: "Linux / macOS / iOS / Android (TTL 64)", ttl: 64, latency_ms: 5.1,
      is_gateway: false, ports: [80].map(port), favorite: false,
      era: { oui_registered: 2014, era_label: "~2014–2020 (modern era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "Amazon Technologies", hq: "Seattle, WA, USA", founded: 1994,
        note: "Echo, Ring and Kindle devices." },
      tags: [], notes: "", mdns_name: "", netbios_name: "", upnp: "",
      locally_administered: false, seen_count: 8,
      first_seen: now - 15 * day, last_seen: now - 75 },
    { id: "00:24:83:aa:bb:cc", ip: "192.168.1.77", mac: "00:24:83:aa:bb:cc", custom_name: "LG OLED C1",
      hostname: "", vendor: "LG Electronics", vendor_badge: "lg", device_type: "tv",
      model: "OLED55C1", os_guess: "Linux / macOS / iOS / Android (TTL 64)", ttl: 64, latency_ms: 3.8,
      is_gateway: false, ports: [3000, 9955].map(port), favorite: false,
      era: { oui_registered: 2009, era_label: "~2009–2015 (early smart era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "LG Electronics", hq: "Seoul, South Korea", founded: 1958,
        note: "webOS smart TVs and appliances." },
      tags: [], notes: "", mdns_name: "", netbios_name: "", upnp: "LG Smart TV",
      locally_administered: false, seen_count: 5,
      first_seen: now - 10 * day, last_seen: now - 300 },
    { id: "00:11:32:12:12:12", ip: "192.168.1.90", mac: "00:11:32:12:12:12", custom_name: "Vault-NAS",
      hostname: "vault-nas", vendor: "Synology", vendor_badge: "synology", device_type: "nas",
      model: "DS920+", os_guess: "Linux / macOS / iOS / Android (TTL 64)", ttl: 64, latency_ms: 1.5,
      is_gateway: false, ports: [5000, 5001, 445].map(port), favorite: false,
      era: { oui_registered: 2007, era_label: "~2007–2015 (early smart era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "Synology", hq: "Taipei, Taiwan", founded: 2000,
        note: "Popular NAS appliances." },
      tags: ["storage"], notes: "", mdns_name: "", netbios_name: "VAULT-NAS", upnp: "Synology DS920+",
      locally_administered: false, seen_count: 17,
      first_seen: now - 50 * day, last_seen: now - 30 },
    { id: "38:01:97:9a:8a:7a", ip: "192.168.1.110", mac: "38:01:97:9a:8a:7a", custom_name: "Galaxy S24",
      hostname: "", vendor: "Samsung Electronics", vendor_badge: "samsung", device_type: "phone",
      model: "SM-S921B", os_guess: "Linux / macOS / iOS / Android (TTL 64)", ttl: 64, latency_ms: 4.7,
      is_gateway: false, ports: [], favorite: false,
      era: { oui_registered: 2015, era_label: "2015 or later (current generation)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "Samsung Electronics", hq: "Suwon, South Korea", founded: 1938,
        note: "Largest consumer electronics maker by volume." },
      tags: [], notes: "", mdns_name: "", netbios_name: "", upnp: "",
      locally_administered: true, seen_count: 6,
      first_seen: now - 8 * day, last_seen: now - 150 },
    { id: "00:1b:a9:11:22:33", ip: "192.168.1.120", mac: "00:1b:a9:11:22:33", custom_name: "Brother MFC",
      hostname: "BRN3C2AF30D5A0", vendor: "Brother Industries", vendor_badge: "brother", device_type: "printer",
      model: "MFC-L2740DW", os_guess: "Embedded/IoT firmware (low TTL)", ttl: 51, latency_ms: 6.3,
      is_gateway: false, ports: [80, 631, 9100].map(port), favorite: false,
      era: { oui_registered: 2011, era_label: "~2011–2015 (early smart era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "Brother Industries", hq: "Nagoya, Japan", founded: 1908,
        note: "Printers and multifunction devices." },
      tags: [], notes: "", mdns_name: "", netbios_name: "BROTHER", upnp: "Brother Printer",
      locally_administered: false, seen_count: 11,
      first_seen: now - 45 * day, last_seen: now - 400 },
    { id: "00:0c:29:ab:cd:ef", ip: "192.168.1.140", mac: "00:0c:29:ab:cd:ef", custom_name: "dev-vm-01",
      hostname: "dev-vm-01", vendor: "VMware, Inc.", vendor_badge: "vmware", device_type: "vm",
      model: "ESXi 8.0", os_guess: "Microsoft Windows (TTL 128)", ttl: 128, latency_ms: 0.9,
      is_gateway: false, ports: [443, 902].map(port), favorite: false,
      era: { oui_registered: 2002, era_label: "~2002–2012 (early smart era)",
             basis: "IEEE OUI assignment date (lower bound on manufacture)" },
      vendor_profile: { name: "VMware, Inc.", hq: "Palo Alto, CA, USA", founded: 1998,
        note: "Virtualization platforms." },
      tags: ["dev"], notes: "", mdns_name: "", netbios_name: "DEV-VM-01", upnp: "",
      locally_administered: false, seen_count: 4,
      first_seen: now - 3 * day, last_seen: now - 15 },
  ];

  for (const d of demoDevices) {
    d.vendor_profile = d.vendor_profile || null;
    d.era = d.era || null;
    d.os_guess = d.os_guess || "";
    d.tags = [...new Set([...(d.tags || []), "demo"])];
  }

  function deviceView(d) {
    return { ...d,
      display_name: d.custom_name || d.hostname || d.vendor || "Device",
      open_port_count: d.ports.filter(p => p.open).length,
      first_seen_iso: new Date(d.first_seen * 1000).toLocaleString("sv-SE").replace("T", " "),
      last_seen_iso: new Date(d.last_seen * 1000).toLocaleString("sv-SE").replace("T", " "),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Demo audit engine (mirrors core/vulnscan.py outcomes)               */
  /* ------------------------------------------------------------------ */

  const tcpSessions = {};

  function webMachineId() {
    let id = localStorage.getItem("aetherscan-machine-id");
    if (!id) {
      id = "web-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("aetherscan-machine-id", id);
    }
    return id;
  }

  function fakeBannerFor(device, port) {
    if (port === 23 || port === 2323) return `\r\nWelcome to ${device.custom_name}\r\nLogin: `;
    if (port === 80) return "HTTP/1.0 200 OK (demo)";
    return `${device.custom_name} ${port}/tcp demo service ready`;
  }

  const demoFindings = {
    "3c:37:86:9a:11:04": [
      { check_id: "port:7547", title: "TR-069 CWMP management port open", severity: "critical",
        description: "Port 7547 is open (tr069): the port Mirai used to compromise 900k routers.",
        remediation: "Disable CWMP or firewall it from the LAN edge.", evidence: "TCP 7547/open (tr069)", cve_refs: [],
        tools: [
          { label: "Info probe", tool: "curl", command: "curl -m 5 http://192.168.1.1:7547/ -o - | head -20" },
          { label: "Service sweep", tool: "nmap", command: "nmap -sV -p 7547 192.168.1.1" },
        ] },
      { check_id: "upnp:wan", title: "Router exposes UPnP WAN connection service", severity: "medium",
        description: "UPnP lets any LAN device open inbound firewall ports automatically.",
        remediation: "Disable UPnP unless a console needs it.", evidence: "SSDP rootdevice", cve_refs: [] },
    ],
    "ac:de:48:00:11:22": [
      { check_id: "port:445", title: "SMB file sharing reachable", severity: "medium",
        description: "Port 445 is open (microsoft-ds): the EternalBlue (CVE-2017-0144) attack surface.",
        remediation: "Restrict SMB to trusted devices.", evidence: "TCP 445/open", cve_refs: ["CVE-2017-0144"],
        tools: [
          { label: "Share enumeration", tool: "nmap", command: "nmap --script smb-enum-shares -p 445 192.168.1.20" },
          { label: "Safe vuln scan", tool: "nmap", command: "nmap --script smb-vuln-ms17-010 -p 445 192.168.1.20" },
        ] },
      { check_id: "http:headers", title: "Web UI missing security headers", severity: "low",
        description: "Baseline hardening headers absent: x-frame-options, x-content-type-options.",
        remediation: "Enable hardened headers if supported.", evidence: "HTTP 5000", cve_refs: [] },
    ],
    "5c:cf:7f:dd:ee:ff": [
      { check_id: "banner:Boa discontinued", title: "Boa web server (end-of-life)", severity: "high",
        description: "Boa web server (2005-era) — discontinued, unpatched memory-safety issues; common on old routers/cameras.",
        remediation: "Replace the device or isolate it on a guest VLAN.",
        evidence: "GET / HTTP/1.0 → Server: Boa/0.94.14rc21", cve_refs: ["CVE-2017-9833"] },
      { check_id: "bus:mqtt", title: "MQTT broker listening without TLS companion",
        severity: "medium",
        description: "Port 1883 (plaintext MQTT) is open with no 8883 (MQTT-over-TLS). Many brokers ship with anonymous access.",
        remediation: "Enable broker authentication + TLS, or bind to localhost.", evidence: "TCP 1883/open", cve_refs: [],
        tools: [
          { label: "Topic probe (read-only)", tool: "mosquitto_sub", command: "mosquitto_sub -h 192.168.1.42 -t '#' -C 5 -v -W 5" },
        ] },
    ],
    "00:11:32:12:12:12": [
      { check_id: "port:445", title: "SMB file sharing reachable", severity: "medium",
        description: "Port 445 is open (microsoft-ds): the EternalBlue attack surface.",
        remediation: "Restrict SMB to trusted devices.", evidence: "TCP 445/open", cve_refs: ["CVE-2017-0144"] },
    ],
    "00:1b:a9:11:22:33": [
      { check_id: "port:9100", title: "Raw printer port", severity: "info",
        description: "Port 9100 is open (jetdirect): anyone on the LAN can print; usually acceptable at home.",
        remediation: "Restrict if unwanted.", evidence: "TCP 9100/open", cve_refs: [] },
      { check_id: "http:headers", title: "Web UI missing security headers", severity: "low",
        description: "Baseline hardening headers absent: x-frame-options, x-content-type-options.",
        remediation: "Enable hardened headers if the firmware allows.", evidence: "HTTP 80", cve_refs: [] },
    ],
    "44:65:0d:77:88:99": [
      { check_id: "http:headers", title: "Web UI missing security headers", severity: "low",
        description: "Baseline hardening headers absent: x-frame-options, content-security-policy.",
        remediation: "Accept the risk on a trusted LAN appliance.", evidence: "HTTP 80", cve_refs: [] },
    ],
  };

  const demoPassed = [
    "No high-risk service ports exposed", "No end-of-life software banners detected",
    "TLS configuration looks modern",
  ];

  function scoreFor(findings) {
    const weight = { info: 1, low: 4, medium: 9, high: 16, critical: 27 };
    let penalty = findings.reduce((a, f) => a + (weight[f.severity] || 0), 0);
    penalty = Math.max(0, penalty - Math.min(penalty, 3));
    return Math.max(0, 100 - penalty);
  }

  const grade = (s) => s >= 90 ? "A" : s >= 75 ? "B" : s >= 60 ? "C" : s >= 40 ? "D" : "F";

  function auditFor(id) {
    const findings = demoFindings[id] || [];
    const score = scoreFor(findings);
    return {
      ip: demoDevices.find(d => d.id === id)?.ip || "",
      started_at: Date.now() / 1000, duration_ms: 400 + Math.floor(Math.random() * 900),
      score, grade: grade(score),
      findings, passed: findings.length ? demoPassed.slice(0, 1) : demoPassed,
    };
  }

  const auditStore = {};   // id -> latest report (session)

  /* ------------------------------------------------------------------ */
  /* Licensing (web)                                                     */
  /* ------------------------------------------------------------------ */

  const TIERS = [
    { id: "free", price: "$0", name: "AetherScan Free",
      blurb: "Discovery, device inventory, vendor intelligence.",
      features: ["Subnet discovery & ping sweep", "MAC vendor + era estimates",
                 "Device inventory & custom names", "Quick port profile", "8 scans/day"] },
    { id: "pro", price: "$24 one-time", name: "AetherScan Pro",
      blurb: "The full auditing toolkit for power users.",
      features: ["Standard port profiles + banners", "Fingerprinting (DNS/mDNS/NetBIOS)",
                 "Security audit & scoring", "Continuous monitoring", "Report exports", "Unlimited scans",
                 "Network tools: ping, traceroute, DNS, ARP"] },
    { id: "ultimate", price: "$59 one-time", name: "AetherScan Ultimate",
      blurb: "Deep enrichment for professionals and labs.",
      features: ["Deep (1–1024 + curated) port profiles", "UPnP model/serial enrichment",
                 "Telnet & raw TCP console", "Deep continuous monitoring", "TCP sweep for silent devices",
                 "Webhook alerts", "Priority support"] },
  ];

  const FEATURE_MIN = {
    discovery: "free", device_list: "free", vendor_lookup: "free", port_scan_quick: "free",
    port_scan_standard: "pro", port_scan_deep: "ultimate", fingerprinting: "pro",
    mdns_upnp_enrichment: "ultimate", security_audit: "pro", credential_audit: "pro",
    monitoring: "pro", reports: "pro", history: "pro",
    tools_basic: "pro", tools_tcp: "ultimate", deep_monitor: "ultimate",
    deep_sweep: "ultimate",
    webhook_alerts: "ultimate", unlimited_scans: "pro", priority_support: "ultimate",
  };
  const RANK = { free: 0, pro: 1, ultimate: 2 };

  const licenseState = {
    key: null, licensed_to: "", development: false, scans: {},  // day -> count
  };

  try {
    const saved = JSON.parse(localStorage.getItem(LS_LICENSE) || "null");
    if (saved) Object.assign(licenseState, saved);
  } catch { /* fresh */ }

  function persistLicense() {
    localStorage.setItem(LS_LICENSE, JSON.stringify(licenseState));
  }

  // Free accounts get exactly ONE premium scan and ONE audit (cloud-enforced).
  function freeCredits() {
    const u = window.AetherCloud && window.AetherCloud.user();
    return u ? { scan: u.free_scan_credits ?? 0, audit: u.free_audit_credits ?? 0 } : { scan: 0, audit: 0 };
  }

  async function currentTier() {
    // Authoritative when signed in: the account's cloud plan.
    if (window.AetherCloud && window.AetherCloud.user()) {
      return window.AetherCloud.user().plan || "free";
    }
    if (licenseState.development) return "ultimate";
    if (licenseState.key && await window.AetherLicense.keyValid(licenseState.key)) {
      return await window.AetherLicense.tierOf(licenseState.key);
    }
    return "free";
  }

  function todayKey() { return new Date().toISOString().slice(0, 10); }

  async function licenseStatus() {
    const tier = await currentTier();
    const features = {};
    for (const [f, min] of Object.entries(FEATURE_MIN)) {
      features[f] = RANK[tier] >= RANK[min];
    }
    const credits = freeCredits();
    return {
      tier, tier_label: tier.charAt(0).toUpperCase() + tier.slice(1),
      development: licenseState.development,
      licensed_to: licenseState.licensed_to,
      free_scan_credits: credits.scan, free_audit_credits: credits.audit,
      features, tiers: TIERS,
      scans_today: licenseState.scans[todayKey()] || 0,
      scan_cap: tier === "free" ? null : null,
    };
  }

  // Consume a free-account allowance (one scan / one audit), cloud-authoritative.
  async function consumeFree(kind) {
    if (!(window.AetherCloud && window.AetherCloud.enabled() && window.AetherCloud.user())) return true;
    const u = window.AetherCloud.user();
    if (kind === "audit" && (u.free_audit_credits ?? 0) > 0) return window.AetherCloud.consume("audit");
    if (kind === "scan" && (u.free_scan_credits ?? 0) > 0) return window.AetherCloud.consume("scan");
    return { ok: false, error: "free allowance used" };
  }

  function gateFor(feature, tier) {
    const min = FEATURE_MIN[feature] || "ultimate";
    if (RANK[tier] >= RANK[min]) return null;
    return { locked: true, feature, required_tier: min, current_tier: tier,
             message: `'${feature}' requires AetherScan ${min.charAt(0).toUpperCase() + min.slice(1)}.`,
             development_hint: "Run the desktop engine with --dev to unlock everything." };
  }

  /* ------------------------------------------------------------------ */
  /* Simulated scan pipeline                                             */
  /* ------------------------------------------------------------------ */

  const scanSim = { running: false, progress: { running: false, phase: "idle", percent: 0,
    detail: "", found: 0, log: [], started_at: null, finished_at: null, error: null, run_id: 0 } };
  let scanTimer = null;
  let monitor = { running: false, status: "stopped", cidr: "192.168.1.0/24", interval_s: 60, rounds: 0, tracked: 0 };
  let monitorTimer = null;
  const events = [];
  const scanHistory = [
    { started_at: now - day, finished_at: now - day + 75, subnet: "192.168.1.0/24",
      found: 12, new_devices: 2, duration_ms: 74200,
      started_iso: new Date((now - day) * 1000).toLocaleString("sv-SE").replace("T", " ") },
    { started_at: now - 2 * day, finished_at: now - 2 * day + 68, subnet: "192.168.1.0/24",
      found: 10, new_devices: 10, duration_ms: 68100,
      started_iso: new Date((now - 2 * day) * 1000).toLocaleString("sv-SE").replace("T", " ") },
  ];

  function logEvent(kind, message, ip = "", mac = "") {
    const d = new Date();
    events.unshift({ ts: Date.now() / 1000, kind, ip, mac, message, meta: null,
      iso: d.toTimeString().slice(0, 8) });
    if (events.length > 200) events.pop();
  }
  logEvent("demo.seeded", "Seeded 12 demo devices (web demo mode)");

  function simulateScan(profile) {
    scanSim.running = true;
    const runId = ++scanSim.progress.run_id;
    const t0 = Date.now() / 1000;
    const p = scanSim.progress;
    Object.assign(p, { running: true, phase: "interfaces", percent: 2,
      detail: "Targeting 192.168.1.0/24", found: 0, log: [], started_at: t0,
      finished_at: null, error: null });
    const addLog = (message) => p.log.push({ t: Date.now() / 1000,
      iso: new Date().toTimeString().slice(0, 8), message });

    const phases = [
      ["interfaces", 4, "Targeting 192.168.1.0/24", 300],
      ["sweep", 38, "Pinging 192.168.1.0/24 (254/254)", 2600],
      ["enrich", 48, "Identifying vendors (12/12)", 1600],
      ["identify", 61, "Resolving names (12/12)", 2100],
      ["ports", 82, "Port scan 192.168.1.140 (12/12)", 2800],
      ["audit", 96, "Auditing 192.168.1.90 (8/8)", 2200],
      ["persist", 99, "Saving inventory…", 500],
    ];
    let idx = 0;
    addLog(`Target subnet 192.168.1.0/24 · gateway 192.168.1.1`);
    const step = () => {
      if (idx >= phases.length) {
        const ms = Math.round((Date.now() / 1000 - t0) * 1000);
        Object.assign(p, { running: false, phase: "done", percent: 100,
          detail: `12 devices · ${ms} ms`, found: 12, finished_at: Date.now() / 1000 });
        addLog(`Scan complete — 12 devices, 0 new, ${ms} ms`);
        scanHistory.unshift({ started_at: t0, finished_at: Date.now() / 1000,
          subnet: "192.168.1.0/24", found: 12, new_devices: 0, duration_ms: ms,
          started_iso: new Date(t0 * 1000).toLocaleString("sv-SE").replace("T", " ") });
        logEvent("scan.completed", `Scan complete — 12 devices (${profile} profile)`);
        scanSim.running = false;
        return;
      }
      const [phase, percent, detail, ms] = phases[idx++];
      Object.assign(p, { phase, percent, detail });
      addLog(phase === "sweep" ? `Sweep complete: 12 responded in ${ms} ms`
        : phase === "audit" ? "Security audit finished — 8 devices scored"
        : phase === "identify" ? "Identification pass complete (DNS / NetBIOS / mDNS / UPnP)"
        : phase === "enrich" ? "Enriched 12 devices with vendor data"
        : phase === "ports" ? "Port scan (demo profile) hit 9 devices with open ports"
        : `Phase ${phase} complete`);
      scanTimer = setTimeout(step, ms);
    };
    scanTimer = setTimeout(step, 300);
    return runId;
  }

  /* ------------------------------------------------------------------ */
  /* Mock API handlers                                                   */
  /* ------------------------------------------------------------------ */

  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" } });

  const stats = () => {
    const byType = {};
    for (const d of demoDevices) byType[d.device_type] = (byType[d.device_type] || 0) + 1;
    return { devices: demoDevices.length, scan_runs: scanHistory.length, by_type: byType };
  };

  function networkInfo() {
    return {
      hostname: "demo-laptop", platform: "Web Demo",
      interfaces: [{ name: "Wi-Fi (demo)", ip: "192.168.1.64", netmask: "255.255.255.0",
        cidr: "192.168.1.0/24", broadcast: "192.168.1.255", is_wireless: true,
        is_virtual: false, host_count: 254 }],
      primary: { name: "Wi-Fi (demo)", ip: "192.168.1.64", netmask: "255.255.255.0",
        cidr: "192.168.1.0/24", broadcast: "192.168.1.255", is_wireless: true,
        is_virtual: false, host_count: 254 },
      gateway: "192.168.1.1",
    };
  }

  async function demoApi(method, path, body) {
    const license = await licenseStatus();

    // ---- status & meta ----
    if (path === "/status") return json({
      ok: true, app: { name: "AetherScan", version: "1.4.0", codename: "Lumen", build: 1400 },
      license, engine: { ...scanSim.progress }, monitor,
      network: networkInfo(), stats: stats(), server_time: Date.now() / 1000,
      web_demo: true });

    if (path === "/interfaces") return json({ ok: true,
      interfaces: networkInfo().interfaces, gateway: "192.168.1.1" });

    if (path === "/debug/environment") return json({ ok: true,
      environment: { platform: "Web demo (browser sandbox)", python: "—",
        os_user: "demo", hostname: "demo-laptop", is_windows: false, is_macos: false,
        interfaces: networkInfo().interfaces, arp_entries: 12 } });

    if (path === "/debug/selftest") return json({ ok: true,
      checks: [
        { name: "browser-webcrypto", passed: true, detail: "HMAC-SHA256 available" },
        { name: "demo-dataset", passed: true, detail: "12 devices" },
        { name: "license-verifier", passed: true, detail: "offline key math loaded" },
        { name: "renderer", passed: true, detail: "console assets loaded" },
        { name: "engine-pairing", passed: pairing.connected, detail:
          pairing.connected ? `live engine at ${pairing.base}` : "demo mode — run the desktop engine to pair" },
      ],
      score: `${pairing.connected ? 5 : 4}/5` });

    if (path === "/demo/seed") return json({ ok: true, seeded: demoDevices.length });

    if (path === "/demo/clear" && method === "POST") {
      const removed = demoDevices.filter(d => (d.tags || []).includes("demo")).length;
      demoDevices.length = 0;
      logEvent("demo.cleared", `Removed ${removed} demo device(s)`);
      return json({ ok: true, removed, has_demo: demoDevices.length > 0 });
    }
    if (path === "/demo/status") return json({ ok: true, has_demo: demoDevices.length > 0 });

    // ---- network tools ----
    if (path === "/tools/ping" && method === "POST") {
      const gate = gateFor("tools_basic", license.tier);
      if (gate) return json(gate, 402);
      const host = String(body.host || "").slice(0, 128);
      const okHost = demoDevices.some(d => d.ip === host) || /^[\w.-]+$/.test(host);
      if (!okHost) return json({ ok: false, error: "invalid host" }, 400);
      const device = demoDevices.find(d => d.ip === host);
      await new Promise(r => setTimeout(r, 600));
      return json({ ok: true, tool: "ping", exit_code: device ? 0 : 1, output:
`Pinging ${host} with 32 bytes of data:
Reply from ${host}: bytes=32 time=${device ? device.latency_ms ?? 2 : 2}ms TTL=${device?.ttl ?? 64}
Reply from ${host}: bytes=32 time=${(device ? device.latency_ms ?? 2 : 2) + 0.4}ms TTL=${device?.ttl ?? 64}
Reply from ${host}: bytes=32 time=${device ? device.latency_ms ?? 2 : 2}ms TTL=${device?.ttl ?? 64}
Reply from ${host}: bytes=32 time=${(device ? device.latency_ms ?? 2 : 2) + 0.2}ms TTL=${device?.ttl ?? 64}` });
    }
    if (path === "/tools/traceroute" && method === "POST") {
      const gate = gateFor("tools_basic", license.tier);
      if (gate) return json(gate, 402);
      const host = String(body.host || "").slice(0, 128);
      await new Promise(r => setTimeout(r, 900));
      return json({ ok: true, tool: "traceroute", exit_code: 0, output:
`Tracing route to ${host} over a maximum of 30 hops
  1     1 ms    1 ms    1 ms  192.168.1.1
  2     2 ms    2 ms    2 ms  ${host}` });
    }
    if (path === "/tools/dns" && method === "POST") {
      const gate = gateFor("tools_basic", license.tier);
      if (gate) return json(gate, 402);
      const host = String(body.host || "").slice(0, 128);
      const match = demoDevices.find(d => d.hostname === host);
      await new Promise(r => setTimeout(r, 400));
      return json({ ok: true, tool: "dns", exit_code: 0,
        output: match ? `Server:  router.local\nAddress:  192.168.1.1\n\nName:    ${host}\nAddress:  ${match.ip}`
                      : `Server:  router.local\nAddress:  192.168.1.1\n\nName:    ${host}\nAddress:  (no record)` });
    }
    if (path === "/tools/nmap" && method === "POST") {
      const gate = gateFor("tools_tcp", license.tier);
      if (gate) return json(gate, 402);
      const host = String(body.host || "").slice(0, 128);
      await new Promise(r => setTimeout(r, 1200));
      const dev = demoDevices.find(x => x.ip === host);
      const ports = dev ? dev.ports.map(p => p.port).join(",") : "80,443";
      return json({ ok: true, tool: "nmap", exit_code: 0, output:
`Starting Nmap (AetherScan bundled) at ${new Date().toISOString()}
Nmap scan report for ${host}
PORT      STATE  SERVICE   VERSION
${(dev ? dev.ports : []).slice(0, 6).map((p,i) => `${String(p.port).padEnd(9)} open   ${p.service.padEnd(9)} ${p.desc}` ).join("\n") || "  (no open ports in demo)"}
Service detection performed.` });
    }
    if (path === "/tools/arp" && method === "POST") {
      const gate = gateFor("tools_basic", license.tier);
      if (gate) return json(gate, 402);
      await new Promise(r => setTimeout(r, 300));
      const lines = demoDevices.map(d => `  ${d.ip}          ${d.mac}     dynamic`).join("\n");
      return json({ ok: true, tool: "arp", exit_code: 0,
        output: `Interface: 192.168.1.64 --- 0x4\n  Internet Address      Physical Address      Type\n${lines}` });
    }
    if (path === "/tools/tcp/open" && method === "POST") {
      const gate = gateFor("tools_tcp", license.tier);
      if (gate) return json(gate, 402);
      const host = String(body.host || ""), port = parseInt(body.port, 10) || 23;
      const device = demoDevices.find(d => d.ip === host);
      if (!device || !device.ports.some(p => p.port === port)) {
        return json({ ok: false, error: `connect failed: no service simulated on ${host}:${port}` }, 400);
      }
      const session = "demo-" + Math.random().toString(36).slice(2, 10);
      tcpSessions[session] = { host, port, banner: fakeBannerFor(device, port) };
      return json({ ok: true, session, host, port });
    }
    if (path === "/tools/tcp/send" && method === "POST") {
      const gate = gateFor("tools_tcp", license.tier);
      if (gate) return json(gate, 402);
      const session = tcpSessions[String(body.session || "")];
      if (!session) return json({ ok: false, error: "no such session" }, 404);
      const cmd = String(body.data || "").trim().toLowerCase();
      let extra = "";
      if (cmd === "help") extra = "\nsupported (demo): help, status, version, quit";
      else if (cmd === "status") extra = `\n${session.host}:${session.port} demo service ready`;
      else if (cmd === "version") extra = "\nAetherSim service v1.0";
      else if (cmd && cmd !== "quit") extra = "\ncommand not recognized (demo)";
      return json({ ok: true, closed: cmd === "quit",
        output: session.banner + extra + (cmd === "quit" ? "\nconnection closed" : "") });
    }
    if (path === "/tools/tcp/close" && method === "POST") {
      delete tcpSessions[String(body.session || "")];
      return json({ ok: true });
    }

    // ---- devices ----
    if (path === "/devices") {
      return json({ ok: true, count: demoDevices.length,
        devices: demoDevices.map(deviceView) });
    }
    const devMatch = path.match(/^\/device\/([^/]+)(\/(ports|audit|ping))?$/);
    if (devMatch) {
      const id = decodeURIComponent(devMatch[1]);
      const device = demoDevices.find(d => d.id === id);
      if (!device) return json({ error: "not_found" }, 404);
      if (!devMatch[2]) {
        if (method === "DELETE") {
          demoDevices.splice(demoDevices.indexOf(device), 1);
          logEvent("device.removed", `Removed ${device.custom_name} from inventory`, device.ip, device.mac);
          return json({ ok: true });
        }
        if (method === "POST") {
          if (typeof body.custom_name === "string") device.custom_name = body.custom_name.slice(0, 64);
          if (typeof body.notes === "string") device.notes = body.notes.slice(0, 2000);
          if (typeof body.favorite === "boolean") device.favorite = body.favorite;
          if (Array.isArray(body.tags)) device.tags = body.tags.slice(0, 10).map(t => String(t).slice(0, 32));
          logEvent("device.updated", `Updated ${device.custom_name}`, device.ip, device.mac);
          return json({ ok: true, device: deviceView(device) });
        }
        return json({ ok: true, device: deviceView(device) });
      }
      if (devMatch[3] === "ping") return json({ ok: true,
        ping: { ip: device.ip, alive: true, ttl: device.ttl, latency_ms: device.latency_ms } });
      if (devMatch[3] === "ports") {
        const gate = gateFor(`port_scan_${body.profile || "standard"}`, license.tier);
        if (gate) return json(gate, 402);
        await new Promise(r => setTimeout(r, 900));
        const report = { ip: device.ip, profile: body.profile || "standard",
          scanned: 100, duration_ms: 940, open_ports: device.ports };
        logEvent("device.scanned", `Port scan ${device.ip}: ${device.ports.length} open`, device.ip, device.mac);
        return json({ ok: true, report });
      }
      if (devMatch[3] === "audit") {
        const gate = gateFor("security_audit", license.tier);
        if (gate) {
          if (license.tier === "free") {
            const use = await consumeFree("audit");
            if (!use.ok) return json({ ...gate, message: "Your free audit is used — upgrade to run more audits." }, 402);
          } else {
            return json(gate, 402);
          }
        }
        await new Promise(r => setTimeout(r, 1100));
        const report = auditFor(device.id);
        auditStore[device.id] = report;
        logEvent("device.audited", `Audited ${device.custom_name}: score ${report.score}`, device.ip, device.mac);
        return json({ ok: true, report });
      }
    }

    // ---- scanning ----
    if (path === "/scan" && method === "POST") {
      const profile = body.profile || "standard";
      if (body.sweep_tcp) {
        const gate = gateFor("deep_sweep", license.tier);
        if (gate) return json(gate, 402);
      }
      const gate = gateFor(profile === "quick" ? "port_scan_quick" :
        profile === "deep" ? "port_scan_deep" : "port_scan_standard", license.tier);
      if (gate) {
        // Free accounts may use their single free premium scan instead.
        if (license.tier === "free" && profile === "standard") {
          const use = await consumeFree("scan");
          if (!use.ok) return json({ ...gate, message: "Your free scan is used — upgrade to run more scans." }, 402);
        } else {
          return json(gate, 402);
        }
      }
      if (scanSim.running) return json({ ok: false, message: "A scan is already running." }, 409);
      licenseState.scans[todayKey()] = (licenseState.scans[todayKey()] || 0) + 1;
      persistLicense();
      const run_id = simulateScan(profile);
      return json({ ok: true, run_id, subnet: "192.168.1.0/24" });
    }
    if (path === "/scan/cancel") {
      clearTimeout(scanTimer); scanSim.running = false;
      Object.assign(scanSim.progress, { running: false, phase: "canceled", percent: 100,
        detail: "Scan canceled", finished_at: Date.now() / 1000 });
      return json({ ok: true, canceled: true });
    }
    if (path === "/scan/progress") return json({ ok: true, progress: { ...scanSim.progress } });
    if (path === "/scan/last") return json({ ok: true, report: {
      subnet: "192.168.1.0/24", devices: demoDevices.map(deviceView),
      audits: Object.values(auditStore),
      summary: summarizeAudits(), gateway: "192.168.1.1", duration_ms: 74000 } });

    // ---- events & stats ----
    if (path === "/events") {
      const limit = 120;
      return json({ ok: true, events: events.slice(0, limit) });
    }
    if (path === "/stats") return json({ ok: true, stats: stats(), scan_history: scanHistory });

    // ---- monitor ----
    if (path === "/monitor/start" && method === "POST") {
      const gate = gateFor("monitoring", license.tier);
      if (gate) return json(gate, 402);
      monitor.running = true; monitor.status = "running"; monitor.rounds = 1;
      monitor.interval_s = (body && body.interval_s) || 60; monitor.tracked = demoDevices.length;
      monitor.deep = !!body.deep;
      clearInterval(monitorTimer);
      monitorTimer = setInterval(() => {
        monitor.rounds += 1;
        if (monitor.rounds % 3 === 0) {
          logEvent("device.joined", "New device on the network: 192.168.1.217", "192.168.1.217", "");
        } else {
          logEvent("monitor.round", `Watchman round ${monitor.rounds} complete — no changes`);
        }
      }, monitor.interval_s * 1000);
      logEvent("monitor.started", `Monitoring 192.168.1.0/24 every ${monitor.interval_s}s`);
      return json({ ok: true, monitor });
    }
    if (path === "/monitor/stop") {
      clearInterval(monitorTimer);
      monitor.running = false; monitor.status = "stopped";
      logEvent("monitor.stopped", "Monitoring stopped");
      return json({ ok: true, monitor });
    }
    if (path === "/monitor/status") return json({ ok: true, monitor });

    // ---- licensing ----
    if (path === "/license/status") return json({ ok: true, license });
    if (path === "/license/activate" && method === "POST") {
      const key = String(body.key || "").trim();
      if (await window.AetherLicense.isDevKey(key)) {
        licenseState.development = true; persistLicense();
        return json({ ok: true, tier: "ultimate", development: true,
          message: "Development unlock active — all premium features enabled." });
      }
      if (!(await window.AetherLicense.keyValid(key))) {
        const group = window.AetherLicense.keyTierGroup(key);
        const message = group
          ? "Key format is fine, but the check code is wrong — it was copied incorrectly. Re-check the last 4 characters (or generate the key again)."
          : "That key doesn't look right. Expected format: AETH-XXXX-XXXX-PRO-XXXX (or AETH-XXXX-XXXX-ULTI-XXXX for Ultimate).";
        return json({ ok: false, message }, 400);
      }
      const tier = await window.AetherLicense.tierOf(key);
      // One-time enforcement via the cloud backend (empty config = offline).
      if (window.AetherCloud && window.AetherCloud.enabled()) {
        const redeem = await window.AetherCloud.redeemKey(key, webMachineId());
        if (!redeem.ok) {
          const msg = redeem.error === "key already redeemed"
            ? "This key has already been redeemed on another device."
            : redeem.error === "unknown key" ? "This key is not recognized by the license server."
            : redeem.error || "The license server rejected this key.";
          return json({ ok: false, message: msg }, 400);
        }
      }
      licenseState.key = key.toUpperCase();
      licenseState.licensed_to = String(body.licensed_to || "Licensee");
      licenseState.development = false;
      persistLicense();
      logEvent("license.activated", `AetherScan ${tier} activated (web)`);
      return json({ ok: true, tier, development: false,
        message: `AetherScan ${tier.charAt(0).toUpperCase() + tier.slice(1)} activated. Thank you!` });
    }
    if (path === "/license/deactivate") {
      licenseState.key = null; licenseState.development = false; persistLicense();
      return json({ ok: true, license: await licenseStatus() });
    }

    // ---- reports ----
    if (path.startsWith("/report")) {
      const gate = gateFor("reports", license.tier);
      if (gate) return json(gate, 402);
      const query = new URLSearchParams(path.split("?")[1] || "");
      const fmt = query.get("fmt") || "html";
      const save = query.get("save") === "1";
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/, "-");
      if (fmt === "json") {
        const payload = JSON.stringify({ generated: Date.now() / 1000, demo: true,
          devices: demoDevices.map(deviceView), audits: Object.values(auditStore) }, null, 2);
        if (save) { downloadBlob(payload, `aetherscan-report-${stamp}.json`, "application/json");
          return json({ ok: true, saved: "(downloaded by your browser)" }); }
        return new Response(payload, { status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" } });
      }
      const text = fmt === "csv" ? csvReport() : markdownReport();
      const mime = fmt === "csv" ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8";
      if (save) { downloadBlob(text, `aetherscan-report-${stamp}.${fmt}`, mime);
        return json({ ok: true, saved: "(downloaded by your browser)" }); }
      return new Response(text, { status: 200, headers: { "Content-Type": mime } });
    }

    return json({ error: "unknown_route", path }, 404);
  }

  function summarizeAudits() {
    const reports = Object.values(auditStore);
    if (!reports.length) return { devices_audited: 0, average_score: 100, grade: "A", counts: {}, worst_devices: [] };
    const counts = {};
    let total = 0;
    for (const r of reports) { total += r.score; for (const f of r.findings) counts[f.severity] = (counts[f.severity] || 0) + 1; }
    return { devices_audited: reports.length, average_score: Math.round(total / reports.length),
      grade: grade(Math.round(total / reports.length)), counts, worst_devices: [] };
  }

  function markdownReport() {
    const lines = ["# AetherScan Network Report (web demo)", "",
      `*Generated ${new Date().toLocaleString()} · demo dataset*`, "",
      "| Device | IP | MAC | Type |", "|---|---|---|---|"];
    for (const d of demoDevices) {
      lines.push(`| ${d.custom_name} | ${d.ip} | \`${d.mac}\` | ${d.device_type} |`);
    }
    return lines.join("\n") + "\n";
  }

  function csvReport() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Name", "IP", "MAC", "Vendor", "Type", "OS guess", "Open ports"]];
    for (const d of demoDevices) {
      rows.push([d.custom_name, d.ip, d.mac, d.vendor || "", d.device_type,
        d.os_guess || "", d.ports.map(p => p.port).join(" ")]);
    }
    return rows.map(r => r.map(esc).join(",")).join("\r\n") + "\r\n";
  }

  function downloadBlob(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ------------------------------------------------------------------ */
  /* Pairing credentials handed over via URL fragment (#pair=...)        */
  /* ------------------------------------------------------------------ */

  function handlePairFragment() {
    const m = location.hash.match(/^#pair=([A-Za-z0-9_-]+)$/);
    if (!m) return false;
    try {
      const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = "=".repeat((4 - (b64.length % 4)) % 4);
      const data = JSON.parse(atob(b64 + pad));
      if (data.base && data.token) {
        pairing.base = data.base;
        pairing.token = data.token;
        savePairing();
        history.replaceState(null, "", location.pathname + location.search);
        probeEngine(data.base, data.token).then((probe) => {
          pairing.connected = !!probe.ok;
          renderPill();
          if (probe.ok) {
            toast(`Paired with AetherScan v${probe.version || ""} on this computer`, "ok", 5000);
            window.dispatchEvent(new CustomEvent("aetherscan:modechange"));
          } else {
            toast("Engine launcher finished, but the engine is not reachable yet — it may still be starting.", "err", 6000);
          }
        });
        return true;
      }
    } catch { /* malformed fragment — ignore */ }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Tailored Windows launcher generation                                */
  /* ------------------------------------------------------------------ */

  function siteBase() {
    return location.origin + location.pathname.replace(/console\.html.*$/, "");
  }

  async function fetchLatestVersion() {
    try {
      const resp = await origFetch(siteBase() + "engine/update.json", { cache: "no-store" });
      if (resp.ok) {
        const manifest = await resp.json();
        if (manifest.latest) return String(manifest.latest);
      }
    } catch { /* fall through */ }
    return "1.4.3";
  }

  function buildLauncherBat(version, consoleUrl, bundleUrl, siteOrigin) {
    return [
      "@echo off",
      "setlocal EnableExtensions",
      "title AetherScan Engine Setup",
      'set "DIR=%LOCALAPPDATA%\\AetherScan"',
      `set "BUNDLE_URL=${bundleUrl}"`,
      `set "LATEST=${version}"`,
      `set "CONSOLE_URL=${consoleUrl}"`,
      `set "ORIGIN=${siteOrigin}"`,
      "set \"PYTHONIOENCODING=utf-8\"",
      "echo ==================================================",
      `echo   AetherScan ${version} - one-time setup`,
      "echo   Downloads ~13 MB. No Python installation needed.",
      "echo   Runtime is the official Python.org embeddable build.",
      "echo ==================================================",
      'if not exist "%DIR%" mkdir "%DIR%" >nul 2>&1',
      "set NEED=1",
      'if exist "%DIR%\\version.txt" set /p HAVE=<"%DIR%\\version.txt"',
      'if "%HAVE%"=="%LATEST%" set NEED=0',
      'if "%NEED%"=="1" (',
      "  echo Downloading engine bundle...",
      "  powershell -NoProfile -ExecutionPolicy Bypass -Command \"[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%BUNDLE_URL%' -OutFile '%DIR%\\bundle.zip'\"",
      "  if errorlevel 1 goto fail",
      "  echo Unpacking...",
      "  powershell -NoProfile -ExecutionPolicy Bypass -Command \"Expand-Archive -Force '%DIR%\\bundle.zip' '%DIR%'\"",
      "  if errorlevel 1 goto fail",
      '  del "%DIR%\\bundle.zip" >nul 2>&1',
      '  echo %LATEST%>"%DIR%\\version.txt"',
      ")",
      "echo Starting the AetherScan engine on this computer...",
      "echo Your browser will open and pair automatically - leave this",
      "echo window open while you are using AetherScan.",
      'start "AetherScan Engine" /D "%DIR%\\engine" "%DIR%\\runtime\\python.exe" "%DIR%\\engine\\main.py" --pair "%CONSOLE_URL%" --origin "%ORIGIN%"',
      "timeout /t 3 >nul",
      "exit /b 0",
      ":fail",
      "echo Download failed - check your internet connection and run this file again.",
      "pause",
      "exit /b 1",
    ].join("\r\n");
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function generateLauncher(statusEl) {
    const version = await fetchLatestVersion();
    const consoleUrl = siteBase() + "console.html";
    const bundleUrl = siteBase() + `engine/aetherscan-portable-${version}.zip`;
    const bat = buildLauncherBat(version, consoleUrl, bundleUrl, location.origin);
    downloadText(bat, `Start-AetherScan-${version}.bat`);
    if (statusEl) {
      statusEl.textContent = "Launcher downloaded — open it from your Downloads folder and allow it to run.";
      statusEl.className = "status ok";
    }
  }

  /* ------------------------------------------------------------------ */
  /* Engine update badge (live mode)                                     */
  /* ------------------------------------------------------------------ */

  let updateToastShown = false;

  async function checkEngineUpdate() {
    if (!pairing.connected) return;
    try {
      const resp = await origFetch(`${pairing.base}/api/status`, {
        headers: { "X-Aether-Token": pairing.token } });
      if (!resp.ok) return;
      const body = await resp.json();
      const update = body.update;
      if (update && update.available && !updateToastShown) {
        updateToastShown = true;
        renderPill("Engine: live ⬆");
        toast(`Engine update available: v${update.latest} (installed v${update.current}). Restart the launcher to update.`, "info", 8000);
      }
    } catch { /* engine offline — ignore */ }
  }

  const origFetch = window.fetch.bind(window);
  const origOpen = window.open.bind(window);

  /* In demo mode, report tiles try window.open("/api/report?...") which would
     404 on static hosting — synthesize the report as a blob document instead. */
  function demoReportHtml() {
    const rows = demoDevices.map(d => {
      const audit = auditStore[d.id];
      const score = audit ? `<span class="score">${audit.score}</span>` : "—";
      return `<tr><td><strong>${d.custom_name}</strong><br><span style="color:#86868b;font-size:12px">${d.vendor || ""}</span></td>
        <td>${d.ip}</td><td style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${d.mac}</td>
        <td>${d.device_type}</td><td>${d.os_guess || "—"}</td><td>${score}</td></tr>`;
    }).join("");
    const findings = [];
    for (const [id, audit] of Object.entries(auditStore)) {
      const dev = demoDevices.find(d => d.id === id);
      for (const f of audit.findings) {
        findings.push(`<tr><td><span class="sev ${f.severity}">${f.severity}</span></td>
          <td><strong>${f.title}</strong><br><span style="color:#86868b;font-size:12px">${f.description}</span></td>
          <td>${dev ? dev.ip : ""}</td><td style="color:#6e6e73">${f.remediation}</td></tr>`);
      }
    }
    const summary = summarizeAudits();
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>AetherScan Report (demo)</title><style>
      body{font-family:-apple-system,'Segoe UI',Inter,sans-serif;background:#f5f5f7;color:#1d1d1f;padding:44px 22px;line-height:1.55}
      .page{max-width:960px;margin:0 auto}
      .hero{background:linear-gradient(135deg,#0a84ff,#5e5ce6);border-radius:24px;padding:36px;color:#fff;margin-bottom:24px}
      h1{font-size:30px;margin:0} .hero p{opacity:.9;margin-top:6px}
      section{background:#fff;border-radius:20px;padding:26px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
      h2{font-size:19px;margin:0 0 12px} table{width:100%;border-collapse:collapse;font-size:13.5px}
      th{text-align:left;font-size:11px;text-transform:uppercase;color:#6e6e73;padding:8px;border-bottom:1px solid #e5e5ea}
      td{padding:9px 8px;border-bottom:1px solid #f0f0f2;vertical-align:top}
      .score{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#30d158;color:#fff;font-weight:700}
      .sev{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:600;text-transform:uppercase}
      .sev.critical{background:#ffe5e4;color:#c41e3a}.sev.high{background:#ffedd9;color:#b25000}
      .sev.medium{background:#fff4cc;color:#8a6d00}.sev.low{background:#e8f2ff;color:#0066cc}.sev.info{background:#ececf0;color:#555}
      footer{text-align:center;color:#86868b;font-size:12px;margin-top:26px}
    </style></head><body><div class="page">
      <div class="hero"><h1>Network Intelligence Report</h1>
      <p>AetherScan v1.4.0 · demo LAN · ${new Date().toLocaleString()}</p>
      <p>Devices: ${demoDevices.length} · Audited: ${summary.devices_audited} · Avg score: ${summary.average_score} (${summary.grade})</p></div>
      <section><h2>Discovered devices</h2><table><tr><th>Device</th><th>IP</th><th>MAC</th><th>Type</th><th>OS guess</th><th>Score</th></tr>${rows}</table></section>
      <section><h2>Security findings</h2>${findings.length ?
        `<table><tr><th>Severity</th><th>Finding</th><th>Device</th><th>Remediation</th></tr>${findings.join("")}</table>`
        : `<p style="color:#30d158">No findings yet — run an audit from the console.</p>`}</section>
      <footer>AetherScan Labs · web demo report · non-invasive checks only</footer>
    </div></body></html>`;
  }

  window.open = function (url, ...rest) {
    const u = typeof url === "string" ? url : url?.url || "";
    if (pairing.connected || !u.startsWith("/api/report")) {
      return origOpen(url, ...rest);
    }
    const blob = new Blob([demoReportHtml()], { type: "text/html" });
    return origOpen(URL.createObjectURL(blob), "_blank");
  };

  async function proxyToEngine(base, token, userInit, url) {
    const init = { ...userInit };
    init.headers = { ...(userInit?.headers || {}), "X-Aether-Token": token };
    const resp = await origFetch(base + url, init);
    // CORS failures surface as TypeError upstream; nothing to add here.
    return resp;
  }

  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (!url.startsWith("/api/")) return origFetch(input, init);

    if (pairing.connected) {
      return proxyToEngine(pairing.base, pairing.token, init, url);
    }
    const method = (init.method || "GET").toUpperCase();
    let body = {};
    if (init.body) { try { body = JSON.parse(init.body); } catch { body = {}; } }
    const path = url.slice("/api".length);
    const resp = await demoApi(method, path, body);
    if (!pairing.connected && pairing.base) tryAutoConnect(); // opportunistic
    return resp;
  };

  /* ------------------------------------------------------------------ */
  /* UI: engine pill + pairing modal                                     */
  /* ------------------------------------------------------------------ */

  function ensureStyles() {
    if (document.getElementById("aether-platform-style")) return;
    const style = document.createElement("style");
    style.id = "aether-platform-style";
    style.textContent = `
    .engine-pill{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:99px;
      background:var(--surface-strong);border:1px solid var(--border);font-size:12px;font-weight:600;
      color:var(--text-2);cursor:pointer;transition:border-color .2s}
    .engine-pill:hover{border-color:var(--accent);color:var(--text)}
    .engine-pill .dot{width:7px;height:7px;border-radius:50%;background:var(--yellow)}
    .engine-pill.live .dot{background:var(--green);box-shadow:0 0 8px var(--green)}
    .aether-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200;
      display:grid;place-items:center;animation:fadeIn .2s ease-out}
    .aether-modal{width:min(440px,92vw);background:var(--bg-soft);border:1px solid var(--border-strong);
      border-radius:18px;padding:22px;box-shadow:var(--shadow);animation:slideIn .25s var(--ease-spring)}
    .aether-modal h3{font-size:16px;margin-bottom:6px}
    .aether-modal p{font-size:12.5px;color:var(--text-2);margin-bottom:14px;line-height:1.5}
    .aether-modal label{display:block;font-size:11px;font-weight:700;letter-spacing:.7px;
      text-transform:uppercase;color:var(--text-3);margin:10px 0 5px}
    .aether-modal input{width:100%;background:var(--surface-strong);border:1px solid var(--border);
      border-radius:10px;padding:9px 12px;font-size:13px;color:var(--text);outline:none}
    .aether-modal input:focus{border-color:var(--accent)}
    .aether-modal .row{display:flex;gap:9px;justify-content:flex-end;margin-top:16px}
    .aether-modal .status{margin-top:10px;font-size:12.5px;min-height:16px}
    .aether-modal .status.ok{color:var(--green)} .aether-modal .status.err{color:var(--red)}
    `;
    document.head.appendChild(style);
  }

  function renderPill(labelOverride) {
    ensureStyles();
    const host = document.getElementById("net-pill");
    if (!host) return;
    let pill = document.getElementById("engine-pill");
    if (!pill) {
      pill = document.createElement("button");
      pill.id = "engine-pill";
      pill.className = "engine-pill";
      pill.addEventListener("click", openPairingModal);
      host.parentNode.insertBefore(pill, host);
    }
    pill.classList.toggle("live", pairing.connected);
    const label = labelOverride ||
      (pairing.connected ? "Engine: live" : "Engine: demo");
    pill.innerHTML = `<span class="dot"></span>${label}`;
  }

  function openPairingModal() {
    ensureStyles();
    const backdrop = document.createElement("div");
    backdrop.className = "aether-modal-backdrop";
    backdrop.innerHTML = `
      <div class="aether-modal">
        ${pairing.connected ? `
          <h3>Live engine connected</h3>
          <p>This console is paired with the AetherScan engine running on
             <code>${pairing.base}</code>. Real scans now run on this computer's
             network. Keep the engine window open while using the console.</p>
          <div class="status ok" id="pair-status">✔ Paired${pairing.token ? "" : ""}</div>
          <div class="row">
            <button class="btn btn-ghost btn-sm" id="pair-forget">Unpair</button>
            <button class="btn btn-primary btn-sm" id="pair-close">Done</button>
          </div>
        ` : `
          <h3>Scan your real network</h3>
          <p>Everything in the console can run against a simulated LAN, but browsers
             can't ping or read ARP tables — real scanning needs a small engine on
             your computer. <b>No Python installation is required.</b> One download (~13 MB),
             one double-click, and this page pairs automatically.</p>
          <div class="row" style="justify-content:flex-start">
            <button class="btn btn-primary btn-sm" id="pair-launcher">⬇ Download my launcher (.bat)</button>
          </div>
          <div class="status" id="pair-status"></div>
          <p style="margin-top:12px;font-size:11.5px">Steps: run the downloaded
             <code>Start-AetherScan-*.bat</code> from your Downloads folder (Windows may ask for
             confirmation — it only downloads the official Python.org embeddable runtime plus the
             AetherScan engine, then opens this page paired). The engine runs locally; nothing but
             your own scan traffic leaves your machine.</p>
          <div class="auth-setup" id="pair-advanced" style="display:none">
            <p><b>Advanced:</b> already have the engine running? Paste its details.</p>
            <label>Engine URL</label>
            <input id="pair-base" value="${pairing.base || cfg.engineBase}" spellcheck="false"/>
            <label>Session token</label>
            <input id="pair-token" value="${pairing.token || ""}" placeholder="printed in the engine's terminal" spellcheck="false"/>
            <div class="row">
              <button class="btn btn-ghost btn-sm" id="pair-connect">Connect</button>
            </div>
          </div>
          <div class="row" style="justify-content:space-between">
            <button class="btn btn-ghost btn-sm" id="pair-manual">Manual pairing…</button>
            <button class="btn btn-ghost btn-sm" id="pair-close">Close</button>
          </div>
        `}
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector("#pair-close").addEventListener("click", () => backdrop.remove());

    const launcherBtn = backdrop.querySelector("#pair-launcher");
    if (launcherBtn) {
      launcherBtn.addEventListener("click", async () => {
        launcherBtn.disabled = true;
        await generateLauncher(backdrop.querySelector("#pair-status"));
        launcherBtn.disabled = false;
      });
    }
    const manualBtn = backdrop.querySelector("#pair-manual");
    if (manualBtn) {
      manualBtn.addEventListener("click", () => {
        const adv = backdrop.querySelector("#pair-advanced");
        adv.style.display = adv.style.display === "block" ? "none" : "block";
      });
    }
    const forgetBtn = backdrop.querySelector("#pair-forget");
    if (forgetBtn) {
      forgetBtn.addEventListener("click", () => {
        pairing.base = null; pairing.token = null; pairing.connected = false;
        savePairing(); renderPill(); backdrop.remove();
        window.dispatchEvent(new CustomEvent("aetherscan:modechange"));
      });
    }
    const connectBtn = backdrop.querySelector("#pair-connect");
    if (connectBtn) {
      connectBtn.addEventListener("click", async () => {
        const base = backdrop.querySelector("#pair-base").value.trim().replace(/\/$/, "");
        const token = backdrop.querySelector("#pair-token").value.trim();
        const status = backdrop.querySelector("#pair-status");
        if (!base || !token) { status.textContent = "Both fields are required."; status.className = "status err"; return; }
        status.textContent = "Probing engine…"; status.className = "status";
        const probe = await probeEngine(base, token);
        if (probe.ok) {
          pairing.base = base; pairing.token = token; pairing.connected = true;
          savePairing(); renderPill();
          status.textContent = `Connected — AetherScan v${probe.version}. Reloading console…`;
          status.className = "status ok";
          setTimeout(() => location.reload(), 900);
        } else {
          status.textContent = probe.status === 401
            ? "Engine reachable but the token was rejected — copy it from the engine's terminal."
            : `Could not reach the engine (${probe.error || probe.status || "refused"}). Is it running?`;
          status.className = "status err";
        }
      });
    }
  }

  window.AetherPlatform = { tryAutoConnect, renderPill, pairing,
                            handlePairFragment, generateLauncher };

  document.addEventListener("DOMContentLoaded", () => {
    const viaFragment = handlePairFragment();
    renderPill();
    if (!viaFragment) tryAutoConnect();
    setInterval(checkEngineUpdate, 60000);
    checkEngineUpdate();
  });
})();
