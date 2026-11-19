// Independent tiny-graph oracle plus the complete fictional preparation task.
// No test framework or licensed data is needed: node check.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allocate, analyze, validatePlan, handoff } from './lib/engine.js';
import { parseEvidenceCSV, observations } from './lib/evidence.js';

function brute(pools, i = 0, used = new Set()) {
  if (i === pools.length) return 0;
  return Math.max(brute(pools, i + 1, used), ...pools[i].filter(c => !used.has(c))
    .map(c => 1 + brute(pools, i + 1, new Set([...used, c]))));
}
const options = [[], ['x'], ['y'], ['x', 'y']];
for (const a of options) for (const b of options) for (const c of options) {
  const pools = [a, b, c], graph = Object.fromEntries(pools.map((cs, i) => [String(i), cs]));
  const r = allocate(graph);
  assert.equal(r.filled, brute(pools));
  assert.equal(new Set(Object.values(r.matching)).size, r.filled);
  for (const [s, champ] of Object.entries(r.matching)) assert(graph[s].includes(champ));
  if (r.bottleneck) {
    const neighbors = new Set(r.bottleneck.slots.flatMap(s => graph[s]));
    assert.deepEqual(new Set(r.bottleneck.options), neighbors);
    assert.equal(r.bottleneck.shortfall, r.bottleneck.slots.length - neighbors.size);
    assert(r.bottleneck.shortfall > 0);
  }
}
assert.throws(() => allocate({ a: ['x'], b: ['x'] }, { forced: { a: 'x', b: 'x' } }), /same champion/);

const plan = JSON.parse(readFileSync(new URL('./demo.json', import.meta.url), 'utf8'));
const p = () => structuredClone(plan);
validatePlan(plan);
const base = analyze(plan), denied = analyze(plan, plan.branches[0]), control = analyze(plan, plan.branches[1]);
assert.equal(base.filled, 30); assert.equal(base.required, 30);
assert.equal(denied.filled, 29); assert.equal(control.filled, 30);
assert.deepEqual(denied.bottleneck.slots, ['ember-support/g3', 'ember-support/g4', 'ember-support/g5']);
assert.deepEqual(denied.bottleneck.options, ['Alistar', 'Braum']);
assert.equal(denied.matching['tide-support/g3'], 'Rell');
assert(!denied.slots.find(s => s.id === 'ember-support/g4').available.includes('Rell'));
assert.equal(analyze({ ...p(), rules: { ...plan.rules, resetFinal: true } }, plan.branches[0]).filled, 30);

const banned = p(); banned.current.bans = ['Rell'];
const br = analyze(banned);
assert.equal(br.filled, 30);
assert(!br.slots.find(s => s.id === 'ember-support/g3').pool.includes('Rell'));
assert(br.slots.find(s => s.id === 'ember-support/g4').pool.includes('Rell'));
assert.throws(() => analyze(banned, plan.branches[0]), /conflicts/);
const locked = p(); locked.current.picks['tide-support'] = 'Rell';
assert.equal(analyze(locked).filled, 29);
assert.equal(analyze(locked, plan.branches[1]).filled, 30); // alternative, not an additional lock
assert.equal(locked.current.picks['tide-support'], 'Rell'); // branch is non-mutating
const spelling = p(); spelling.players.find(x => x.id === 'tide-support').pool[2] = 'RELL';
const spellingBefore = JSON.stringify(spelling);
assert.equal(analyze(spelling, { player: 'tide-support', champion: 'rell' }).filled, 29);
assert.equal(JSON.stringify(spelling), spellingBefore); // preserve raw source/display spellings
spelling.current.bans = [' r e l l '];
assert.throws(() => analyze(spelling, { player: 'tide-support', champion: 'Rell' }), /conflicts/);
const aliasDup = p(); aliasDup.players[0].pool.push('G N A R');
assert.throws(() => validatePlan(aliasDup), /spelling variants/);

const proposed = p(); proposed.players[0].confirmed = false;
assert.equal(analyze(proposed).ready, false);
assert.deepEqual(analyze(proposed).needsConfirmation, ['Ash’s pool']);
proposed.players[0].pool = []; proposed.players[0].confirmed = true;
assert.equal(analyze(proposed).bottleneck.shortfall, 3);
const duplicate = p(); duplicate.games[1].picks['ember-top'] = 'Gnar';
assert.throws(() => validatePlan(duplicate), /already picked/);
const short = p(); short.bestOf = 3;
assert.equal(analyze(short).required, 10);
const complete = p();
for (const number of [3, 4]) complete.games.push({ number, winner: 'ember', bans: [],
  picks: Object.fromEntries(complete.players.map(x => [x.id, base.matching[`${x.id}/g${number}`]])) });
const done = analyze(complete);
assert(done.finished); assert.equal(done.required, 0);

const csv = readFileSync(new URL('./demo-evidence.csv', import.meta.url), 'utf8');
assert.deepEqual(parseEvidenceCSV(csv), plan.evidence);
const obs = observations(plan);
assert.equal(obs.included, plan.evidence.length);
assert.equal(obs.unmatched, 0);
assert.equal(obs.byPlayer['ember-support'].find(x => x.champion === 'Rell').games, 3);
const time = p(); time.asOf = plan.evidence[0].playedAt;
assert.equal(observations(time).included, 0); // strict cutoff, no at-cutoff inclusion
const dup = p(); dup.evidence.push({ ...dup.evidence[0] });
assert.equal(observations(dup).included, plan.evidence.length);
assert.equal(observations(dup).excluded, 1);
dup.evidence.at(-1).champion = 'Other';
assert.throws(() => observations(dup), /two different champions/);
const patch = p(); patch.evidencePolicy.patch = 'other';
assert.equal(observations(patch).included, 0);
const unknown = p(); unknown.evidence.push({ ...unknown.evidence[0], gameId: 'unknown', player: 'unknown' });
assert.equal(observations(unknown).unmatched, 1);
const transfer = p(); transfer.evidence[0].team = 'former-team';
assert.equal(observations(transfer).included, plan.evidence.length); // stable IDs survive team changes
const aliasObs = p(); aliasObs.evidence[1].champion = 'G N A R';
assert.equal(observations(aliasObs).byPlayer['ember-top'].find(x => x.champion === 'Gnar').games, 3);
const quoted = 'game_id,played_at,team,player,champion,source\r\ng,2026-10-01T00:00:00Z,ember,ember-support,"A, B","One ""quote""\nnext"\r\n';
assert.equal(parseEvidenceCSV(quoted)[0].champion, 'A, B');
assert.equal(parseEvidenceCSV(quoted)[0].source, 'One "quote"\nnext');
assert.throws(() => parseEvidenceCSV('game_id,player\ng,p'), /Add these CSV columns/);
assert.throws(() => parseEvidenceCSV(quoted.slice(0, -3)), /missing its closing quote/);
assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(plan))), plan);
const md = handoff(plan);
assert(md.includes('29/30')); assert(md.includes('30/30'));
assert(md.includes('Game 5')); assert(!md.includes(plan.evidence[0].gameId));
console.log('PASS: 64 independent graph controls; full evidence → pools → series → branch → saved handoff task; cutoff, bans, no/reset-final rules and clinch.');
