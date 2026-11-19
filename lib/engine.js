// A series is small: at most 50 slots. Exact augmenting-path matching keeps
// the witness readable; tournament-wide planning would need another engine.
export function allocate(slots, { forced = {}, consumed = [] } = {}) {
  if (Object.keys(slots).length > 50) throw new Error('A plan supports at most 50 draft slots.');
  const pools = Object.fromEntries(Object.entries(slots).map(([s, cs]) => [s, new Set(cs)]));
  const fixed = { ...forced }, used = new Set(consumed);
  if (new Set(Object.values(fixed)).size !== Object.keys(fixed).length)
    throw new Error('Two locked picks use the same champion reserve.');
  for (const [s, c] of Object.entries(fixed)) {
    if (!pools[s]?.has(c) || used.has(c)) throw new Error('A locked pick conflicts with its pool or a previous pick.');
  }
  const blocked = new Set([...used, ...Object.values(fixed)]);
  const available = Object.fromEntries(Object.keys(pools).sort().filter(s => !(s in fixed))
    .map(s => [s, [...pools[s]].filter(c => !blocked.has(c)).sort()]));
  const owner = new Map();
  function augment(s, seen) {
    for (const c of available[s]) {
      if (seen.has(c)) continue;
      seen.add(c);
      if (!owner.has(c) || augment(owner.get(c), seen)) { owner.set(c, s); return true; }
    }
    return false;
  }
  for (const s of Object.keys(available)) augment(s, new Set());
  const matching = { ...fixed, ...Object.fromEntries([...owner].map(([c, s]) => [s, c])) };
  const missing = Object.keys(pools).filter(s => !(s in matching));
  let bottleneck = null;
  if (missing.length) {
    const reached = new Set(missing), options = new Set(), queue = [...missing];
    for (let i = 0; i < queue.length; i++) {
      for (const c of available[queue[i]]) {
        if (options.has(c)) continue;
        options.add(c);
        if (owner.has(c) && !reached.has(owner.get(c))) { reached.add(owner.get(c)); queue.push(owner.get(c)); }
      }
    }
    bottleneck = { slots: [...reached].sort(), options: [...options].sort(), shortfall: reached.size - options.size };
    if (bottleneck.shortfall <= 0) throw new Error('Allocation certificate failed.');
  }
  return { feasible: missing.length === 0, filled: Object.keys(matching).length,
    required: Object.keys(pools).length, matching, bottleneck };
}

