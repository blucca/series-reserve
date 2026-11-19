// A small RFC-style CSV reader for local evidence. Limit: 20,000 observations.
// Larger archives should be filtered by roster/time upstream, or streamed.
const required = ['game_id', 'played_at', 'team', 'player', 'champion'];
import { championKey } from './engine.js';

export function parseEvidenceCSV(text) {
  if (typeof text !== 'string') throw new Error('Open a UTF-8 evidence CSV.');
  const rows = [], row = [];
  let value = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  function field() { row.push(value); value = ''; closed = false; }
  function endRow() {
    field();
    if (row.some(x => x.trim())) rows.push([...row]);
    row.length = 0;
    if (rows.length > 20001) throw new Error('Filter this CSV to at most 20,000 observations before importing.');
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === '"' && !value.length && !closed) quoted = true;
    else if (c === ',') field();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else {
      if (closed || c === '"') throw new Error(`CSV row ${rows.length + 1}: quote a field from its beginning and close it before the comma.`);
      value += c;
    }
  }
  if (quoted) throw new Error('The final quoted CSV field is missing its closing quote.');
  if (value.length || row.length || closed) endRow();
  if (!rows.length) throw new Error('The CSV is empty. Include the required column headers.');
  const headers = rows.shift().map(x => x.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('Remove duplicate CSV column headers.');
  const missing = required.filter(k => !headers.includes(k));
  if (missing.length) throw new Error(`Add these CSV columns: ${missing.join(', ')}.`);
  return rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${i + 2}: expected ${headers.length} fields, received ${values.length}.`);
    const r = Object.fromEntries(headers.map((h, j) => [h, values[j].trim()]));
    if (required.some(k => !r[k])) throw new Error(`CSV row ${i + 2}: fill in game_id, played_at, team, player and champion.`);
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.played_at) || !Number.isFinite(Date.parse(r.played_at)))
      throw new Error(`CSV row ${i + 2}: played_at needs an ISO date/time with a timezone.`);
    return { gameId: r.game_id, playedAt: r.played_at, team: r.team, player: r.player,
      champion: r.champion, patch: r.patch || '', source: r.source || '' };
  });
}

export function observations(plan) {
  const cutoff = Date.parse(plan.asOf), byPlayer = Object.fromEntries(plan.players.map(p => [p.id, []]));
  if (!Number.isFinite(cutoff)) throw new Error('Set a valid evidence cutoff before deriving pools.');
  const counts = Object.fromEntries(plan.players.map(p => [p.id, new Map()])), seen = new Map();
  let included = 0, excluded = 0, unmatched = 0;
  for (const r of plan.evidence) {
    if (!r || !['gameId', 'playedAt', 'team', 'player', 'champion'].every(k => typeof r[k] === 'string' && r[k].trim()))
      throw new Error('Each evidence row needs a game ID, timestamp, team, player and champion.');
    const timestamp = Date.parse(r.playedAt);
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.playedAt) || !Number.isFinite(timestamp))
      throw new Error(`Evidence game ${r.gameId}: set an ISO timestamp with a timezone.`);
    if (timestamp >= cutoff || (plan.evidencePolicy.patch && r.patch !== plan.evidencePolicy.patch)) { excluded++; continue; }
    const matches = plan.teams.filter(t => t.id === r.team || t.name === r.team);
    // Stable player IDs follow a player across roster changes. Display-name
    // matching uses the recorded team to disambiguate names instead.
    const exact = plan.players.filter(p => p.id === r.player);
    const candidates = exact.length ? exact : plan.players.filter(p => matches.some(t => t.id === p.team) && p.name === r.player);
    // Ambiguous display names must be replaced with stable IDs in the CSV.
    if (candidates.length !== 1) { unmatched++; continue; }
    const player = candidates[0], id = JSON.stringify([r.gameId, player.id]), identity = championKey(r.champion);
    if (!identity) throw new Error(`Evidence game ${r.gameId}: enter a champion name, not punctuation.`);
    if (seen.has(id)) {
      if (seen.get(id) !== identity) throw new Error(`Evidence game ${r.gameId}: ${player.name} has two different champions. Correct the game ID or pick.`);
      excluded++; continue;
    }
    seen.set(id, identity); included++;
    let c = counts[player.id].get(identity);
    if (!c) { c = { champion: r.champion, games: 0, lastSeen: r.playedAt, sources: new Set() }; counts[player.id].set(identity, c); }
    c.games++;
    if (Date.parse(c.lastSeen) < timestamp) c.lastSeen = r.playedAt;
    if (r.source) c.sources.add(r.source);
  }
  for (const p of plan.players) byPlayer[p.id] = [...counts[p.id].values()].map(c => ({ ...c, sources: [...c.sources].sort() }))
    .sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion));
  return { byPlayer, included, excluded, unmatched };
}
