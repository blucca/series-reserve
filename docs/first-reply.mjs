// Fictional, no-reset Game-3 drill: Ember first, then ONE Tide reply.
// Reuse the bundled pools and existing engine. Extend only for a real coach case.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {analyze, allocate, championKey} from '../lib/engine.js';

const demo = JSON.parse(readFileSync(new URL('../demo.json', import.meta.url), 'utf8'));
const plan = {...demo, current: {...demo.current, picks: {}}};
const resource = c => JSON.stringify([0, championKey(c)]);
const short = r => ({filled: r.filled, required: r.required, bottleneck: r.bottleneck});
const consumed = plan.games.flatMap(g => Object.values(g.picks).map(resource));
const base = analyze(plan), rows = [];
let pairsEqual = true;
for (const champion of ['Rell', 'Alistar']) {
  const firstPlan = {...plan, current: {...plan.current, picks: {'ember-support': champion}}};
  const first = analyze(firstPlan), replies = [];
  for (const slot of first.slots.filter(s => s.team === 'tide' && s.game === first.currentGame)) {
    for (const replyChampion of slot.available) {
      const reply = {player: slot.player, champion: replyChampion};
      const compared = analyze(firstPlan, reply);
      const locked = {...firstPlan, current: {...firstPlan.current,
        picks: {...firstPlan.current.picks, [reply.player]: reply.champion}}};
      const result = analyze(locked);
      const graph = Object.fromEntries(result.slots.map(s => [s.id, s.pool.map(resource)]));
      const forced = Object.fromEntries(Object.entries(locked.current.picks)
        .map(([id, c]) => [`${id}/g${result.currentGame}`, resource(c)]));
      const core = allocate(graph, {forced, consumed});
      pairsEqual &&= JSON.stringify(short(compared)) === JSON.stringify(short(result))
        && core.filled === result.filled && core.required === result.required;
      const teamCapacity = {};
      for (const team of plan.teams) {
        const side = result.slots.filter(s => s.team === team.id), ids = new Set(side.map(s => s.id));
        const bound = allocate(Object.fromEntries(side.map(s => [s.id, s.available.map(resource)])),
          {forced: Object.fromEntries(Object.entries(forced).filter(([id]) => ids.has(id)))});
        teamCapacity[team.id] = {filled: bound.filled, required: bound.required};
      }
      replies.push({reply, joint: short(result), teamCapacity});
    }
  }
  rows.push({ourPick: champion, first: short(first), replies,
    worstOwnFilled: Math.min(...replies.map(r => r.teamCapacity.ember.filled)),
    worstJointFilled: Math.min(...replies.map(r => r.joint.filled))});
}
const protectedRow = rows.find(r => r.ourPick === 'Rell');
const vulnerableRow = rows.find(r => r.ourPick === 'Alistar');
const damage = vulnerableRow.replies.find(r => r.reply.player === 'tide-support' && r.reply.champion === 'Rell');
const control = vulnerableRow.replies.find(r => r.reply.player === 'tide-support' && r.reply.champion === 'Thresh');
// One grouped gate, including the existing demo control; no new test matrix.
assert(plan.players.length === 10 && plan.rules.mode === 'hard-global' && !plan.rules.resetFinal &&
  base.filled === 30 && analyze(plan, plan.branches.find(b => b.id === 'deny-rell')).filled === 29 &&
  pairsEqual && rows.every(r => r.first.filled === 30) && protectedRow.replies.every(r => r.joint.filled === 30) &&
  protectedRow.worstOwnFilled === 15 && vulnerableRow.worstOwnFilled === 14 &&
  damage.joint.filled === 29 && damage.teamCapacity.tide.filled === 15 && control.joint.filled === 30 &&
  JSON.stringify(damage.joint.bottleneck.slots) === JSON.stringify(['ember-support/g4', 'ember-support/g5']) &&
  JSON.stringify(damage.joint.bottleneck.options) === JSON.stringify(['Braum']) && damage.joint.bottleneck.shortfall === 1,
  'Fictional first-reply drill failed.');
console.log(JSON.stringify({status: 'PASS', scope: 'Ember first, one Tide reply; fictional declared pools.',
  actions: rows.map(r => ({ourPick: r.ourPick, firstJointFilled: r.first.filled,
    availableReplyBindings: r.replies.length, worstOwnFilled: r.worstOwnFilled,
    worstJointFilled: r.worstJointFilled})), damage: damage.joint,
  interpretation: 'Team bounds relax the other side’s free future demands; reply counts enumerate possibilities.'}, null, 2));
