"""Prepare a local Reserve plan from separately licensed GRID metadata/feed.

No downloader, credentials, data or inferred roles are included. Python 3.10+,
standard library; decompress the selected JSONL feed outside this repository.
"""
import argparse
from collections import Counter
import csv
from datetime import datetime
import json
from pathlib import Path


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Use an ISO timestamp with a timezone")
    return parsed


def extract_actions(stream, series_id):
    """Return team-level draft events. A pick event does not identify a player."""
    actions = []
    seen = set()
    previous = -1
    for line in stream:
        envelope = json.loads(line)
        if str(envelope["seriesId"]) != str(series_id):
            raise ValueError("The feed belongs to another series")
        if envelope["sequenceNumber"] <= previous:
            raise ValueError("Feed envelopes must be in increasing sequence order")
        previous = envelope["sequenceNumber"]
        for event in envelope["events"]:
            if event["type"] not in ("team-picked-character", "team-banned-character"):
                continue
            if event["id"] in seen:
                raise ValueError("Duplicate draft event ID")
            seen.add(event["id"])
            changed = event["seriesStateDelta"]["games"]
            if len(changed) != 1 or len(changed[0]["draftActions"]) != 1:
                raise ValueError("Expected one changed game/action per draft event")
            action = changed[0]["draftActions"][0]
            if action["drafter"]["type"] != "team":
                raise ValueError("Expected a team-level draft action")
            if action["drafter"]["id"] != event["actor"]["id"] or action["draftable"]["id"] != event["target"]["id"]:
                raise ValueError("Draft delta and event actor/target disagree")
            actions.append({"gameId": changed[0]["id"], "sequence": action["sequenceNumber"],
                            "action": action["type"], "team": str(action["drafter"]["id"]),
                            "champion": action["draftable"]["name"], "occurredAt": envelope["occurredAt"]})
    return actions