const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const nonempty = x => typeof x === 'string' && x.trim().length > 0;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const segment = (p, game) => p.rules.resetFinal && game === p.bestOf ? 1 : 0;
// Display spellings vary when coaches paste CSV/pools (LeeSin / Lee Sin,
// Kai'Sa / Kai’Sa). Keep raw labels; use one shared identity for allocation.
// Semantic aliases such as MonkeyKing / Wukong require source-name mapping.
export const championKey = champion => champion.normalize('NFKC').toLowerCase().replace(/[\s'’‘._-]/gu, '');
const key = (seg, champion) => JSON.stringify([seg, championKey(champion)]);

function champions(values, label) {
  assert(Array.isArray(values) && values.every(nonempty), `${label}: enter a list of nonempty champion names.`);
  assert(values.every(c => championKey(c).length > 0), `${label}: enter champion names, not punctuation.`);
  assert(new Set(values.map(championKey)).size === values.length, `${label}: remove duplicate champion names, including spelling variants.`);
}

export function validatePlan(p) {
  assert(record(p) && p.format === 'reserve-plan/1', 'Open a Reserve plan saved as reserve-plan/1.');
  assert(nonempty(p.title), 'Give this series a name.');
  assert(typeof p.asOf === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(p.asOf) && Number.isFinite(Date.parse(p.asOf)),
    'Set the evidence cutoff to an ISO date and time with a timezone.');
  assert(p.bestOf === 3 || p.bestOf === 5, 'Choose a best-of-three or best-of-five series.');
  assert(record(p.rules) && p.rules.mode === 'hard-global', 'This planner uses global Hard Fearless: picks leave both teams’ reserve.');
  assert(typeof p.rules.resetFinal === 'boolean' && typeof p.rules.confirmed === 'boolean', 'Set and confirm the final-game rule.');
  assert(typeof p.rules.source === 'string' && (!p.rules.confirmed || nonempty(p.rules.source)), 'Add the league rule source or your explicit planning assumption.');
  assert(Array.isArray(p.teams) && p.teams.length === 2, 'Define two teams.');
  assert(p.teams.every(t => record(t) && nonempty(t.id) && nonempty(t.name)) && new Set(p.teams.map(t => t.id)).size === 2,
    'Each team needs a distinct ID and a name.');
  const teams = new Set(p.teams.map(t => t.id));
  assert(Array.isArray(p.players) && p.players.length === 10, 'Define five player slots for each team.');
  assert(new Set(p.players.map(x => x.id)).size === 10, 'Give each player a distinct stable ID.');
  for (const player of p.players) {
    assert(record(player) && nonempty(player.id) && teams.has(player.team) && nonempty(player.name) && nonempty(player.role),
      'Each player needs an ID, team, name and coach-assigned role.');
    champions(player.pool, `${player.name}’s pool`);
    assert(typeof player.confirmed === 'boolean', `Mark ${player.name}’s pool as proposed or coach-confirmed.`);
  }
  assert(p.teams.every(t => p.players.filter(x => x.team === t.id).length === 5), 'Each team needs five player slots.');
  assert(Array.isArray(p.games) && p.games.length <= p.bestOf, 'Completed games must fit inside this series.');
  const playerIds = new Set(p.players.map(x => x.id));
  function picks(values, complete, bans, label) {
    assert(record(values), `${label}: enter picks as player/champion pairs.`);
    assert(Object.entries(values).every(([id, c]) => playerIds.has(id) && nonempty(c)), `${label}: every pick needs a roster player and champion.`);
    assert(!complete || Object.keys(values).length === 10, `${label}: record all ten picks before completing the game.`);
    assert(new Set(Object.values(values).map(championKey)).size === Object.keys(values).length, `${label}: each champion can be picked once in a game.`);
    champions(bans, `${label} bans`);
    const banned = new Set(bans.map(championKey));
    assert(!Object.values(values).some(c => banned.has(championKey(c))), `${label}: a champion appears as both a pick and a ban.`);
  }
  const wins = Object.fromEntries([...teams].map(t => [t, 0])), used = new Set();
  const target = Math.floor(p.bestOf / 2) + 1;
  for (let i = 0; i < p.games.length; i++) {
    const game = p.games[i];
    assert(record(game) && game.number === i + 1 && teams.has(game.winner), `Game ${i + 1}: set a winner and keep completed games in order.`);
    assert(Math.max(...Object.values(wins)) < target, 'The series was already won; remove games after the clinching game.');
    picks(game.picks, true, game.bans, `Game ${game.number}`);
    for (const c of Object.values(game.picks)) {
      const resource = key(segment(p, game.number), c);
      assert(!used.has(resource), `Game ${game.number}: ${c} was already picked under this Fearless rule.`);
      used.add(resource);
    }
    wins[game.winner]++;
  }
  assert(record(p.current), 'Add the current draft state.');
  picks(p.current.picks, false, p.current.bans, 'Current draft');
  const finished = Math.max(...Object.values(wins)) >= target;
  assert(!finished || (!Object.keys(p.current.picks).length && !p.current.bans.length), 'The series is complete; clear the current draft.');
  const currentGame = p.games.length + 1;
  for (const [id, c] of Object.entries(p.current.picks)) {
    assert(p.players.find(x => x.id === id).pool.some(x => championKey(x) === championKey(c)), `${c} is outside this player’s current pool; edit the pool first.`);
    assert(!used.has(key(segment(p, currentGame), c)), `${c} was already picked under this Fearless rule.`);
  }
  assert(Array.isArray(p.evidence), 'Evidence must be an array of game observations.');
  assert(record(p.evidencePolicy) && Number.isInteger(p.evidencePolicy.minGames) && p.evidencePolicy.minGames >= 1,
    'Set a minimum observed-game count of at least one.');
  assert(typeof p.evidencePolicy.patch === 'string', 'The patch filter must be a string; leave it empty for all patches.');
  assert(Array.isArray(p.branches) && p.branches.every(b => record(b) && nonempty(b.id) && nonempty(b.name) && playerIds.has(b.player) && nonempty(b.champion)),
    'Each comparison needs a name, roster player and champion.');
  assert(typeof p.notes === 'string', 'Plan notes must be text.');
  return p;
}

export function analyze(p, branch = null) {
  validatePlan(p);
  const scores = Object.fromEntries(p.teams.map(t => [t.id, p.games.filter(g => g.winner === t.id).length]));
  const finished = Math.max(...Object.values(scores)) >= Math.floor(p.bestOf / 2) + 1;
  const currentGame = p.games.length + 1;
  const consumed = p.games.flatMap(g => Object.values(g.picks).map(c => key(segment(p, g.number), c)));
  const consumedSet = new Set(consumed);
  const currentBans = new Set(p.current.bans.map(championKey));
  const slots = [];
  if (!finished) for (let game = currentGame; game <= p.bestOf; game++) for (const player of p.players) {
    const pool = player.pool.filter(c => game !== currentGame || !currentBans.has(championKey(c)));
    slots.push({ id: `${player.id}/g${game}`, game, team: player.team, player: player.id,
      name: player.name, role: player.role, pool, available: pool.filter(c => !consumedSet.has(key(segment(p, game), c))) });
  }
  const needsConfirmation = [...(!p.rules.confirmed ? ['League rule'] : []), ...p.players.filter(x => !x.confirmed).map(x => `${x.name}’s pool`)];
  const base = { ready: needsConfirmation.length === 0, needsConfirmation, slots, currentGame, scores, finished,
    ruleLabel: `Global Hard Fearless${p.rules.resetFinal ? `; Game ${p.bestOf} resets the reserve` : '; no final-game reset'}` };
  if (!base.ready) return base;
  if (finished) return { ...base, feasible: true, filled: 0, required: 0, matching: {}, bottleneck: null };
  const current = { ...p.current.picks };
  if (branch) {
    assert(p.players.some(x => x.id === branch.player) && nonempty(branch.champion), 'Choose a roster player and champion for this comparison.');
    current[branch.player] = branch.champion;
  }
  const graph = Object.fromEntries(slots.map(s => [s.id, s.pool.map(c => key(segment(p, s.game), c))]));
  const labels = new Map();
  for (const s of slots) for (const c of s.pool) if (!labels.has(championKey(c))) labels.set(championKey(c), c);
  const label = resource => labels.get(JSON.parse(resource)[1]);
  const forced = Object.fromEntries(Object.entries(current).map(([id, c]) => [`${id}/g${currentGame}`, key(segment(p, currentGame), c)]));
  const raw = allocate(graph, { forced, consumed });
  // Available lists reflect already-locked current picks too; a selected slot
  // retains its own champion so the board can show the decision explicitly.
  const locked = new Set(Object.values(forced));
  for (const s of slots) s.available = s.available.filter(c => !locked.has(key(segment(p, s.game), c)) || forced[s.id] === key(segment(p, s.game), c));
  const bottleneck = raw.bottleneck && { ...raw.bottleneck, options: raw.bottleneck.options.map(r =>
    label(r) + (p.rules.resetFinal ? (JSON.parse(r)[0] ? ` (Game ${p.bestOf} reset)` : ' (before reset)') : '')) };
  return { ...base, ...raw, matching: Object.fromEntries(Object.entries(raw.matching).map(([s, c]) => [s, label(c)])), bottleneck };
}

export function handoff(p) {
  const base = analyze(p), team = id => p.teams.find(t => t.id === id).name;
  const lines = [`# ${p.title}`, '', `Evidence cutoff: ${p.asOf} (only earlier observations)`,
    `Series: best-of-${p.bestOf}; score ${p.teams.map(t => `${t.name} ${base.scores[t.id]}`).join(' / ')}`,
    `Rule: ${base.ruleLabel}`, `Rule source / assumption: ${p.rules.source}`,
    `Rule confirmed: ${p.rules.confirmed ? 'yes' : 'pending'}`, '', '## Coach pools', ''];
  for (const x of p.players) lines.push(`- ${team(x.team)} / ${x.name} / ${x.role}: ${x.pool.join(', ') || '(empty)'} [${x.confirmed ? 'confirmed' : 'proposed'}]`);
  lines.push('', '## Completed games', '');
  for (const g of p.games) {
    lines.push(`### Game ${g.number}; winner: ${team(g.winner)}`);
    for (const x of p.players) lines.push(`- ${team(x.team)} / ${x.name}: ${g.picks[x.id]}`);
    lines.push(`Bans: ${g.bans.join(', ') || 'none recorded'}`, '');
  }
  lines.push('## Current draft', '', `Game ${base.currentGame}${base.finished ? ' (series complete)' : ''}`,
    `Bans: ${p.current.bans.join(', ') || 'none recorded'}`);
  for (const [id, c] of Object.entries(p.current.picks)) lines.push(`- ${p.players.find(x => x.id === id).name}: ${c}`);
  function result(label, branch) {
    lines.push('', `## ${label}`, '');
    let r;
    try { r = analyze(p, branch); } catch (e) { lines.push(`Input needs editing: ${e.message}`); return; }
    if (!r.ready) { lines.push(`Confirmation pending: ${r.needsConfirmation.join(', ')}`); return; }
    lines.push(`${r.filled}/${r.required} remaining player/game slots filled. ${r.feasible ? 'Complete allocation.' : 'Reserve shortage.'}`);
    const names = Object.fromEntries(r.slots.map(s => [s.id, `${team(s.team)} / ${s.name} / ${s.role} / Game ${s.game}`]));
    if (r.bottleneck) {
      lines.push(`Bottleneck: ${r.bottleneck.slots.length} slots share ${r.bottleneck.options.length} champion reserves; shortage ${r.bottleneck.shortfall}.`,
        `Slots: ${r.bottleneck.slots.map(s => names[s]).join('; ')}`,
        `Available reserves: ${r.bottleneck.options.join(', ') || '(none)'}`);
    }
    lines.push('', 'One allocation witness:');
    for (const [slot, champion] of Object.entries(r.matching)) lines.push(`- ${names[slot]}: ${champion}`);
  }
  result('Base preparation', null);
  for (const b of p.branches) result(`${b.name}: ${p.players.find(x => x.id === b.player).name} picks ${b.champion}`, b);
  lines.push('', '## Evidence policy', '', `Minimum observed games: ${p.evidencePolicy.minGames}; patch: ${p.evidencePolicy.patch || 'all'}.`,
    `Imported observations: ${p.evidence.length}. Historical counts inform proposed pools; coaches confirm playable pools. Raw rows remain in the locally saved JSON, outside this handoff.`,
    '', '## Coach notes', '', p.notes, '', '## Interpretation', '',
    'Each witness checks distinct champion capacity under the recorded pools and league rule through the longest possible remaining series. It leaves draft order, matchup strength, flex-role assignment and unknown opponent comfort to the coach.', '');
  return lines.join('\n');
}
