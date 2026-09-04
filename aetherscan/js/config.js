/* AetherScan web — deployment configuration. */
window.AETHERSCAN_CONFIG = {
  clientId: "949741347685-arahv0dbp32vosl52fqptsbkuh98408i.apps.googleusercontent.com",
  engineBase: "http://127.0.0.1:8765",
  siteName: "AetherScan",
  ownerSite: "https://jamezboi.github.io",
};

// Bootstrap a safe license API before demo-api.js loads. This prevents an
// activation call from crashing if license-web.js is stale or unavailable.
window.AetherLicense = window.AetherLicense || {};
window.AetherLicense.isDevKey = async () => false;
window.AetherLicense.keyValid = window.AetherLicense.keyValid || (async () => false);
window.AetherLicense.tierOf = window.AetherLicense.tierOf || (async () => "pro");

// Development unlock is not part of the production web console.
const removeAetherDevUnlock = () => {
  document.querySelectorAll(".dev-unlock").forEach(el => el.remove());
};
removeAetherDevUnlock();
document.addEventListener("DOMContentLoaded", removeAetherDevUnlock);
