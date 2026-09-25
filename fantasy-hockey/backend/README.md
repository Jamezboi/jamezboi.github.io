# Hockey AI Pro backend

This directory contains the compact FastAPI integration layer for private ESPN Fantasy Hockey leagues.

Set ESPN_S2 and SWID only as server-side environment variables. Never put them in the GitHub Pages frontend.

Run locally with:

uvicorn main:app --host 0.0.0.0 --port 8000

The frontend expects:

- GET /api/league/teams
- GET /api/live/games
- GET /api/health

GitHub Pages hosts only the static frontend. Deploy this backend on a Python-capable server/runtime, then enter its base URL in Hockey AI Pro → Settings.