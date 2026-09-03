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
  clientId: "",                                   // e.g. "1234567890-abc.apps.googleusercontent.com"
  engineBase: "http://127.0.0.1:8765",            // local AetherScan engine for Live mode
  siteName: "AetherScan",
  ownerSite: "https://jamezboi.github.io",
};
