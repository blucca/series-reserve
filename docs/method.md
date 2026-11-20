# Reserve: from evidence to a whole-series preparation

## The preparation decision

Suppose a player needs three more games and has three usable champions left. That reserve is exact. An opposing player selecting one of those champions under global Hard Fearless leaves two champions for three turns.

Reserve checks this interaction across all ten player slots and every remaining game, then saves the state and comparisons for the next person preparing the series.

## Inputs and responsibilities

A saved plan records:

- Two five-player lineups with stable IDs and coach-assigned roles.
- A time cutoff, optional patch filter, evidence sources and distinct observed player/game picks.
- Explicit playable pools, separately marked as proposed or coach-confirmed.
- The best-of length, global Hard Fearless rule, any final-game reset and its source or stated assumption.
- Completed games, winners and picked champions; current-game bans and locked picks.
- Named counterfactual current picks and coach notes.

Evidence supports a proposed pool. The analyst or coach accepts and edits that pool, including the opponent assumptions. Changing a filter preserves confirmed pools. Stable player IDs retain relevant observations across roster changes; display-name matching uses the team to disambiguate players.

Game-start pick timestamps are useful when the completed draft was known at that time. The CSV cutoff uses the supplied source timestamps, strictly earlier than the preparation cutoff. A missing champion supplies no pick evidence.

The native starter’s player role arrays are empty. Its draft events identify the selecting team, while played-game state identifies the final player/champion binding. Reserve uses completed-game bindings for history and requires a coach binding for current team-level picks; roles stay explicit.

## Build the remaining series

The board covers the longest possible remaining series, ending when a team has already clinched. Each future player/game slot gets its declared pool.

1. Previously picked champions leave both teams’ remaining reserve under global Hard Fearless.
2. Current bans leave only current-game slots. Future bans remain a coach scenario, outside the observed prefix.
3. A locked or compared pick fills its current slot **and** consumes its champion from other slots in that shared reserve.
4. An explicit final-game reset creates a separate reserve for the final draft.

Branches compare capacity at the saved prefix. Live next-action preparation uses the actual selecting team and all intervening picks and bans; current player bindings remain the coach’s explicit choice.

