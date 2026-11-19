import { validatePlan, analyze, handoff, championKey } from './lib/engine.js';
import { parseEvidenceCSV, observations } from './lib/evidence.js';

const byId = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const championList = value => [...new Set(String(value).split(/[,\n]+/).map(x => x.trim()).filter(Boolean))];
const hasChampion = (values, champion) => values.some(c => championKey(c) === championKey(champion));
const uniqueChampions = values => { const seen = new Set(); return values.filter(c => { const key = championKey(c); if (seen.has(key)) return false; seen.add(key); return true; }); };
const valueOf = (form, name) => form.elements.namedItem(name)?.value ?? '';
const checked = (form, name) => Boolean(form.elements.namedItem(name)?.checked);
const option = (value, label, selected = false) => `<option value="${escape(value)}"${selected ? ' selected' : ''}>${escape(label)}</option>`;
const teamName = id => plan.teams.find(t => t.id === id)?.name ?? id;
const playerById = id => plan.players.find(p => p.id === id);
const dateTime = value => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
const dateOnly = value => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

let plan = null;
const undoStack = [];
const view = { tab: 'board', playerId: '', branchId: '', branchEditorId: null, branchEditorOpen: false, draftOpen: false, example: true, importMode: 'replace' };

function notice(message) {
  byId('status-message').textContent = message;
}
function clearError() {
  byId('error-message').hidden = true;
  byId('error-message').replaceChildren();
}
function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const box = byId('error-message');
  box.textContent = message;
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'button-small';
  dismiss.dataset.action = 'dismiss-error';
  dismiss.textContent = 'Dismiss';
  box.append(dismiss);
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest' });
}

function commit(edit, message, options = {}) {
  const candidate = typeof edit === 'function' ? clone(plan) : clone(edit);
  if (typeof edit === 'function') edit(candidate);
  validatePlan(candidate);
  observations(candidate);
  if (plan) {
    undoStack.push({ plan: clone(plan), example: view.example, branchId: view.branchId, playerId: view.playerId });
    if (undoStack.length > 30) undoStack.shift();
  }
  plan = candidate;
  if ('example' in options) view.example = options.example;
  if ('branchId' in options) view.branchId = options.branchId;
  if ('playerId' in options) view.playerId = options.playerId;
  clearError();
  render();
  notice(message);
}

function resultFor(branch = null) {
  try { return analyze(plan, branch); }
  catch (error) { return { ...analyze(plan), ready: false, error: error.message, matching: undefined, bottleneck: undefined }; }
}
function selectedBranch() {
  return plan.branches.find(b => b.id === view.branchId) ?? null;
}
function usedFor(game) {
  const fresh = plan.rules.resetFinal && game === plan.bestOf;
  return new Set(plan.games.filter(g => (plan.rules.resetFinal && g.number === plan.bestOf) === fresh)
    .flatMap(g => Object.values(g.picks)).map(championKey));
}
function legalCurrent(playerId, branch = null) {
  const player = playerById(playerId);
  const currentGame = plan.games.length + 1;
  const used = usedFor(currentGame);
  const picks = { ...plan.current.picks };
  if (branch) picks[branch.player] = branch.champion;
  const otherPicks = new Set(Object.entries(picks).filter(([id]) => id !== playerId).map(([, c]) => championKey(c)));
  const banned = new Set(plan.current.bans.map(championKey));
  return player.pool.filter(c => !used.has(championKey(c)) && !banned.has(championKey(c)) && !otherPicks.has(championKey(c))).sort();
}

function render() {
  if (!plan) return;
  if (!playerById(view.playerId)) view.playerId = plan.players[0].id;
  if (view.branchId && !selectedBranch()) view.branchId = '';
  renderContext();
  renderBoard();
  renderEvidence();
  renderSeries();
  setTab(view.tab);
  for (const button of document.querySelectorAll('.file-actions [data-action]')) button.disabled = false;
  document.querySelector('[data-action="undo"]').disabled = undoStack.length === 0;
}

function setTab(tab, focus = false) {
  view.tab = tab;
  for (const name of ['board', 'evidence', 'series']) {
    const active = name === tab;
    byId(`tab-${name}`).setAttribute('aria-selected', String(active));
    byId(`tab-${name}`).tabIndex = active ? 0 : -1;
    byId(`panel-${name}`).hidden = !active;
  }
  if (focus) byId(`tab-${tab}`).focus();
}

function renderContext() {
  const base = analyze(plan);
  byId('series-context').innerHTML = `
    <div class="series-heading">
      <div class="series-title-line"><h1>${escape(plan.title)}</h1><span class="example-flag">${view.example ? 'Fictional practice plan' : 'Local coach plan'}</span></div>
      <p class="context-rule">${escape(base.ruleLabel)}${!plan.rules.confirmed ? ' <span class="pending">Confirm the league rule</span>' : ''}</p>
      <div class="context-meta"><span>Cutoff ${escape(dateTime(plan.asOf))} UTC</span><span>${plan.players.filter(p => p.confirmed).length}/10 pools confirmed</span><span>${plan.current.bans.length} current bans</span></div>
    </div>
    <div class="score-context">
      <div class="scoreline" aria-label="${escape(plan.teams.map(t => t.name + ' ' + base.scores[t.id]).join(', '))}">
        ${plan.teams.map((t, i) => `${i ? '<span class="score-separator" aria-hidden="true">:</span>' : ''}<div class="score-team tone-${i}"><span>${escape(t.name)}</span><strong>${base.scores[t.id]}</strong></div>`).join('')}
      </div>
      <div class="series-format">Best of ${plan.bestOf} / ${base.finished ? 'Series complete' : 'Game ' + base.currentGame + ' next'}</div>
    </div>`;
}

