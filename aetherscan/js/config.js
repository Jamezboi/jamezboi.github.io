/* AetherScan web — deployment configuration.
   ▸ Google Sign-In: create an OAuth client ID (type "Web application") in
     Google Cloud Console → APIs & Services → Credentials, and add these
     Authorized JavaScript origins:
        https://jamezboi.github.io
        http://localhost:8080          (local testing)
        http://127.0.0.1:8080          (local testing)
     Then paste the client ID below (or enter it once in the console's
     sign-in screen — it is stored in this browser only). */
window.AETHERSCAN_CONFIG = {
  clientId: "949741347685-arahv0dbp32vosl52fqptsbkuh98408i.apps.googleusercontent.com",  // configured by jamezboi
  engineBase: "http://127.0.0.1:8765",            // local AetherScan engine for Live mode
  licenseServer: "https://aetherscan.jamezboyyy.workers.dev",                              // Cloudflare Worker URL for one-time keys (empty = offline)
  siteName: "AetherScan",
  ownerSite: "https://jamezboi.github.io",
};
