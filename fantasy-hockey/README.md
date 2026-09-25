# Hockey AI Pro

Release-ready static frontend for GitHub Pages with optional secure ESPN Fantasy backend support.

## Public app

https://jamezboi.github.io/fantasy-hockey/

## Included modules

- Executive dashboard with team AVS and roster integrity
- Full roster management with ownership-safe team mapping
- Two-sided trade analyzer
- Monte Carlo simulation lab
- Live performance center with ESPN NHL and NHL API fallbacks
- League hub and cross-team player pool
- Watchlist and CSV roster export
- Light/dark theme
- Diagnostics and API health status
- Local SVG icon system with image fallbacks
- ESPN Fantasy API integration for public leagues
- Secure backend URL support for private ESPN leagues

## ESPN HTTP 401

A private ESPN Fantasy league cannot be made authenticated by placing ESPN browser session cookies in the public GitHub Pages frontend. Configure a secure backend that stores ESPN_S2 and SWID server-side, then enter its base URL in Settings.

The public app intentionally falls back to its included demo league data when a private ESPN connection is unavailable.

## Backend

The enhanced FastAPI backend is maintained separately in the downloadable release package as backend/app.py. It exposes /api/league/teams and /api/live/games for the frontend.

GitHub Pages serves the frontend only; it does not execute Python server-side.

## Release structure

- index.html — application shell
- config.js — release/API configuration
- assets/app.css — UI
- assets/icons.js — local icon system
- assets/data.js — safe demo roster data
- assets/app.js — application runtime
- backend/ — secure server-side integration package
