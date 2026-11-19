"""Small independent checks; all samples are fictional, with no licensed data."""
from itertools import product
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
print("PASS: exact allocation, shared-pool bottleneck, forced picks and per-game bans")