function capacity(result, rail = false) {
  const className = rail ? 'branch-capacity' : 'allocation-status';
  if (result.error) return `<span class="${className} is-pending"><strong>Edit pick</strong><span>Input conflict</span></span>`;
  if (!result.ready) return `<span class="${className} is-pending">${rail ? '' : '<i class="status-dot" aria-hidden="true"></i>'}<strong>Confirm inputs</strong>${rail ? '' : '<span>' + result.needsConfirmation.length + ' pending</span>'}</span>`;
  const label = result.finished ? 'Series complete' : result.feasible ? 'Full allocation' : 'Short ' + result.bottleneck.shortfall;
  return `<span class="${className} ${result.feasible ? 'is-feasible' : 'is-shortage'}">${rail ? '' : '<i class="status-dot" aria-hidden="true"></i>'}<strong>${result.filled}<small>/${result.required}</small></strong><span>${label}</span></span>`;
}

function renderBoard() {
  const branch = selectedBranch();
  const result = resultFor(branch);
  const base = analyze(plan);
  const slotById = Object.fromEntries(result.slots.map(s => [s.id, s]));
  const hallSlots = new Set(result.ready ? result.bottleneck?.slots ?? [] : []);
  const currentPicks = { ...plan.current.picks };
  if (branch && !result.error) currentPicks[branch.player] = branch.champion;
  const gameHeaders = Array.from({ length: plan.bestOf }, (_, i) => {
    const game = i + 1, completed = plan.games[i];
    const label = completed ? teamName(completed.winner) + ' win' : base.finished ? 'Series closed' : game === base.currentGame ? 'Current draft' : plan.rules.resetFinal && game === plan.bestOf ? 'Fresh reserve' : 'Reserve';
    return `<th scope="col" class="${completed ? 'past-head' : game === base.currentGame && !base.finished ? 'current-head' : ''}">Game ${game}<small>${escape(label)}</small></th>`;
  }).join('');
  const bodies = plan.teams.map((team, teamIndex) => `<tbody class="tone-${teamIndex}">
    <tr class="team-band"><th colspan="${plan.bestOf + 2}">${escape(team.name)}<span>Coach-assigned roster</span></th></tr>
    ${plan.players.filter(p => p.team === team.id).map(player => {
      const currentSlot = slotById[`${player.id}/g${base.currentGame}`];
      const available = currentSlot?.available.length ?? 0;
      const cells = Array.from({ length: plan.bestOf }, (_, i) => {
        const game = i + 1;
        if (plan.games[i]) return `<td class="past-cell">${escape(plan.games[i].picks[player.id])}</td>`;
        if (base.finished) return '<td class="pending-cell"><span aria-label="Series complete">—</span></td>';
        const slotId = `${player.id}/g${game}`;
        const match = result.ready ? result.matching[slotId] : '';
        const assigned = match ? player.pool.find(c => championKey(c) === championKey(match)) ?? match : '';
        const locked = game === base.currentGame && Boolean(currentPicks[player.id]);
        const compared = locked && branch?.player === player.id;
        const isHall = hallSlots.has(slotId);
        const classes = ['allocation-cell', game === base.currentGame ? 'current-cell' : '', locked ? 'locked-cell' : '', isHall ? 'hall-cell' : '', result.ready && !assigned ? 'missing-cell' : '', !result.ready ? 'pending-cell' : ''].filter(Boolean).join(' ');
        const label = result.ready ? assigned || 'Open slot' : result.error ? 'Edit pick' : 'Confirm inputs';
        return `<td class="${classes}">${escape(label)}${locked && result.ready ? '<small>' + (compared ? 'Compared pick' : 'Locked pick') + '</small>' : result.ready && !assigned ? '<small>Reserve shortage</small>' : ''}</td>`;
      }).join('');
      return `<tr><th scope="row"><button type="button" class="player-link" data-action="edit-player" data-player="${escape(player.id)}" aria-label="Edit ${escape(player.name)}’s pool">${escape(player.name)}<small>${escape(player.role)}${player.confirmed ? '' : ' / proposed'}</small></button></th><td class="pool-count">${base.finished ? '—' : available + '<span>/' + player.pool.length + '</span>'}<small>${base.finished ? 'Series closed' : 'available / pool'}</small></td>${cells}</tr>`;
    }).join('')}</tbody>`).join('');
  byId('panel-board').innerHTML = `
    <div class="board-layout">
      <div class="board-main">
        <div class="section-heading"><div><h2>Series reserve</h2><p>${branch ? escape(branch.name) + ' in Game ' + base.currentGame + '.' : 'Base preparation with the actual current draft.'} ${base.finished ? 'The series has finished.' : 'One allocation through Game ' + plan.bestOf + '.'}</p></div>${capacity(result)}</div>
        <div class="board-scroll" tabindex="0" role="region" aria-label="Series reserve table; scroll horizontally for all games">
          <table class="reserve-table"><caption class="sr-only">Coach pools and one remaining player/game allocation. Available counts are for the current game; all output follows the recorded global Hard Fearless rule.</caption>
            <colgroup><col class="col-player"><col class="col-pool">${'<col class="col-game">'.repeat(plan.bestOf)}</colgroup>
            <thead><tr><th scope="col">Player / role</th><th scope="col">Champions<small>current / total</small></th>${gameHeaders}</tr></thead>${bodies}
          </table>
        </div>
        <div class="board-legend"><span><i class="legend-swatch"></i>Completed pick</span><span><i class="legend-swatch allocated"></i>Allocation witness</span><span><i class="legend-swatch locked"></i>Locked or compared</span><span><i class="legend-swatch shortage"></i>Shared reserve bottleneck</span></div>
        ${renderWitness(result)}
        ${base.finished ? `<div class="finished-sheet"><h3>Series complete</h3><p>${escape(teamName(plan.teams.find(t => base.scores[t.id] >= Math.floor(plan.bestOf / 2) + 1).id))} clinched the series. Remove the last completed game in Series setup to reopen preparation.</p></div>` : renderDraftForm('current', base)}
      </div>
      ${renderBranchRail(base)}
    </div>`;
}

