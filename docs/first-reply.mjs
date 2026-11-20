// Fictional no-reset Game-3 drill: Ember first, then one reply or Tide's two-pick turn.
// Original demo pools, plus one assumed stage-ready Glow extra at a time.
// Fixed bindings and consecutive picks with no intervening action; future trees excluded.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {analyze, allocate, championKey} from '../lib/engine.js';

const demo = JSON.parse(readFileSync(new URL('../demo.json', import.meta.url), 'utf8'));
const plan = {...demo, current: {...demo.current, picks: {}}};
const resource = c => JSON.stringify([0, championKey(c)]);
const short = r => ({filled: r.filled, required: r.required, bottleneck: r.bottleneck});
const consumed = plan.games.flatMap(g => Object.values(g.picks).map(resource));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let statesEqual = true;
function evaluate(firstPlan, replies) {
  const picks = {...firstPlan.current.picks, ...Object.fromEntries(replies.map(r => [r.player, r.champion]))};
  const locked = {...firstPlan, current: {...firstPlan.current, picks}};
  const prefix = {...firstPlan, current: {...firstPlan.current, picks: {...firstPlan.current.picks,
    ...Object.fromEntries(replies.slice(0, -1).map(r => [r.player, r.champion]))}}};
  const result = analyze(locked), compared = analyze(prefix, replies.at(-1));
  const graph = Object.fromEntries(result.slots.map(s => [s.id, s.pool.map(resource)]));
  const forced = Object.fromEntries(Object.entries(picks).map(([id, c]) => [`${id}/g${result.currentGame}`, resource(c)]));
  const core = allocate(graph, {forced, consumed});
  statesEqual &&= same(short(compared), short(result)) && core.filled === result.filled && core.required === result.required
    && Object.keys(picks).length === replies.length + 1 && new Set(Object.values(picks).map(championKey)).size === replies.length + 1;
  const teamCapacity = {};
  for (const team of firstPlan.teams) {
    const side = result.slots.filter(s => s.team === team.id), ids = new Set(side.map(s => s.id));
    const bound = allocate(Object.fromEntries(side.map(s => [s.id, s.available.map(resource)])),
      {forced: Object.fromEntries(Object.entries(forced).filter(([id]) => ids.has(id)))});
    teamCapacity[team.id] = {filled: bound.filled, required: bound.required};
  }
  return {replies, joint: short(result), teamCapacity};
}
function study(firstPlan) {
  const first = analyze(firstPlan);
  const candidates = first.slots.filter(s => s.team === 'tide' && s.game === first.currentGame)
    .flatMap(s => s.available.map(champion => ({player: s.player, champion})));
  const replies = candidates.map(r => evaluate(firstPlan, [r])), pairs = [];
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const a = candidates[i], b = candidates[j];
    if (a.player !== b.player && championKey(a.champion) !== championKey(b.champion)) pairs.push(evaluate(firstPlan, [a, b]));
  }
  return {ourPick: firstPlan.current.picks['ember-support'], first: short(first), replies, pairs};
}
const base = analyze(plan), rows = ['Rell', 'Alistar'].map(champion =>
  study({...plan, current: {...plan.current, picks: {'ember-support': champion}}}));
const extras = ['Thresh', 'Poppy'].map(extra => ({extra, ...study({...plan,
  players: plan.players.map(p => p.id === 'ember-support' ? {...p, pool: [...p.pool, extra]} : p),
  current: {...plan.current, picks: {'ember-support': 'Alistar'}}})}));
const protectedRow = rows.find(r => r.ourPick === 'Rell'), vulnerableRow = rows.find(r => r.ourPick === 'Alistar');
const damage = vulnerableRow.replies.find(r => r.replies[0].player === 'tide-support' && r.replies[0].champion === 'Rell');
const control = vulnerableRow.replies.find(r => r.replies[0].player === 'tide-support' && r.replies[0].champion === 'Thresh');
const fullDamage = vulnerableRow.pairs.find(r => r.replies.some(p => p.player === 'tide-support' && p.champion === 'Rell')
  && r.replies.some(p => p.player === 'tide-top' && p.champion === 'Renekton'));
