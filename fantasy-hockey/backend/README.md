# Hockey AI Pro backend

This directory contains the FastAPI integration layer for the private ESPN Fantasy Hockey league used by Hockey AI Pro.

## Production host

The repository is configured for this Render service:

`https://hockey-ai-pro-jamezboi.onrender.com`

The GitHub Pages frontend is configured in `fantasy-hockey/config.js` to use that URL.

Architecture:

`https://jamezboi.github.io/fantasy-hockey/`
→ `https://hockey-ai-pro-jamezboi.onrender.com`
→ ESPN Fantasy API

## Deploy with Render

The repository root contains `render.yaml`. In Render, create a Blueprint from this repository and deploy the `hockey-ai-pro-jamezboi` web service.

Render uses:

- Root directory: `fantasy-hockey/backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/health`
- Plan: Free

The Blueprint intentionally does **not** contain ESPN session credentials.

During the initial Render Blueprint setup, provide these secret environment variables when prompted:

- `ESPN_S2` = your ESPN `espn_s2` session cookie
- `SWID` = your ESPN `SWID` session cookie

Also configured:

- `LEAGUE_ID=760495843`
- `ESPN_FANTASY_SEASON=2027`
- `ALLOWED_ORIGINS=https://jamezboi.github.io`

Never commit `ESPN_S2` or `SWID` to GitHub.

## API

The frontend uses:

- `GET /api/health`
- `GET /api/league/teams`
- `GET /api/live/games`

The fantasy endpoint is restricted to the configured league ID rather than acting as a general ESPN proxy.

## Local development

From this directory:

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

For local browser access, set `ALLOWED_ORIGINS` to include your local frontend origin.

## Security model

ESPN's private-session cookies stay on the FastAPI server. The browser only receives the resulting fantasy data. GitHub Pages never receives or stores the ESPN credentials.

CORS is restricted to the production GitHub Pages origin instead of using a wildcard origin.