function renderWitness(result) {
  if (result.error) return `<div class="allocation-note confirmation-note"><h3>Edit this comparison</h3><p>${escape(result.error)}</p><button type="button" class="button-small" data-action="edit-branch">Edit comparison</button></div>`;
  if (!result.ready) return `<div class="allocation-note confirmation-note"><h3>Confirm the preparation inputs</h3><p>Allocation starts once the league rule and all ten coach pools are confirmed. An empty confirmed pool is valid and appears as a reserve shortage.</p><ul>${result.needsConfirmation.map(n => '<li>' + escape(n) + '</li>').join('')}</ul><div class="form-actions"><button type="button" class="button-small" data-action="go-evidence">Review pools</button><button type="button" class="button-small" data-action="go-series">Review league rule</button></div></div>`;
  if (!result.bottleneck) return `<div class="allocation-note"><p>${result.finished ? 'No remaining draft slots.' : result.filled + ' player/game slots have distinct champion reserves under the confirmed pools and rule. The table shows one possible allocation.'}</p></div>`;
  const b = result.bottleneck;
  const slots = b.slots.map(id => result.slots.find(s => s.id === id));
  return `<section class="witness" aria-label="Reserve shortage evidence"><h3>${b.slots.length} slots share ${b.options.length} champion reserves. Short ${b.shortfall}.</h3><p>These player/game slots compete for the same reserve after past picks, current bans and locked picks:</p><ul class="witness-list">${slots.map(s => '<li>' + escape(teamName(s.team) + ' / ' + s.name + ' / ' + s.role + ' / G' + s.game) + '</li>').join('')}</ul><p>Available reserves: <span class="witness-options">${escape(b.options.join(', ') || 'None')}</span></p><button type="button" class="button-small" data-action="edit-player" data-player="${escape(slots[0].player)}">Review ${escape(slots[0].name)}’s pool</button></section>`;
}

function renderBranchRail(base) {
  const branch = selectedBranch();
  const choices = [{ id: '', name: 'Base preparation', player: '', champion: '' }, ...plan.branches];
  const editor = view.branchEditorId === null ? null : plan.branches.find(b => b.id === view.branchEditorId);
  const editorPlayer = editor?.player ?? branch?.player ?? plan.players[plan.players.length - 1].id;
  const championOptions = uniqueChampions([...legalCurrent(editorPlayer), ...(editor ? [editor.champion] : [])]).sort();
  return `<aside class="branch-rail" aria-label="Current pick comparisons"><h2>Compare a pick</h2><p class="branch-intro">Compare one current pick; actual draft stays separate.</p>
    <div class="branch-choices">${choices.map(b => {
      const r = resultFor(b.id ? b : null);
      const player = b.player ? playerById(b.player) : null;
      return `<button type="button" class="branch-choice" aria-pressed="${view.branchId === b.id}" data-action="select-branch" data-branch="${escape(b.id)}"><span class="branch-name">${escape(b.name)}</span><span class="branch-player">${player ? escape(teamName(player.team) + ' / ' + player.name + ' / ' + b.champion) : 'Actual current picks and bans'}</span>${capacity(r, true)}${r.error ? '<span class="branch-error">' + escape(r.error) + '</span>' : ''}</button>`;
    }).join('')}</div>
    ${branch ? `<div class="branch-actions"><button type="button" class="button-small button-primary" data-action="apply-branch"${base.finished || resultFor(branch).error ? ' disabled' : ''}>Lock ${escape(branch.champion)} in current draft</button><button type="button" class="button-small" data-action="edit-branch">Edit</button><button type="button" class="button-small button-danger" data-action="delete-branch">Remove</button></div>` : ''}
    ${base.finished ? '' : `<details class="branch-editor" id="branch-editor"${view.branchEditorOpen ? ' open' : ''}><summary>${editor ? 'Edit comparison' : 'Compare another pick'}</summary>
      <form data-submit="branch"><div class="field"><label for="branch-name">Comparison name</label><input id="branch-name" name="name" value="${escape(editor?.name ?? '')}" placeholder="e.g. Tide takes Thresh" required maxlength="120"></div>
      <div class="field"><label for="branch-player">Current player</label><select id="branch-player" name="player">${plan.teams.map(t => '<optgroup label="' + escape(t.name) + '">' + plan.players.filter(p => p.team === t.id).map(p => option(p.id, p.name + ' / ' + p.role, p.id === editorPlayer)).join('') + '</optgroup>').join('')}</select></div>
      <div class="field"><label for="branch-champion">Champion</label><select id="branch-champion" name="champion" required>${option('', 'Choose a champion') + championOptions.map(c => option(c, c, Boolean(editor && championKey(c) === championKey(editor.champion)))).join('')}</select></div>
      <div class="form-actions"><button type="submit" class="button-small button-primary">${editor ? 'Save comparison' : 'Add comparison'}</button>${editor ? '<button type="button" class="button-small" data-action="new-branch">New comparison</button>' : ''}</div></form></details>`}
  </aside>`;
}

