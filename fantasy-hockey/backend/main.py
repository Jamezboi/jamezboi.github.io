import os
from typing import Any, Dict, List

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

APP_VERSION = "6.2.0-release"
LEAGUE_ID = os.getenv("LEAGUE_ID", "760495843")
SEASON = int(os.getenv("ESPN_FANTASY_SEASON", "2027"))
ESPN_HOST = os.getenv(
    "ESPN_FANTASY_HOST",
    "https://lm-api-reads.fantasy.espn.com",
).rstrip("/")
ESPN_SCOREBOARD = os.getenv(
    "ESPN_SCOREBOARD_URL",
    "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
)
NHL_SCORE = os.getenv("NHL_SCORE_URL", "https://api-web.nhle.com/v1/score/now")
ESPN_S2 = os.getenv("ESPN_S2", "")
SWID = os.getenv("SWID", "")
TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "15"))

# Only the public Hockey AI Pro frontend is allowed to call this API.
# Keep this configurable for local development without opening production to "*".
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://jamezboi.github.io",
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="Hockey AI Pro API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Accept", "Content-Type"],
)

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "HockeyAIPro/6.2 (+https://jamezboi.github.io/fantasy-hockey/)",
}


def espn_cookies() -> Dict[str, str]:
    cookies: Dict[str, str] = {}
    if ESPN_S2:
        cookies["espn_s2"] = ESPN_S2
    if SWID:
        cookies["SWID"] = SWID
    return cookies


def fantasy_url(league_id: str, season: int) -> str:
    return (
        f"{ESPN_HOST}/apis/v3/games/fhl/seasons/{season}/segments/0/"
        f"leagues/{league_id}"
    )


def fetch_fantasy(league_id: str, season: int) -> Dict[str, Any]:
    # Do not turn this into a general-purpose ESPN proxy. The backend is
    # intentionally scoped to the configured private league.
    if str(league_id) != str(LEAGUE_ID):
        raise HTTPException(
            status_code=403,
            detail="This backend is restricted to its configured ESPN league.",
        )

    if not ESPN_S2 or not SWID:
        raise HTTPException(
            status_code=503,
            detail="Private ESPN credentials are not configured on the backend.",
        )

    params = [
        ("view", "mTeam"),
        ("view", "mRoster"),
        ("view", "mSettings"),
        ("view", "mStandings"),
    ]

    try:
        response = requests.get(
            fantasy_url(league_id, season),
            params=params,
            headers=HEADERS,
            cookies=espn_cookies(),
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"ESPN request failed: {exc}",
        ) from exc

    if response.status_code == 401:
        raise HTTPException(
            status_code=401,
            detail=(
                "ESPN rejected the server-side session. Check ESPN_S2 and SWID "
                "in the backend environment."
            ),
        )

    if not response.ok:
        raise HTTPException(
            status_code=502,
            detail=f"ESPN Fantasy API returned HTTP {response.status_code}.",
        )

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="ESPN returned invalid JSON.",
        ) from exc


def parse_fantasy(data: Dict[str, Any], season: int) -> Dict[str, Any]:
    members = {str(m.get("id")): m for m in data.get("members", [])}
    teams: List[Dict[str, Any]] = []
    rosters: Dict[str, List[Dict[str, Any]]] = {}

    pos_map = {1: "C", 2: "LW", 3: "RW", 4: "D", 5: "G"}

    for team in data.get("teams", []):
        team_id = str(team.get("id"))
        owners: List[str] = []

        for owner_id in team.get("owners", []):
            member = members.get(str(owner_id), {})
            full_name = " ".join(
                x for x in [member.get("firstName"), member.get("lastName")] if x
            ).strip()
            owners.append(full_name or str(owner_id))

        owner = ", ".join(owners) or "Unknown"
        team_name = team.get("name") or team.get("location") or f"Team {team_id}"

        teams.append(
            {
                "id": team_id,
                "name": team_name,
                "owner": owner,
                "abbrev": team.get("abbrev", ""),
            }
        )
        rosters[team_id] = []

        entries = (team.get("roster") or {}).get("entries") or []
        for entry in entries:
            player = entry.get("player") or {}
            projection = float(player.get("projectedTotalPoints") or 0)

            rosters[team_id].append(
                {
                    "espn_id": player.get("id"),
                    "fantasy_team_id": team_id,
                    "fantasy_team_name": team_name,
                    "fantasy_owner": owner,
                    "name": player.get("fullName")
                    or player.get("displayName")
                    or f"Player {player.get('id')}",
                    "team": player.get("proTeamAbbrev")
                    or player.get("proTeam")
                    or "",
                    "position": pos_map.get(
                        player.get("defaultPositionId"),
                        "UTIL",
                    ),
                    "slot": str(entry.get("lineupSlotId", "")),
                    "status": player.get("injuryStatus") or "Healthy",
                    "projection": projection,
                    "ai_value_score": projection,
                    "ai_tier": "Live",
                    "has_game_today": False,
                    "opponent": "",
                    "game_time": "",
                    "stats": player.get("stats") or {},
                    "headshot_url": (
                        "https://a.espncdn.com/i/headshots/nhl/players/full/"
                        f"{player.get('id')}.png"
                        if player.get("id")
                        else ""
                    ),
                }
            )

    return {
        "source": "ESPN Fantasy API",
        "connected": True,
        "league_id": str(LEAGUE_ID),
        "season": season,
        "teams": teams,
        "rosters": rosters,
    }