def build_plan(games, rosters, *, series_id, as_of, completed=2, best_of=5,
               min_games=3, actions=(), draft_actions=0, current_picks=None):
    """Build proposed pools; a coach must confirm pools, roles and league rule."""
    cutoff = timestamp(as_of)
    selected = sorted((g for g in games.values() if g["series_id"] == series_id), key=lambda g: int(g["game_number"]))
    if best_of not in (3, 5) or completed < 0 or completed >= best_of or min_games < 1:
        raise ValueError("Use BO3/BO5, a valid completed-game count and a positive pool threshold")
    if len(selected) <= completed:
        raise ValueError("The metadata has no next game for this preparation view")
    # For this adapter the declared lineup comes from the latest completed
    # game (or Game 1 before play). Substitutions and roles are coach edits.
    lineup_game = selected[max(0, completed - 1)]
    lineup_rows = [r for r in rosters if r["game_id"] == lineup_game["game_id"]]
    if len(lineup_rows) != 10 or len({r["player_id"] for r in lineup_rows}) != 10:
        raise ValueError("The lineup needs ten distinct player slots")
    teams = [{"id": lineup_game[f"team{n}_id"], "name": lineup_game[f"team{n}_name"]} for n in (1, 2)]
    lineup_ids = {r["player_id"] for r in lineup_rows}
    evidence = []
    seen = {}
    for row in rosters:
        if row["player_id"] not in lineup_ids or not row["character_name"]:
            continue
        game = games[row["game_id"]]
        if not game["started_at"] or timestamp(game["started_at"]) >= cutoff:
            continue
        key = (row["game_id"], row["player_id"])
        if key in seen:
            if seen[key] != row["character_name"]:
                raise ValueError("A historical player/game has contradictory champion records")
            continue
        seen[key] = row["character_name"]
        evidence.append({"gameId": row["game_id"], "playedAt": game["started_at"],
                         "team": row["team_id"], "player": row["player_id"],
                         "champion": row["character_name"], "patch": game["patch"],
                         "source": "GRID metadata; game-start timestamp"})
    players = []
    for team in teams:
        rows = sorted((r for r in lineup_rows if r["team_id"] == team["id"]), key=lambda r: r["player_id"])
        if len(rows) != 5:
            raise ValueError("Each lineup team needs five players")
        for index, row in enumerate(rows, 1):
            counts = Counter(r["champion"] for r in evidence if r["player"] == row["player_id"])
            players.append({"id": row["player_id"], "team": team["id"], "name": row["player_name"].strip(),
                            "role": f"Slot {index}", "pool": sorted(c for c, count in counts.items() if count >= min_games),
                            "confirmed": False})
    past = []
    for index in range(completed):
        game = selected[index]
        if int(game["game_number"]) != index + 1 or game["finished"].lower() != "true" or not game["winner_team_id"]:
            raise ValueError("Completed games need contiguous numbers and a recorded winner")
        rows = [r for r in rosters if r["game_id"] == game["game_id"]]
        picks = {r["player_id"]: r["character_name"] for r in rows}
        if set(picks) != lineup_ids:
            raise ValueError("A lineup substitution needs a coach-edited plan instead of this fixed-lineup adapter")
        bans = [a["champion"] for a in actions if a["gameId"] == game["game_id"] and a["action"] == "ban"]
        past.append({"number": index + 1, "winner": game["winner_team_id"], "picks": picks, "bans": bans})
    current_game = selected[completed]
    observed = sorted((a for a in actions if a["gameId"] == current_game["game_id"] and a["sequence"] <= draft_actions),
                      key=lambda a: a["sequence"])
    if [a["sequence"] for a in observed] != list(range(1, draft_actions + 1)):
        raise ValueError("The requested draft prefix is incomplete")
    picked = [a for a in observed if a["action"] == "pick"]
    bound = dict(current_picks or {})
    if len(bound) != len(picked) or set(bound.values()) != {a["champion"] for a in picked}:
        raise ValueError("Current pick events identify teams, not players. Supply coach-assigned --current-picks JSON, or use a prefix before the first pick")
    for player, champion in bound.items():
        declared = next((p for p in players if p["id"] == player), None)
        actor = next(a["team"] for a in picked if a["champion"] == champion)
        if declared is None or declared["team"] != actor:
            raise ValueError("A current pick binding belongs to another team/player")
    return {"format": "reserve-plan/1", "title": " vs ".join(t["name"] for t in teams), "asOf": as_of, "bestOf": best_of,
            "rules": {"mode": "hard-global", "resetFinal": False, "confirmed": False,
                      "source": "Add the applicable official rule or your explicit global Hard Fearless planning assumption."},
            "teams": teams, "players": players, "games": past,
            "current": {"bans": [a["champion"] for a in observed if a["action"] == "ban"], "picks": bound},
            "evidence": evidence, "evidencePolicy": {"minGames": min_games, "patch": ""}, "branches": [],
            "notes": f"Separately licensed source. Pool evidence is filtered by game-start timestamp strictly before {as_of}; no win/result features. "
                     f"Current Game {completed + 1} uses only draft actions 1–{draft_actions}. "
                     "Later bans/picks are excluded from this view. Slots are sorted by player ID; a coach assigns roles and confirms playable pools. "
                     "Team-level draft picks require coach player bindings, never inferred future played-game roles. "
                     "Keep this plan and its evidence in approved private storage under the data source’s license."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--meta", type=Path, required=True, help="Separate directory containing games.csv and rosters.csv")
    parser.add_argument("--feed", type=Path, help="Separately decompressed one-series JSONL; optional before any draft action")
    parser.add_argument("--series-id", required=True)
    parser.add_argument("--as-of", required=True, help="Strict pool-evidence cutoff, ISO time with timezone")
    parser.add_argument("--completed-games", type=int, default=2)
    parser.add_argument("--best-of", type=int, choices=(3, 5), default=5)
    parser.add_argument("--min-games", type=int, default=3)
    parser.add_argument("--draft-actions", type=int, default=0, help="Inclusive current-game draft-action prefix, 0–20")
    parser.add_argument("--current-picks", type=Path, help="Coach mapping {player_id: champion_name} for picks in that prefix")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parent):
        parser.error("Save licensed plans outside this public source repository")
    if not 0 <= args.draft_actions <= 20:
        parser.error("--draft-actions must be between 0 and 20")
    with (args.meta / "games.csv").open(encoding="utf-8", newline="") as stream:
        games = {r["game_id"]: r for r in csv.DictReader(stream) if r["title"] == "lol"}
    with (args.meta / "rosters.csv").open(encoding="utf-8", newline="") as stream:
        rosters = [r for r in csv.DictReader(stream) if r["title"] == "lol"]
    actions = []
    if args.feed:
        with args.feed.open(encoding="utf-8") as stream:
            actions = extract_actions(stream, args.series_id)
    picks = json.loads(args.current_picks.read_text()) if args.current_picks else None
    plan = build_plan(games, rosters, series_id=args.series_id, as_of=args.as_of, completed=args.completed_games,
                      best_of=args.best_of, min_games=args.min_games, actions=actions, draft_actions=args.draft_actions, current_picks=picks)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    args.output.chmod(0o600)
    print(json.dumps({"output": str(args.output), "observations": len(plan["evidence"]),
                      "pools": "proposed; coach confirmation pending", "completed_games": len(plan["games"]),
                      "current_bans": len(plan["current"]["bans"])}))


if __name__ == "__main__":
    main()