function renderDraftForm(kind, base) {
  const current = kind === 'current';
  const prefix = current ? 'current' : 'completed';
  const game = base.currentGame;
  const rows = plan.teams.map((team, ti) => `<div class="draft-team tone-${ti}"><h3>${escape(team.name)}</h3>${plan.players.filter(p => p.team === team.id).map((p, i) => {
    const id = `${prefix}-pick-${ti}-${i}`;
    const existing = plan.current.picks[p.id] ?? '';
    const options = uniqueChampions([...legalCurrent(p.id), ...(existing ? [existing] : [])]).sort();
    const control = current ? `<select id="${id}" name="pick:${escape(p.id)}">${option('', 'Not locked') + options.map(c => option(c, c, Boolean(existing && championKey(c) === championKey(existing)))).join('')}</select>`
      : `<input id="${id}" name="pick:${escape(p.id)}" list="${id}-options" value="${escape(existing)}" placeholder="Played champion" required><datalist id="${id}-options">${p.pool.map(c => option(c, c)).join('')}</datalist>`;
    return `<div class="draft-row"><label for="${id}">${escape(p.name)}<small>${escape(p.role)}</small></label>${control}</div>`;
  }).join('')}</div>`).join('');
  return `<details class="edit-section" id="${prefix}-editor"${current && view.draftOpen ? ' open' : ''}><summary>${current ? 'Game ' + game + ' actual draft' : 'Record completed Game ' + game}</summary><p class="muted">${current ? 'Set actual bans and locked picks. Compared picks enter here when you choose “Lock” in the comparison rail.' : 'Record all ten played champions and the winner. Historical picks may sit outside today’s pools.'}</p>
    <form data-submit="${prefix}-draft"><div class="draft-pair">${rows}</div><div class="draft-bottom"><div class="field"><label for="${prefix}-bans">Game ${game} bans</label><input id="${prefix}-bans" name="bans" value="${escape(plan.current.bans.join(', '))}" placeholder="Champion names, separated by commas"><small class="field-help">These bans apply to Game ${game} only.</small></div>
    <div class="field"><label for="${prefix}-winner">Game ${game} winner</label><select id="${prefix}-winner" name="winner"${current ? '' : ' required'}>${option('', 'Choose after the game') + plan.teams.map(t => option(t.id, t.name)).join('')}</select></div></div>
    <div class="form-actions">${current ? '<button type="submit" class="button-primary" name="operation" value="save-current">Save current draft</button><button type="button" data-action="clear-current">Clear current draft</button>' : ''}<button type="submit" class="${current ? '' : 'button-primary'}" name="operation" value="complete">Complete Game ${game}</button></div><small class="field-help">Completing a game requires all ten picks and a winner; it clears the current draft.</small></form></details>`;
}