def parse_espn_live(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    games: List[Dict[str, Any]] = []

    for event in data.get("events", []):
        comp = (event.get("competitions") or [{}])[0]
        competitors = comp.get("competitors") or []
        away = next(
            (x for x in competitors if x.get("homeAway") == "away"),
            {},
        )
        home = next(
            (x for x in competitors if x.get("homeAway") == "home"),
            {},
        )
        status = (event.get("status") or {}).get("type") or {}
        state = status.get("state")

        games.append(
            {
                "id": event.get("id"),
                "state": (
                    "in"
                    if state == "in"
                    else "post"
                    if state == "post"
                    else "scheduled"
                ),
                "detail": status.get("shortDetail")
                or status.get("detail")
                or "",
                "date": event.get("date", ""),
                "away": {
                    "abbr": (away.get("team") or {}).get("abbreviation", ""),
                    "name": (away.get("team") or {}).get("displayName", ""),
                    "score": int(away.get("score") or 0),
                },
                "home": {
                    "abbr": (home.get("team") or {}).get("abbreviation", ""),
                    "name": (home.get("team") or {}).get("displayName", ""),
                    "score": int(home.get("score") or 0),
                },
            }
        )

    return games


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "version": APP_VERSION,
        "league_id": LEAGUE_ID,
        "season": SEASON,
        "private_credentials_configured": bool(ESPN_S2 and SWID),
        "allowed_origins": ALLOWED_ORIGINS,
    }


@app.get("/api/league/teams")
def league_teams(
    league_id: str = Query(default=LEAGUE_ID),
    season: int = Query(default=SEASON),
) -> Dict[str, Any]:
    return parse_fantasy(fetch_fantasy(league_id, season), season)


@app.get("/api/live/games")
def live_games() -> Dict[str, Any]:
    try:
        response = requests.get(
            ESPN_SCOREBOARD,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        return {
            "source": "ESPN NHL",
            "games": parse_espn_live(response.json()),
        }
    except (requests.RequestException, ValueError):
        pass

    try:
        response = requests.get(
            NHL_SCORE,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        games = []

        for game in response.json().get("games", []):
            state = game.get("gameState")
            games.append(
                {
                    "id": game.get("id"),
                    "state": (
                        "in"
                        if state in {"LIVE", "CRIT"}
                        else "post"
                        if state == "FINAL"
                        else "scheduled"
                    ),
                    "detail": state or "",
                    "date": game.get("startTime", ""),
                    "away": {
                        "abbr": (game.get("awayTeam") or {}).get("abbrev", ""),
                        "name": (
                            (game.get("awayTeam") or {}).get("name") or {}
                        ).get("default", ""),
                        "score": int(
                            (game.get("awayTeam") or {}).get("score") or 0
                        ),
                    },
                    "home": {
                        "abbr": (game.get("homeTeam") or {}).get("abbrev", ""),
                        "name": (
                            (game.get("homeTeam") or {}).get("name") or {}
                        ).get("default", ""),
                        "score": int(
                            (game.get("homeTeam") or {}).get("score") or 0
                        ),
                    },
                }
            )

        return {"source": "NHL API", "games": games}
    except (requests.RequestException, ValueError):
        return {
            "source": "Unavailable",
            "games": [],
            "error": "No live provider available",
        }
