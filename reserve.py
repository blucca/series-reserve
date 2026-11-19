"""Exact, explainable allocation of a shared champion reserve across draft slots."""
from collections import deque


def allocate(slots, *, forced=None, consumed=()):
    """Return a maximum allocation and a Hall bottleneck when slots cannot all fit.

    Each slot has its own allowed champions. Current-game bans belong only in
    that game's slot sets; previous picks go in `consumed`. `forced` maps already
    decided slots to champions, so a choice fills a slot AND consumes capacity.
    """
    # Two five-player teams over a best-of-five: at most 50 slots. A larger
    # tournament-wide planner should switch to Hopcroft–Karp, not raise this cap.
    if len(slots) > 50:
        raise ValueError("This series core supports at most 50 draft slots")
    pools = {}
    for slot, champions in slots.items():
        if not isinstance(slot, str) or isinstance(champions, str):
            raise ValueError("Use string slot IDs and a collection of champion IDs")
        pool = set(champions)
        if any(not isinstance(c, str) or not c for c in pool):
            raise ValueError("Champion IDs must be nonempty strings")
        pools[slot] = pool
    fixed = dict(forced or {})
    used = set(consumed)
    if len(set(fixed.values())) != len(fixed):
        raise ValueError("A champion may fill only one slot")
    for slot, champion in fixed.items():
        if slot not in pools or champion not in pools[slot] or champion in used:
            raise ValueError("A forced choice conflicts with the slot or consumed set")
    blocked = used | set(fixed.values())
    available = {s: pools[s] - blocked for s in sorted(pools) if s not in fixed}
    owner = {}

    def augment(slot, seen):
        for champion in sorted(available[slot]):
            if champion in seen:
                continue
            seen.add(champion)
            if champion not in owner or augment(owner[champion], seen):
                owner[champion] = slot
                return True
        return False

    for slot in available:
        augment(slot, set())
    matching = {**fixed, **{slot: champion for champion, slot in owner.items()}}
    missing = sorted(set(pools) - set(matching))
    bottleneck = None
    if missing:
        # Alternating reachability from unmatched slots gives a verifiable Hall
        # certificate: these free slots have fewer distinct options than needed.
        reached_slots, reached_champions = set(missing), set()
        queue = deque(missing)
        while queue:
            slot = queue.popleft()
            for champion in available[slot]:
                if champion in reached_champions:
                    continue
                reached_champions.add(champion)
                other = owner.get(champion)
                if other is not None and other not in reached_slots:
                    reached_slots.add(other)
                    queue.append(other)
        shortfall = len(reached_slots) - len(reached_champions)
        assert shortfall > 0
        bottleneck = {"slots": sorted(reached_slots),
                      "options": sorted(reached_champions), "shortfall": shortfall}
    return {"feasible": not missing, "filled": len(matching), "required": len(pools),
            "matching": dict(sorted(matching.items())), "bottleneck": bottleneck}
