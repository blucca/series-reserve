# Building Reserve with Codex and PyCharm

[Try Reserve](https://blucca.github.io/series-reserve/) · [Watch the real demo](https://blucca.github.io/series-reserve/demo.html) · [Method and checks](method.md)

A coaching spreadsheet can show enough champions for each player while the two teams share too few options for the remaining Fearless games. Reserve turns that interaction into a whole-series preparation: explicit pools, a recorded draft, a checkable allocation or shortage, and a saved handoff.

## Make the mechanism testable

Codex helped implement independent Python and browser engines. A chosen pick fills its player/game slot and consumes the same champion from the other slots in that shared reserve. An alternating-path search explains a shortage as the precise slots sharing too few options.

We checked all 64 small three-slot graphs against a separately written exhaustive assignment oracle, including every returned edge and the certificate's complete neighbor set. The fictional practice plan makes the mechanism tangible: Rell leaves three opposing support turns sharing only Alistar and Braum; Thresh preserves a 30/30 allocation.

## Read the source before designing its adapter

AI-assisted schema inspection surfaced two important input decisions: the native starter leaves player roles empty, and current draft events identify a team rather than a final player assignment. The adapter uses final bindings only for completed games; the coach assigns current picks and roles. Historical pool evidence uses an explicit cutoff, and the preparation view stops at the known draft prefix.

One separately licensed LCS-series experiment uses the same public adapter and browser engine. With stated observation-derived pools and the official league rule, its branch comparison also produces 29/30 versus 30/30. Those licensed records stay outside the public project. Every bundled example is fictional.

## Ask who controls the next pick

A joint allocation can hide a choice that the opponent would actively disrupt. The [first-reply study](first-reply.md) locks our pick before comparing their reply and reads which team owns the shortage. Both fictional first picks initially show 30/30; only one protects Ember’s reserve through all available first replies. Codex helped enumerate the bounded choices with the existing engine, preserving the coach’s control of pools, player binding and tactical quality.

## Use the IDE in the actual development loop

JetBrains **PyCharm 2026.3.0.1** inspected `reserve.py`, `grid_plan.py` and `check.py` with the project's Python 3.12 interpreter and a saved correctness profile. We reviewed its optional-value, dictionary-member and naming findings alongside the runnable controls. Optional values have explicit guards; the adapter's dynamic list fields are exercised by the complete preparation check. PyCharm completed the inspection and exported its diagnostic XML.

## Validate the handoff, not just the solver

Codex also helped automate a real Chromium preparation: import CSV, review and confirm a pool, compare and lock a pick, record games, save JSON, export Markdown and reopen the complete plan. The saved JSON round-trip is equal. The public demo records real browser actions with fictional inputs and synthesized narration.

AI accelerated implementation and repeatable checking. The finished workspace keeps the consequential choices explicit: the coach's playable pools, rule, draft state and tactical judgment.
