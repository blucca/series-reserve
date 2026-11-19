// Fictional no-reset Game-3 drill: Ember first, then one reply or Tide's two-pick turn.
// Unchanged demo pools; fixed bindings and consecutive picks with no intervening action.
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
  for (const team of plan.teams) {
    const side = result.slots.filter(s => s.team === team.id), ids = new Set(side.map(s => s.id));
    const bound = allocate(Object.fromEntries(side.map(s => [s.id, s.available.map(resource)])),
      {forced: Object.fromEntries(Object.entries(forced).filter(([id]) => ids.has(id)))});
    teamCapacity[team.id] = {filled: bound.filled, required: bound.required};
  }
  return {replies, joint: short(result), teamCapacity};
}
const base = analyze(plan), rows = [];
for (const champion of ['Rell', 'Alistar']) {
  const firstPlan = {...plan, current: {...plan.current, picks: {'ember-support': champion}}};
  const first = analyze(firstPlan);
  const candidates = first.slots.filter(s => s.team === 'tide' && s.game === first.currentGame)
    .flatMap(s => s.available.map(champion => ({player: s.player, champion})));
  const replies = candidates.map(r => evaluate(firstPlan, [r])), pairs = [];
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const a = candidates[i], b = candidates[j];
    if (a.player !== b.player && championKey(a.champion) !== championKey(b.champion)) pairs.push(evaluate(firstPlan, [a, b]));
  }
  rows.push({ourPick: champion, first: short(first), replies, pairs});
}
const protectedRow = rows.find(r => r.ourPick === 'Rell'), vulnerableRow = rows.find(r => r.ourPick === 'Alistar');
const damage = vulnerableRow.replies.find(r => r.replies[0].player === 'tide-support' && r.replies[0].champion === 'Rell');
const control = vulnerableRow.replies.find(r => r.replies[0].player === 'tide-support' && r.replies[0].champion === 'Thresh');
const fullDamage = vulnerableRow.pairs.find(r => r.replies.some(p => p.player === 'tide-support' && p.champion === 'Rell')
  && r.replies.some(p => p.player === 'tide-top' && p.champion === 'Renekton'));
const worstOwn = states => Math.min(...states.map(r => r.teamCapacity.ember.filled));
const worstJoint = states => Math.min(...states.map(r => r.joint.filled));
// One grouped gate retains the published first-reply controls and adds the complete immediate turn.
assert(plan.players.length === 10 && plan.rules.mode === 'hard-global' && !plan.rules.resetFinal && base.filled === 30 &&
  analyze(plan, plan.branches.find(b => b.id === 'deny-rell')).filled === 29 && statesEqual && rows.every(r => r.first.filled === 30) &&
  protectedRow.replies.every(r => r.joint.filled === 30) && worstOwn(protectedRow.replies) === 15 && worstOwn(vulnerableRow.replies) === 14 &&
  damage.joint.filled === 29 && damage.teamCapacity.tide.filled === 15 && control.joint.filled === 30 &&
  same(damage.joint.bottleneck.slots, ['ember-support/g4', 'ember-support/g5']) &&
  same(damage.joint.bottleneck.options, ['Braum']) && damage.joint.bottleneck.shortfall === 1 &&
  protectedRow.pairs.every(r => r.joint.filled === 30) && worstOwn(protectedRow.pairs) === 15 &&
  worstOwn(vulnerableRow.pairs) === 14 && worstJoint(vulnerableRow.pairs) === 29 &&
  same(fullDamage.joint, damage.joint) && fullDamage.teamCapacity.ember.filled === 14 && fullDamage.teamCapacity.tide.filled === 15,
  'Fictional first-reply/full-immediate-turn study failed.');
console.log(JSON.stringify({status: 'PASS', scope: 'Fictional fixed pools: Ember first, one reply or complete consecutive two-pick Tide turn.',
  actions: rows.map(r => ({ourPick: r.ourPick, firstJointFilled: r.first.filled,
    firstReplyWorstOwnFilled: worstOwn(r.replies), twoPickTurnWorstOwnFilled: worstOwn(r.pairs),
    twoPickTurnWorstJointFilled: worstJoint(r.pairs), availableReplyBindings: r.replies.length, availableUnorderedPairs: r.pairs.length})),
  damage: fullDamage.joint, interpretation: 'Team bounds relax other free future demands; state counts are unweighted possibilities.'}, null, 2));
