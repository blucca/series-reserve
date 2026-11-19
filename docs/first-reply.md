# Protect a shared reserve before the opponent replies

This fictional drill reuses Reserve’s complete ten-player practice plan. The series is tied 1–1 before Game 3, global Hard Fearless continues through Game 5, and Ember is assumed to pick first. Glow’s remaining support pool is **Rell, Alistar, Braum**. Tide can also select Rell.

Both Ember first picks initially allocate **30/30**. Their worst Ember capacity over every available Tide first reply in the declared pools differs:

| Ember first pick | Before reply: joint | After reply: worst Ember capacity |
| --- | ---: | ---: |
| Rell | 30/30 | 15/15 |
| Alistar | 30/30 | 14/15 |

Representative replies:

| Ember locks first | Tide’s first reply | Joint capacity | Glow’s future reserve |
| --- | --- | ---: | --- |
| Rell | Thresh | 30/30 | Alistar + Braum for Games 4–5 |
| Alistar | Rell | 29/30 | Braum for two Games 4–5 slots; shortage 1 |
| Alistar | Thresh | 30/30 | Rell + Braum for Games 4–5 |

![The live fictional workspace shows Glow’s Game-4 and Game-5 slots sharing only Braum after Alistar then Tide Rell.](first-reply.png)

Locking Rell also removes Rell from Tide’s available replies. The script enumerates every currently available Tide player/champion binding for these two Ember picks; each reply is an unweighted possibility.

## Run the study

From a clone of [Reserve](https://github.com/blucca/series-reserve):

```sh
node docs/first-reply.mjs
```

The script reads only the bundled fictional `demo.json` and existing `lib/engine.js`. One grouped assertion checks the original control, both first picks, all available first replies and the future-slot certificate. Its output separates joint capacity and Ember’s team capacity.

## Coach walk-through in the existing workspace

1. Open [the workspace](https://blucca.github.io/series-reserve/) and its fictional example (`demo.json`). Start with no locked current picks. Assume Ember picks first.
2. On **Reserve board**, expand **Game 3 actual draft**. Set **Glow / Support** to **Rell**, keep the other players **Not locked**, and click **Save current draft**.
3. Select **Tide takes Thresh**. Capacity stays **30/30**; Glow has Alistar and Braum for Games 4–5. Rell is already reserved, so **Tide takes Rell** is a conflicting comparison.
4. Click **Undo** to restore the unlocked preparation.
5. In **Game 3 actual draft**, set **Glow / Support** to **Alistar** and click **Save current draft**.
6. Select **Tide takes Rell**. Inspect the Hall certificate: **Glow / Game 4 and Game 5**, **Braum**, **shortage 1**. The current Alistar slot is already filled; the shortage concerns Glow’s future turns. Switching to **Tide takes Thresh** restores **30/30**.
7. Click **Undo** to restore the unlocked preparation. Save the JSON and coach notes if retaining the drill.

The output is champion capacity under explicit pools and fixed player bindings, through the opponent’s **first single-pick reply**. Coaches supply tactical priorities, plausible replies and revised playable pools. Attribute each shortage to its affected team: pressure on the opponent and damage to our reserve have different decision value.

## Why test a reply?

In a [five-region coaching interview](https://dotesports.com/league-of-legends/news/coaches-from-five-regions-explain-how-fearless-draft-transformed-lol-esports), Goldenglue described teams prioritizing the opponent’s best picks; Rodrigo described preparation around combinations and answers. The article was published on 16 March 2026 from interviews at Worlds 2025. This drill tests one concrete reserve interaction.

A complete allocation is a jointly available arrangement. The next reply can consume a champion used by that arrangement. Here, taking the shared champion first protects Ember’s declared reserve through the first reply. Later picks, second replies, bans, flex assignments and matchup quality form the coach’s next preparation state.