For the 2026 LCS, [Riot’s Rulebook v2.2](https://cdn.sanity.io/files/dsfx7636/news_live/0064217ac83ff739c294fd98b1a20caf094a4688.pdf), §9.4, applies Fearless to both teams for the whole match, including Game 5. It describes 40 Fearless-exhausted champions plus 10 standard bans in Game 5. §9.4.1 makes standard bans available again in later games unless consumed by Fearless. The [official library](https://competitiveops.riotgames.com/library?GAME=lol&LEAGUE=LCS) lists that version.

## Exact allocation and explanation

The engine builds a bipartite graph: player/game slots on one side, available champion reserves on the other. Maximum matching returns one allocation. The supported size is at most 50 slots: two five-player teams across a best-of-five.

When the remaining graph has unmatched slots, alternating reachability constructs a Hall certificate:

- **S**: the specific free player/game slots that compete for capacity.
- **N(S)**: their distinct remaining champion reserves.
- **Shortage**: `|S| − |N(S)|`, a positive number.

Every option shown in the certificate belongs to those slots after the known picks and bans. A successful allocation demonstrates enough distinct champion capacity in this model. Its ordering is deterministic for inspection, with tactical quality left to the coach.

The generic Python and JavaScript matching cores use exact string IDs. The browser’s champion-name wrapper joins spacing, case and apostrophe variants while preserving source/display labels. Semantic aliases require explicit source mapping.

## Prepare against a reply

A full allocation supplies one jointly available arrangement. A coach can first lock our candidate, then compare a specific opponent reply against the resulting state. Attribute each shortage to its affected team/player: pressure on the opponent and damage to our reserve have different decision value.

The [complete fictional first-reply drill](first-reply.md) compares Ember support Rell and Alistar. Both start at 30/30. Rell first preserves 15/15 Ember capacity through every available Tide first reply; Alistar followed by Tide Rell leaves 14/15, with Games 4–5 sharing Braum. The [runnable study](first-reply.mjs) uses the same engine and unchanged demo pools for that comparison. Its team bounds relax the other team’s free future demands. The bounded study also checks the complete immediate consecutive two-pick turn under the same fixed bindings, preserving that distinction. The coach supplies tactical candidates and the next draft state.

A pool-repair extension keeps Alistar first and compares three fixed declared pool conditions, assuming Glow’s Thresh or Poppy extra is stage-ready and coach-approved for the fictional exercise. All conditions have 102 legal complete immediate consecutive two-pick states. Thresh preserves joint 30/30 throughout; Poppy reduces Ember-shortage states from 12 to one, plus 11 states with Ember 15/15 and joint 29/30. Counts are unweighted possibilities. The existing pool editor, confirmation and current-draft locks expose the joint certificates; later games, actions and bans use the coach’s updated preparation.

## Validation

### Independent small controls

Both cores check all **64 three-slot graphs over two champions** against a separately written exhaustive assignment oracle. The tests also verify every returned edge, champion uniqueness and the certificate’s complete neighbor set and shortage.

Series and evidence controls cover consumed picks, forced picks, current-game-only bans, no-reset and final-reset rules, BO3/BO5, series completion, unconfirmed and empty pools, strictly earlier evidence, duplicates, contradictory rows, spelling variants, cross-team stable IDs and saved JSON/handoff.

### One complete fictional coach task

The public practice plan has two completed games tied 1–1. Ember’s support needs Rell, Alistar and Braum for its three remaining turns; Tide has additional support options.

| Current comparison | Remaining slots filled | Certificate |
| --- | ---: | --- |
| Base preparation | 30/30 | Complete allocation |
| Tide selects Rell | 29/30 | Three Ember support turns share Alistar and Braum |
| Tide selects Thresh | 30/30 | Complete allocation |

A real Chromium walkthrough imports 153 fictional observations, proposes and confirms a pool, edits a pool and restores it with Undo, applies a current ban, compares and locks a pick, edits names/roles, records and removes a completed game, downloads JSON and Markdown, and reloads the entire preparation. The saved JSON round-trip is equal; Markdown carries the preparation and certificates without raw evidence rows. Desktop and mobile controls work with no third-party requests or application dependencies.

### One separately licensed native series

A registered-participant experiment uses the **Cloud9 vs LYON, 3 October 2026 LCS Split 3 Playoffs** series from the pinned official GRID starter. Its feed has **80 unique draft events**, 40 picks and 40 standard bans across four completed games, with each game’s draft actions numbered 1–20.

The Game-3 first-pick preparation view uses **20 previous picks and six already observed current bans**. The four later current bans and all future-game bans stay outside that view. Historical pools use **1,074 nonempty pick observations** at actual game-start timestamps before the pre-series cutoff, with at least three observations per proposed champion. Two additional historical roster rows have empty champions and supply no pick evidence.

The public adapter and browser engine produce **30/30** at baseline, **29/30** for a shared-champion opponent choice and **30/30** for a control choice. The shortfall certificate has three player/game slots and two remaining champion reserves. A currently banned champion returns to a future-game pool. Saving, reloading and exporting the native preparation also pass.

A follow-up checks the actual first-pick team followed by the opponent’s first single reply and complete consecutive two-pick turn under the same pool and binding assumptions. Initially full first choices differ in their reply-induced reserve vulnerability; complete native tables stay private.

This result applies to the explicit observation-derived pool hypothesis, official league rule and known draft prefix. The native experiment’s pool approval is a research assumption. Professional use adds the coach’s own pools, role assignments and preparation decisions.

No native rows, player profiles, indexes, feeds or derived plans are bundled or published. The long-lived workspace uses fictional examples and users’ own permitted inputs.

## Development tools

Codex implements the source and browser workflow. **JetBrains PyCharm 2026.3.0.1** (PY-263.7307.329) performs project code inspection of `reserve.py`, `grid_plan.py` and `check.py` using the project’s Python 3.12 interpreter and a saved correctness profile. We review its optional-value, dynamic-dictionary and naming findings alongside the independent matching controls and native preparation task. The IDE inspection completes and exports its diagnostic XML; source changes and runnable checks remain in the public repository.

The development workflow keeps licensed records outside the source project, separates observation-derived pools from coach approval, and uses the same public engine for the synthetic workspace and private native validation.
