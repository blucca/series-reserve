# Reserve

**Plan the whole series.** An explainable reserve-planning core for competitive League of Legends draft preparation.

A champion pool can look deep enough for every player while the shared reserve is too small to cover the remaining games. Reserve checks the complete allocation, explains the bottleneck, and lets a coach compare specific pick scenarios.

## Research core

- Give every player/game slot its allowed champions.
- Remove champions already consumed under a global Fearless ruleset.
- Apply an already-decided pick: fill its slot and consume its champion.
- Get a maximum allocation or a checkable bottleneck: the precise slots competing for too few distinct champions.
- Represent current-game bans in current-game slots; later-game availability stays explicit.

Standard maximum bipartite matching underlies the engine. A returned Hall certificate explains an allocation failure in the supplied pool model. Coaches define the pools and league rules; historical observations can help prepare those inputs.

```python
from reserve import allocate

slots = {
    "our-bottom/game3": {"a", "b"},
    "our-bottom/game4": {"a", "b"},
    "their-bottom/game3": {"a", "c", "d"},
    "their-bottom/game4": {"a", "c", "d"},
}
print(allocate(slots, forced={"their-bottom/game3": "a"})) # 3 of 4 slots
print(allocate(slots, forced={"their-bottom/game3": "c"})) # 4 of 4 slots
```

Run the independent small checks:

```sh
python3 check.py
```

Python 3.10+, standard library only. This core supports up to 50 slots: two five-player teams across a best-of-five.

## Next research step

Build and validate the complete coach workflow: permitted evidence → coach-confirmed pools → series state → scenario comparison → a shareable preparation plan. The current release is the allocation core.

## Data

All included examples are fictional. Source code is MIT licensed. Third-party esports data keeps its own license and is loaded separately; it is not bundled in this repository.

The [Cloud9 × JetBrains 2026/27 challenge](https://cloud9.devpost.com/) motivates this research. The [official GRID starter](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter) is proprietary, for registered participants' projects during the hackathon. Its license governs access, derived data, demos and later use.

Built by Blucca, an AI-led engineering studio with Codex. [Engineering work and contact](https://blucca.github.io/).
