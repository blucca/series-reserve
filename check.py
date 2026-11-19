"""Small independent checks; all samples are fictional, with no licensed data."""
from itertools import product
import io
import json
from pathlib import Path
from grid_plan import build_plan, extract_actions
from reserve import allocate


def brute(pools, i=0, used=frozenset()):
    if i == len(pools):
        return 0
    return max([brute(pools, i + 1, used)] +
               [1 + brute(pools, i + 1, used | {c}) for c in pools[i] - used])


# All 64 three-slot graphs over two champions, against a separate exhaustive solver.
options = [set(), {"x"}, {"y"}, {"x", "y"}]
for pools in product(options, repeat=3):
    slots = {str(i): pool for i, pool in enumerate(pools)}
    r = allocate(slots)
    assert r["filled"] == brute(pools)
    assert len(set(r["matching"].values())) == r["filled"]
    assert all(c in slots[s] for s, c in r["matching"].items())
    if r["bottleneck"]:
        b = r["bottleneck"]
        neighbors = set().union(*(slots[s] for s in b["slots"]))
        assert neighbors == set(b["options"])
        assert len(b["slots"]) - len(neighbors) == b["shortfall"] > 0

# Both players individually have enough options; the shared reserve does not.
r = allocate({"a/g1": {"x", "y"}, "a/g2": {"x", "y"},
              "b/g1": {"x", "y"}, "b/g2": {"x", "y"}})
assert r["filled"] == 2 and r["bottleneck"]["shortfall"] == 2

# A forced pick fills a slot as it consumes shared capacity.
slots = {"a/g1": {"x", "y"}, "a/g2": {"x", "y"},
         "b/g1": {"x", "z", "w"}, "b/g2": {"x", "z", "w"}}
assert allocate(slots, forced={"b/g1": "x"})["filled"] == 3
assert allocate(slots, forced={"b/g1": "z"})["filled"] == 4

# A current-game ban is local; that champion remains available in a later game.
assert allocate({"a/g1": {"x"}, "a/g2": {"x", "y"}})["matching"] == {
    "a/g1": "x", "a/g2": "y"}
assert allocate({"a/g1": {"x"}, "a/g2": {"x", "y"}}, consumed={"x"})["filled"] == 1
try:
    allocate(slots, forced={"a/g1": "x", "b/g1": "x"})
except ValueError:
    pass
else:
    raise AssertionError("A duplicated forced champion was accepted")

# A fictional metadata/feed adapter task, using the same browser example.
demo = json.loads((Path(__file__).parent / "demo.json").read_text())
players = {p["id"]: p for p in demo["players"]}
games = {}
rosters = []
for number in (1, 2, 3):
    game_id = f"demo-game-{number}"
    games[game_id] = {"series_id": "demo", "game_id": game_id, "game_number": str(number),
                      "started_at": "2026-11-01T19:00:00Z", "finished": "True" if number < 3 else "False",
                      "winner_team_id": "ember" if number == 1 else "tide", "patch": "fictional",
                      "team1_id": "ember", "team1_name": "Ember", "team2_id": "tide", "team2_name": "Tide"}
    if number < 3:
        for pid, champion in demo["games"][number - 1]["picks"].items():
            rosters.append({"game_id": game_id, "player_id": pid, "team_id": players[pid]["team"],
                            "player_name": players[pid]["name"], "character_name": champion})
for row in demo["evidence"]:
    games[row["gameId"]] = {"series_id": "prior", "game_id": row["gameId"], "game_number": "1",
                            "started_at": row["playedAt"], "patch": row["patch"]}
    rosters.append({"game_id": row["gameId"], "player_id": row["player"], "team_id": row["team"],
                    "player_name": players[row["player"]]["name"], "character_name": row["champion"]})
event = {"id": "fake-ban-event", "type": "team-banned-character", "actor": {"id": "tide"}, "target": {"id": "fake-rell"},
         "seriesStateDelta": {"games": [{"id": "demo-game-3", "draftActions": [{"sequenceNumber": 1, "type": "ban",
         "drafter": {"id": "tide", "type": "team"}, "draftable": {"id": "fake-rell", "name": "Rell"}}]}]}}
envelope = {"seriesId": "demo", "sequenceNumber": 8, "occurredAt": "2026-11-01T21:00:00Z", "events": [event]}
actions = extract_actions(io.StringIO(json.dumps(envelope) + "\n"), "demo")
adapted = build_plan(games, rosters, series_id="demo", as_of=demo["asOf"], actions=actions, draft_actions=1)
assert len(adapted["evidence"]) == len(demo["evidence"])
assert adapted["current"]["bans"] == ["Rell"]
assert all(not p["confirmed"] for p in adapted["players"])
assert not adapted["rules"]["confirmed"]
assert {p["id"]: p["pool"] for p in adapted["players"]} == {p["id"]: sorted(p["pool"]) for p in demo["players"]}
actions.append({"gameId": "demo-game-3", "sequence": 2, "action": "pick", "team": "tide", "champion": "Thresh"})
try:
    build_plan(games, rosters, series_id="demo", as_of=demo["asOf"], actions=actions, draft_actions=2)
except ValueError as exc:
    assert "coach-assigned" in str(exc)
else:
    raise AssertionError("Team-only current pick was assigned to a player automatically")
bound = build_plan(games, rosters, series_id="demo", as_of=demo["asOf"], actions=actions,
                   draft_actions=2, current_picks={"tide-support": "Thresh"})
assert bound["current"]["picks"] == {"tide-support": "Thresh"}
print("PASS: exact allocation, shared-pool bottleneck, forced picks, per-game bans and licensed-input adapter fictional task")
