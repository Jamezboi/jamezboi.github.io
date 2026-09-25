# Hockey AI Pro backend

This directory contains the FastAPI integration layer for private ESPN Fantasy Hockey leagues.

Set ESPN_S2 and SWID only as server-side environment variables. Never put them in the GitHub Pages frontend.

Run locally with:

uvicorn app:app --host 0.0.0.0 --port 8000

The frontend expects:

- GET /api/league/teams
- GET /api/live/games

GitHub Pages hosts only the static frontend. Deploy this backend on a server/runtime that can execute Python, then enter its base URL in Hockey AI Pro → Settings.