const worstOwn = states => Math.min(...states.map(r => r.teamCapacity.ember.filled));
const worstJoint = states => Math.min(...states.map(r => r.joint.filled));
const ownShortages = states => states.filter(r => r.teamCapacity.ember.filled < 15).length;
const [thresh, poppy] = extras;
const poppySingle = poppy.replies.find(r => r.replies[0].player === 'tide-support' && r.replies[0].champion === 'Rell');
const poppyDouble = poppy.pairs.find(r => r.replies.some(p => p.player === 'tide-support' && p.champion === 'Rell')
  && r.replies.some(p => p.player === 'tide-jungle' && p.champion === 'Poppy'));
// One grouped gate retains the published controls and checks both added pool conditions.
assert(plan.players.length === 10 && plan.rules.mode === 'hard-global' && !plan.rules.resetFinal && base.filled === 30 &&
  analyze(plan, plan.branches.find(b => b.id === 'deny-rell')).filled === 29 && statesEqual && rows.every(r => r.first.filled === 30) &&
  protectedRow.replies.every(r => r.joint.filled === 30) && worstOwn(protectedRow.replies) === 15 && worstOwn(vulnerableRow.replies) === 14 &&
  damage.joint.filled === 29 && damage.teamCapacity.tide.filled === 15 && control.joint.filled === 30 &&
  same(damage.joint.bottleneck.slots, ['ember-support/g4', 'ember-support/g5']) &&
  same(damage.joint.bottleneck.options, ['Braum']) && damage.joint.bottleneck.shortfall === 1 &&
  protectedRow.pairs.every(r => r.joint.filled === 30) && worstOwn(protectedRow.pairs) === 15 &&
  worstOwn(vulnerableRow.pairs) === 14 && worstJoint(vulnerableRow.pairs) === 29 &&
  same(fullDamage.joint, damage.joint) && fullDamage.teamCapacity.ember.filled === 14 && fullDamage.teamCapacity.tide.filled === 15 &&
  extras.every(r => r.first.filled === 30 && r.replies.length === 16 && r.pairs.length === 102) && ownShortages(vulnerableRow.pairs) === 12 &&
  thresh.pairs.every(r => r.joint.filled === 30 && r.teamCapacity.ember.filled === 15) && ownShortages(poppy.pairs) === 1 &&
  poppy.pairs.filter(r => r.teamCapacity.ember.filled === 15 && r.joint.filled === 29).length === 11 &&
  poppySingle.joint.filled === 29 && poppySingle.teamCapacity.ember.filled === 15 && poppySingle.teamCapacity.tide.filled === 15 &&
  same(poppySingle.joint.bottleneck.slots, ['ember-support/g4', 'ember-support/g5', 'tide-jungle/g3', 'tide-jungle/g4', 'tide-jungle/g5']) &&
  same(poppySingle.joint.bottleneck.options, ['Braum', 'Maokai', 'Nocturne', 'Poppy']) &&
  same(poppyDouble.joint, damage.joint) && poppyDouble.teamCapacity.ember.filled === 14,
  'Fictional first-reply/full-turn/pool-repair study failed.');
console.log(JSON.stringify({status: 'PASS', scope: 'Fictional declared pools: Ember first, one reply or complete consecutive two-pick Tide turn; extras assumed stage-ready for Glow.',
  actions: rows.map(r => ({ourPick: r.ourPick, firstJointFilled: r.first.filled,
    firstReplyWorstOwnFilled: worstOwn(r.replies), twoPickTurnWorstOwnFilled: worstOwn(r.pairs),
    twoPickTurnWorstJointFilled: worstJoint(r.pairs), availableReplyBindings: r.replies.length, availableUnorderedPairs: r.pairs.length})),
  poolRepairs: [vulnerableRow, ...extras].map(r => ({extra: r.extra ?? null, ourPick: r.ourPick,
    availableUnorderedPairs: r.pairs.length, ownShortageStates: ownShortages(r.pairs),
    jointShortageWithFullOwnStates: r.pairs.filter(s => s.joint.filled < 30 && s.teamCapacity.ember.filled === 15).length,
    twoPickTurnWorstOwnFilled: worstOwn(r.pairs), twoPickTurnWorstJointFilled: worstJoint(r.pairs)})),
  damage: fullDamage.joint, poppySingleReply: {joint: poppySingle.joint, teamCapacity: poppySingle.teamCapacity},
  interpretation: 'Team bounds relax other free future demands; state counts are unweighted possibilities.'}, null, 2));