function renderEvidence() {
  const observed = observations(plan);
  const player = playerById(view.playerId);
  const entries = observed.byPlayer[player.id];
  const proposed = entries.filter(c => c.games >= plan.evidencePolicy.minGames).map(c => c.champion);
  const currentGame = plan.games.length + 1;
  const used = usedFor(currentGame);
  const roster = plan.teams.map((team, ti) => `<div class="tone-${ti}"><h3>${escape(team.name)}</h3>${plan.players.filter(p => p.team === team.id).map(p => `<button type="button" class="roster-button" data-action="select-player" data-player="${escape(p.id)}" aria-pressed="${p.id === player.id}"><span>${escape(p.name)}<small>${escape(p.role)}</small></span><span class="roster-count">${p.pool.length}<small class="${p.confirmed ? '' : 'is-pending'}">${p.confirmed ? 'Confirmed' : 'Proposed'}</small></span></button>`).join('')}</div>`).join('');
  byId('panel-evidence').innerHTML = `
    <section class="evidence-top" aria-label="Local evidence and policy"><div class="section-heading"><div><h2>Evidence &amp; coach pools</h2><p>Observed games suggest a pool. Coaches assign roles, edit champions and confirm the preparation inputs.</p></div></div>
      <div class="evidence-controls"><form class="evidence-policy" data-submit="policy"><div class="field-grid three"><div class="field"><label for="evidence-cutoff">Evidence cutoff (UTC)</label><input id="evidence-cutoff" name="asOf" type="datetime-local" step="1" value="${new Date(plan.asOf).toISOString().slice(0, 19)}" required></div><div class="field"><label for="evidence-minimum">Minimum games</label><input id="evidence-minimum" name="minGames" type="number" min="1" step="1" value="${plan.evidencePolicy.minGames}" required></div><div class="field"><label for="evidence-patch">Exact patch</label><input id="evidence-patch" name="patch" value="${escape(plan.evidencePolicy.patch)}" placeholder="All patches"></div></div><div class="form-actions"><button type="submit" class="button-small">Update observation policy</button><small>Confirmed pools stay as saved.</small></div></form>
      <div class="evidence-import"><h3>Import permitted observations</h3><p>CSV is processed in this browser. Required headers: game_id, played_at, team, player, champion. Optional: patch, source. Stable player IDs follow roster changes; display names match within the recorded team.</p><label for="evidence-import-mode">Import mode</label><div class="import-row"><select id="evidence-import-mode">${option('replace', 'Replace current evidence', view.importMode === 'replace') + option('append', 'Append to current evidence', view.importMode === 'append')}</select><button type="button" class="button-primary" data-action="import-evidence">Open CSV</button></div><button type="button" class="button-text" data-action="load-demo-evidence">Use fictional example CSV</button></div></div>
      <div class="observation-summary"><span><strong>${plan.evidence.length}</strong> imported rows</span><span><strong>${observed.included}</strong> matched earlier observations</span><span><strong>${observed.excluded}</strong> excluded by cutoff, patch or duplicate</span><span><strong>${observed.unmatched}</strong> unmatched roster rows</span></div>
      ${observed.unmatched ? '<p class="stable-id">Use a stable player ID to match observations across former teams. For player display names, match both the current team name or ID and player name.</p>' : ''}
    </section>
    <div class="evidence-layout"><aside class="roster-selector" aria-label="Select a coach pool">${roster}<div class="roster-tools"><p>Confirm the exact pools after your review. Empty confirmed pools produce shortage evidence.</p><button type="button" class="button-small" data-action="propose-all">Propose all from observations</button><button type="button" class="button-small" data-action="confirm-all">Confirm all reviewed pools</button></div></aside>
      <div class="player-workspace"><div class="section-heading"><div><h2>${escape(teamName(player.team))} / ${escape(player.name)}</h2><p>Coach-assigned ${escape(player.role)} pool</p></div><span class="confirmation-chip ${player.confirmed ? '' : 'pending'}"><i class="status-dot" aria-hidden="true"></i>${player.confirmed ? 'Coach-confirmed' : 'Proposed pool'}</span></div>
      <section class="player-editor" aria-label="Edit player and pool"><form data-submit="player"><div class="field-grid"><div class="field"><label for="player-name">Player name</label><input id="player-name" name="name" value="${escape(player.name)}" required></div><div class="field"><label for="player-role">Coach-assigned role</label><input id="player-role" name="role" list="coach-roles" value="${escape(player.role)}" required><datalist id="coach-roles">${['Top', 'Jungle', 'Mid', 'Bot', 'Support'].map(r => option(r, r)).join('')}</datalist></div></div>
        <div class="field"><label for="player-pool">Playable champion pool</label><textarea id="player-pool" name="pool" rows="5" placeholder="One champion per line, or separated by commas">${escape(player.pool.join('\n'))}</textarea><small class="field-help">Case, spaces and apostrophe variants are matched. Use the same name for aliases such as MonkeyKing / Wukong. Empty pools are valid.</small></div>
        <label class="checkbox-label"><input name="confirmed" type="checkbox"${player.confirmed ? ' checked' : ''}><span>I confirm this player’s pool for this preparation.</span></label>
        <div class="form-actions"><button type="submit" class="button-primary" name="operation" value="save">Save player &amp; pool</button><button type="submit" name="operation" value="confirm">Save &amp; confirm pool</button></div><p class="stable-id">Stable team ID: ${escape(player.team)}<br>Stable player ID: ${escape(player.id)}</p></form>
        <div class="player-pool-preview"><h3>Saved pool / Game ${currentGame}</h3><ul class="pool-preview-list">${player.pool.map(c => `<li class="${used.has(championKey(c)) ? 'is-spent' : hasChampion(plan.current.bans, c) ? 'is-banned' : ''}">${escape(c)}${used.has(championKey(c)) ? '<small>picked earlier</small>' : hasChampion(plan.current.bans, c) ? '<small>current ban</small>' : ''}</li>`).join('') || '<li>Empty pool</li>'}</ul><p>${plan.rules.resetFinal && currentGame === plan.bestOf ? 'The final-game rule restores champions picked in earlier games.' : 'Earlier picks leave the shared reserve for this rule.'}</p><h3>Observed proposal</h3><p>${proposed.length} champions meet the ${plan.evidencePolicy.minGames}-game minimum before the cutoff${plan.evidencePolicy.patch ? ' on patch ' + escape(plan.evidencePolicy.patch) : ''}. Proposing replaces this saved pool and marks it for coach review.</p><button type="button" class="button-small" data-action="propose-player">Propose from observations</button></div>
      </section>
      <section class="observed-section" aria-label="Player observation counts"><div class="section-heading"><div><h3>Observed champion counts</h3><p>Distinct games per player, strictly before ${escape(dateTime(plan.asOf))} UTC.</p></div></div>
      ${entries.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Observation counts table"><table class="observed-table"><thead><tr><th scope="col">Champion</th><th scope="col" class="numeric">Games</th><th scope="col">Last observed (UTC)</th><th scope="col">Sources</th></tr></thead><tbody>${entries.map(c => `<tr><td>${escape(c.champion)}<small class="${c.games >= plan.evidencePolicy.minGames ? 'is-feasible' : ''}">${c.games >= plan.evidencePolicy.minGames ? 'Meets proposal minimum' : 'Below proposal minimum'}</small></td><td class="numeric">${c.games}</td><td>${escape(dateOnly(c.lastSeen))}</td><td class="observed-source">${escape(c.sources.join(', ') || 'No source recorded')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-evidence"><h3>No matched observations at this cutoff</h3><p>Import a permitted CSV using the team/player names or stable IDs above, or enter and confirm the coach pool directly.</p></div>'}
      </section></div>
    </div>`;
}

function renderSeries() {
  const base = analyze(plan);
  const history = plan.games.map(g => `<details class="completed-game"><summary>Game ${g.number}<span>${escape(teamName(g.winner))} win</span></summary><div class="history-picks draft-pair">${plan.teams.map((t, i) => `<div class="tone-${i}"><h3>${escape(t.name)}</h3><ul>${plan.players.filter(p => p.team === t.id).map(p => '<li><span>' + escape(p.name) + '</span><strong>' + escape(g.picks[p.id]) + '</strong></li>').join('')}</ul></div>`).join('')}</div><p class="history-bans">Bans: ${escape(g.bans.join(', ') || 'None recorded')}</p></details>`).join('');
  byId('panel-series').innerHTML = `<div class="series-layout"><div>
    <section class="setup-sheet"><h2>Series &amp; league rule</h2><p>Keep the rule source and reserve reset explicit for this preparation.</p><form data-submit="series"><div class="field"><label for="series-title">Preparation name</label><input id="series-title" name="title" value="${escape(plan.title)}" required></div>
      <div class="field-grid">${plan.teams.map((t, i) => `<div class="field"><label for="team-name-${i}">Team ${i + 1} name</label><input id="team-name-${i}" name="team:${escape(t.id)}" value="${escape(t.name)}" required><small class="field-help">Stable ID: ${escape(t.id)}</small></div>`).join('')}</div>
      <div class="field"><label for="series-best-of">Series length</label><select id="series-best-of" name="bestOf">${option(3, 'Best of three', plan.bestOf === 3) + option(5, 'Best of five', plan.bestOf === 5)}</select></div>
      <div class="rule-definition"><p><strong>Global Hard Fearless.</strong> A pick by either team leaves both teams’ reserve for following games. Bans last for one game.</p></div>
      <div class="field"><label class="checkbox-label"><input type="checkbox" name="resetFinal"${plan.rules.resetFinal ? ' checked' : ''}><span>Reset the champion reserve in the final possible game (G3 / G5).</span></label></div>
      <div class="field"><label for="series-rule-source">League rule source / planning assumption</label><textarea id="series-rule-source" name="source" rows="3" placeholder="League document reference, or your explicit planning assumption">${escape(plan.rules.source)}</textarea></div>
      <label class="checkbox-label"><input type="checkbox" name="confirmed"${plan.rules.confirmed ? ' checked' : ''}><span>I confirm this rule and source for this series.</span></label>
      <div class="form-actions"><button type="submit" class="button-primary">Save series &amp; rule</button></div></form>
    </section>
    <section class="setup-sheet"><h2>Coach notes</h2><form data-submit="notes"><label for="coach-notes">Preparation context and decisions</label><textarea id="coach-notes" name="notes" rows="6" placeholder="Draft priorities, assumptions and discussion points for the next coach">${escape(plan.notes)}</textarea><div class="form-actions"><button type="submit">Save notes</button><small>Included in the Markdown handoff.</small></div></form></section>
  </div><div><section class="setup-sheet"><h2>Completed games</h2><p>${plan.games.length} recorded. ${base.finished ? 'Series complete.' : 'Game ' + base.currentGame + ' is next.'}</p>${history || '<p class="series-state-note">No completed games. Record the ten played champions and a winner below as the series progresses.</p>'}
    ${plan.games.length ? '<div class="history-actions"><button type="button" class="button-small button-danger" data-action="remove-game">Remove Game ' + plan.games.length + (Object.keys(plan.current.picks).length || plan.current.bans.length ? ' & clear current draft' : '') + '</button><small class="field-help">Undo restores the removed game and draft.</small></div>' : ''}</section>
    ${base.finished ? '<div class="finished-sheet"><h3>The series has been clinched</h3><p>Export the handoff or remove the last game to revise the series state.</p></div>' : renderDraftForm('completed', base)}
    <section class="setup-sheet"><h3>Current draft</h3><p>Game ${base.currentGame}: ${Object.keys(plan.current.picks).length} locked picks, ${plan.current.bans.length} bans. ${base.finished ? 'The series is complete.' : 'Edit the actual draft on the Reserve board.'}</p>${!base.finished ? '<button type="button" class="button-small" data-action="open-draft">Edit current draft</button>' : ''}</section>
  </div></div>`;
}

function readDraft(form, complete) {
  const picks = {};
  for (const player of plan.players) {
    const champion = valueOf(form, 'pick:' + player.id).trim();
    if (champion) picks[player.id] = champion;
    else if (complete) throw new Error(`Game ${plan.games.length + 1}: record ${player.name}’s pick before completing the game.`);
  }
  const bans = championList(valueOf(form, 'bans'));
  const winner = valueOf(form, 'winner');
  if (complete && !winner) throw new Error('Choose the game winner before completing the game.');
  return { picks, bans, winner };
}

function saveForm(form, operation) {
  const kind = form.dataset.submit;
  if (kind === 'policy') {
    const local = valueOf(form, 'asOf');
    const date = new Date(local + 'Z');
    if (!local || !Number.isFinite(date.getTime())) throw new Error('Set a valid UTC evidence cutoff.');
    commit(next => {
      next.asOf = date.toISOString();
      next.evidencePolicy = { minGames: Number(valueOf(form, 'minGames')), patch: valueOf(form, 'patch').trim() };
    }, 'Observation policy updated. Saved pools kept unchanged.');
  } else if (kind === 'player') {
    const id = view.playerId;
    commit(next => {
      const player = next.players.find(p => p.id === id);
      player.name = valueOf(form, 'name').trim();
      player.role = valueOf(form, 'role').trim();
      player.pool = championList(valueOf(form, 'pool'));
      player.confirmed = operation === 'confirm' || checked(form, 'confirmed');
    }, operation === 'confirm' ? 'Player and pool saved. Coach confirmation recorded.' : 'Player and pool saved.');
  } else if (kind === 'series') {
    commit(next => {
      next.title = valueOf(form, 'title').trim();
      next.bestOf = Number(valueOf(form, 'bestOf'));
      for (const t of next.teams) t.name = valueOf(form, 'team:' + t.id).trim();
      next.rules = { mode: 'hard-global', resetFinal: checked(form, 'resetFinal'), confirmed: checked(form, 'confirmed'), source: valueOf(form, 'source').trim() };
    }, 'Series and league rule saved. Roster IDs kept unchanged.');
  } else if (kind === 'notes') {
    commit(next => { next.notes = valueOf(form, 'notes'); }, 'Coach notes saved.');
  } else if (kind === 'current-draft' || kind === 'completed-draft') {
    const complete = operation === 'complete' || kind === 'completed-draft';
    const draft = readDraft(form, complete);
    const game = plan.games.length + 1;
    commit(next => {
      if (complete) {
        next.games.push({ number: game, winner: draft.winner, picks: draft.picks, bans: draft.bans });
        next.current = { picks: {}, bans: [] };
      } else next.current = { picks: draft.picks, bans: draft.bans };
    }, complete ? `Game ${game} completed. Current draft cleared.` : `Game ${game} draft saved with ${Object.keys(draft.picks).length} locked picks.`, complete ? { branchId: '' } : {});
    if (complete) notice(analyze(plan).finished ? `Game ${game} completed. The series is clinched; no remaining draft slots.` : `Game ${game} completed. Current draft cleared; Game ${game + 1} reserve recalculated.`);
  } else if (kind === 'branch') {
    const branch = { id: view.branchEditorId ?? 'comparison-' + Date.now(), name: valueOf(form, 'name').trim(), player: valueOf(form, 'player'), champion: valueOf(form, 'champion').trim() };
    if (!branch.name || !branch.champion) throw new Error('Give the comparison a name and choose a champion.');
    if (!hasChampion(legalCurrent(branch.player), branch.champion)) throw new Error('Choose a champion from this player’s unconsumed, unbanned pool that is not locked by another player.');
    const tested = resultFor(branch);
    if (tested.error) throw new Error(tested.error);
    commit(next => {
      const index = next.branches.findIndex(b => b.id === branch.id);
      if (index >= 0) next.branches[index] = branch;
      else next.branches.push(branch);
    }, 'Comparison saved. Actual current draft unchanged.', { branchId: branch.id });
    view.branchEditorOpen = false;
    view.branchEditorId = null;
    renderBoard();
  }
}

function propose(playerIds) {
  const observed = observations(plan);
  const proposals = Object.fromEntries(playerIds.map(id => [id, observed.byPlayer[id].filter(c => c.games >= plan.evidencePolicy.minGames).map(c => c.champion)]));
  for (const id of playerIds) if (plan.current.picks[id] && !hasChampion(proposals[id], plan.current.picks[id]))
    throw new Error(`${playerById(id).name}’s locked pick is outside the observed proposal. Clear that current pick on the Reserve board, or edit the pool directly.`);
  commit(next => {
    for (const player of next.players) if (player.id in proposals) {
      player.pool = proposals[player.id];
      player.confirmed = false;
    }
  }, `${playerIds.length === 1 ? 'Pool proposed' : 'All pools proposed'} from earlier observations. Review and confirm the exact champion lists.`);
}

function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filename(extension) {
  return (plan.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'reserve-plan') + extension;
}

async function loadDemo(initial = false) {
  try {
    const response = await fetch('./demo.json');
    if (!response.ok) throw new Error('The fictional plan failed to load (HTTP ' + response.status + '). Open your saved JSON plan or reload the page.');
    const demo = await response.json();
    validatePlan(demo);
    observations(demo);
    view.branchEditorOpen = false;
    view.branchEditorId = null;
    view.draftOpen = false;
    if (initial) {
      plan = demo;
      view.branchId = demo.branches[0]?.id ?? '';
      view.playerId = demo.players[0].id;
      render();
      notice('Fictional practice plan loaded. Compare Rell 29/30 and Thresh 30/30. Save JSON to keep changes.');
    } else {
      commit(demo, 'Fictional practice plan reloaded. Undo restores your previous plan.', { example: true, branchId: demo.branches[0]?.id ?? '', playerId: demo.players[0].id });
      setTab('board');
    }
  } catch (error) {
    showError(initial ? 'Opening the example failed. Serve this folder over HTTP, then reload; or use Open JSON to load a saved plan. ' + error.message : error);
    notice('Open JSON is available to load a local plan.');
  }
}

function blankPlan() {
  const teams = [{ id: 'team-a', name: 'Team A' }, { id: 'team-b', name: 'Team B' }];
  const roles = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];
  return { format: 'reserve-plan/1', title: 'New series preparation', asOf: new Date().toISOString(), bestOf: 5,
    rules: { mode: 'hard-global', resetFinal: false, confirmed: false, source: '' }, teams,
    players: teams.flatMap(t => roles.map((role, i) => ({ id: t.id + '-slot-' + (i + 1), team: t.id, name: t.name + ' player ' + (i + 1), role, pool: [], confirmed: false }))),
    games: [], current: { bans: [], picks: {} }, evidence: [], evidencePolicy: { minGames: 3, patch: '' }, branches: [], notes: '' };
}

async function importEvidence(text, label) {
  const rows = parseEvidenceCSV(text);
  const append = view.importMode === 'append';
  if (rows.length + (append ? plan.evidence.length : 0) > 20000) throw new Error('Keep the combined evidence to at most 20,000 observations. Choose Replace or filter the CSV before importing.');
  commit(next => { next.evidence = append ? [...next.evidence, ...rows] : rows; }, `${label}: ${rows.length} observations ${append ? 'appended' : 'loaded'}. Saved coach pools kept unchanged.`);
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (action === 'dismiss-error') { clearError(); return; }
  if (action === 'import-plan') { byId('plan-file').click(); return; }
  if (action === 'load-demo') { await loadDemo(false); return; }
  if (!plan) return;
  if (action === 'new-plan') {
    view.branchEditorId = null; view.branchEditorOpen = false; view.draftOpen = false;
    const blank = blankPlan();
    commit(blank, 'Empty coach plan opened. Assign names, roles and pools; confirm the league rule. Undo restores the previous plan.', { example: false, branchId: '', playerId: blank.players[0].id });
    setTab('series');
  } else if (action === 'undo') {
    const previous = undoStack.pop();
    if (!previous) return;
    plan = previous.plan;
    view.example = previous.example;
    view.branchId = previous.branchId;
    view.playerId = previous.playerId;
    view.branchEditorId = null; view.branchEditorOpen = false;
    clearError(); render(); notice('Last plan change undone.');
  } else if (action === 'save-plan') {
    validatePlan(plan);
    download(JSON.stringify(plan, null, 2) + '\n', filename('.reserve.json'), 'application/json');
    clearError(); notice('Plan JSON downloaded, including imported evidence. Open JSON restores the complete preparation.');
  } else if (action === 'handoff') {
    download(handoff(plan), filename('.handoff.md'), 'text/markdown;charset=utf-8');
    clearError(); notice('Markdown handoff downloaded with rules, pool confirmation, allocations, comparisons and notes. Raw evidence stays in JSON.');
  } else if (action === 'select-branch') {
    view.branchId = button.dataset.branch;
    view.branchEditorId = null; view.branchEditorOpen = false;
    clearError(); renderBoard();
    notice(view.branchId ? selectedBranch().name + ' compared. Actual draft unchanged.' : 'Base preparation selected with the actual current draft.');
  } else if (action === 'edit-player' || action === 'select-player') {
    view.playerId = button.dataset.player;
    renderEvidence(); setTab('evidence'); clearError();
    notice(playerById(view.playerId).name + '’s coach pool selected.');
  } else if (action === 'go-evidence') {
    setTab('evidence');
  } else if (action === 'go-series') {
    setTab('series');
  } else if (action === 'open-draft') {
    view.draftOpen = true; renderBoard(); setTab('board');
    byId('current-editor').scrollIntoView({ block: 'start' });
  } else if (action === 'clear-current') {
    commit(next => { next.current = { bans: [], picks: {} }; }, 'Current picks and bans cleared. Comparisons remain saved.');
  } else if (action === 'remove-game') {
    const number = plan.games.length;
    commit(next => { next.games.pop(); next.current = { bans: [], picks: {} }; }, `Game ${number} removed and current draft cleared. Undo restores both.`, { branchId: '' });
  } else if (action === 'apply-branch') {
    const branch = selectedBranch();
    if (!branch) return;
    if (!hasChampion(legalCurrent(branch.player), branch.champion)) throw new Error('Edit this comparison: its champion conflicts with a pool, earlier pick, ban or another locked pick.');
    commit(next => { next.current.picks[branch.player] = branch.champion; }, `${playerById(branch.player).name}’s ${branch.champion} locked in the actual Game ${plan.games.length + 1} draft.`, { branchId: '' });
  } else if (action === 'edit-branch') {
    if (!selectedBranch()) return;
    view.branchEditorId = view.branchId; view.branchEditorOpen = true;
    renderBoard();
    byId('branch-name').focus();
  } else if (action === 'new-branch') {
    view.branchEditorId = null; view.branchEditorOpen = true; renderBoard(); byId('branch-name').focus();
  } else if (action === 'delete-branch') {
    const id = view.branchId;
    view.branchEditorId = null; view.branchEditorOpen = false;
    commit(next => { next.branches = next.branches.filter(b => b.id !== id); }, 'Comparison removed. Actual draft unchanged.', { branchId: '' });
  } else if (action === 'propose-player') {
    propose([view.playerId]);
  } else if (action === 'propose-all') {
    propose(plan.players.map(p => p.id));
  } else if (action === 'confirm-all') {
    commit(next => { for (const p of next.players) p.confirmed = true; }, 'All displayed coach pools confirmed. League rule confirmation stays as saved.');
  } else if (action === 'import-evidence') {
    view.importMode = byId('evidence-import-mode').value;
    byId('evidence-file').click();
  } else if (action === 'load-demo-evidence') {
    view.importMode = byId('evidence-import-mode').value;
    const response = await fetch('./demo-evidence.csv');
    if (!response.ok) throw new Error('Fictional CSV failed to load. Open a local CSV instead.');
    await importEvidence(await response.text(), 'Fictional example CSV');
  }
}

document.addEventListener('click', event => {
  const tab = event.target.closest('[data-tab]');
  if (tab) { setTab(tab.dataset.tab); return; }
  const button = event.target.closest('button[data-action]');
  if (button && !button.disabled) handleAction(button).catch(showError);
});
document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-submit]');
  if (!form) return;
  event.preventDefault();
  try { saveForm(form, event.submitter?.value ?? ''); }
  catch (error) { showError(error); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'branch-player') {
    const champion = byId('branch-champion');
    const previous = champion.value;
    const choices = legalCurrent(event.target.value);
    champion.innerHTML = option('', 'Choose a champion') + choices.map(c => option(c, c, Boolean(previous && championKey(c) === championKey(previous)))).join('');
  } else if (event.target.id === 'evidence-import-mode') view.importMode = event.target.value;
});
document.addEventListener('toggle', event => {
  if (event.target.id === 'current-editor') view.draftOpen = event.target.open;
  if (event.target.id === 'branch-editor') view.branchEditorOpen = event.target.open;
}, true);
document.querySelector('.workspace-nav').addEventListener('keydown', event => {
  const tabs = ['board', 'evidence', 'series'];
  const current = tabs.indexOf(view.tab);
  const index = event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
  if (index >= 0) { event.preventDefault(); setTab(tabs[index], true); }
});

byId('plan-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    let imported;
    try { imported = JSON.parse(await file.text()); }
    catch { throw new Error('This file is not valid JSON. Open a complete plan downloaded with Save JSON.'); }
    validatePlan(imported);
    observations(imported);
    view.branchEditorId = null; view.branchEditorOpen = false; view.draftOpen = false;
    commit(imported, file.name + ' loaded. Complete preparation and evidence restored in this browser.', { example: false, branchId: imported.branches[0]?.id ?? '', playerId: imported.players[0].id });
    setTab('board');
  } catch (error) { showError(error); }
  finally { event.target.value = ''; }
});
byId('evidence-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { await importEvidence(await file.text(), file.name); }
  catch (error) { showError(error); }
  finally { event.target.value = ''; }
});

loadDemo(true);
