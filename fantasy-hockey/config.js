window.FANTASY_CONFIG = {
  appName: 'Hockey AI Pro',
  version: '6.1.0-release',
  defaultLeagueId: '760495843',
  season: 2027,
  gameCode: 'fhl',
  espnHost: 'https://lm-api-reads.fantasy.espn.com',
  espnScoreboard: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
  nhlScore: 'https://api-web.nhle.com/v1/score/now',
  // Leave blank on GitHub Pages. Set this to your deployed FastAPI base URL for private ESPN leagues.
  apiBase: '',
  refreshSeconds: 20,
  simulationIterations: 500,
  storageKey: 'hockey-ai-pro-settings-v61'
};
