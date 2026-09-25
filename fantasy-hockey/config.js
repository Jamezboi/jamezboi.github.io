window.FANTASY_CONFIG = {
  appName: 'Hockey AI Pro',
  version: '6.2.0-release',
  defaultLeagueId: '760495843',
  season: 2027,
  gameCode: 'fhl',
  espnHost: 'https://lm-api-reads.fantasy.espn.com',
  espnScoreboard: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
  nhlScore: 'https://api-web.nhle.com/v1/score/now',

  // Secure Render FastAPI service for the private ESPN league.
  // ESPN_S2 and SWID remain server-side only.
  apiBase: 'https://hockey-ai-pro-jamezboi.onrender.com',

  refreshSeconds: 20,
  simulationIterations: 500,
  storageKey: 'hockey-ai-pro-settings-v62'
};
