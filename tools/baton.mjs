#!/usr/bin/env node
// tools/baton.mjs — the Baton CLI. See docs/BATON.md for the full protocol.
//
// Zero dependencies outside Node's standard library, ES modules, Node 20 LTS.
// Every command fails loudly and non-zero on a malformed tasks.json, a
// missing directory, or an unreadable file. Nothing here is allowed to
// swallow an error and continue as if it succeeded.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import readline from 'node:readline';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = path.join(REPO_ROOT, '_build');
const TASKS_JSON = path.join(BUILD_DIR, 'tasks.json');
const CLAIMS_DIR = path.join(BUILD_DIR, 'claims');
const LOG_DIR = path.join(BUILD_DIR, 'log');
const STATE_MD = path.join(BUILD_DIR, 'STATE.md');
const TASKS_MD = path.join(BUILD_DIR, 'TASKS.md');
const ME_FILE = path.join(BUILD_DIR, '.me');

const VALID_TRACKS = new Set(['any', 'studio-preview', 'generation', 'api-glassbox', 'perception']);
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const CONTRACT_FILE = 'docs/CONTRACT.md';
// Uncommon control characters used as git log record/field separators — safe
// because real commit subjects and author names essentially never contain them.
const RECORD_SEP = '\x1e';
const UNIT_SEP = '\x1f';

class BatonError extends Error {}

// ---------------------------------------------------------------- helpers --

function fail(message) {
  throw new BatonError(message);
}

function nowIso() {
  return new Date().toISOString();
}

function mustExistDir(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    fail(`required directory is missing: ${label} (${path.relative(REPO_ROOT, dir)}). ` +
      `This repository's _build/ scaffold is incomplete or the working copy is corrupt.`);
  }
}

function readFileSafe(filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    fail(`could not read ${label} (${path.relative(REPO_ROOT, filePath)}): ${err.message}`);
  }
}

// -------------------------------------------------------------- identity ---

function resolveIdentity() {
  if (fs.existsSync(ME_FILE)) {
    let raw;
    try {
      raw = fs.readFileSync(ME_FILE, 'utf8');
    } catch (err) {
      fail(`could not read _build/.me: ${err.message}`);
    }
    const name = raw.trim();
    if (name) return name;
    // _build/.me exists but is empty — fall through to git config, do not guess.
  }

  let gitName = '';
  try {
    gitName = execSync('git config user.name', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString('utf8')
      .trim();
  } catch {
    gitName = '';
  }
  if (gitName) return gitName;

  fail(
    'No identity is configured. Set one before running baton:\n' +
    '  echo "Your Name" > _build/.me\n' +
    'or:\n' +
    '  git config user.name "Your Name"\n' +
    '_build/.me is per-machine and git-ignored; it is never guessed.'
  );
}

// --------------------------------------------------------------- tasks.json

function loadTasks() {
  if (!fs.existsSync(BUILD_DIR)) {
    fail(`required directory is missing: _build/. Run this from the repository root.`);
  }
  if (!fs.existsSync(TASKS_JSON)) {
    fail(`_build/tasks.json is missing.`);
  }
  const raw = readFileSafe(TASKS_JSON, '_build/tasks.json');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(`_build/tasks.json is not valid JSON: ${err.message}`);
  }
  if (!parsed || !Array.isArray(parsed.tasks)) {
    fail(`_build/tasks.json is malformed: expected an object with a "tasks" array.`);
  }
  validateTasks(parsed.tasks);
  return parsed.tasks;
}

function validateTasks(tasks) {
  const idRe = /^T-\d{3}$/;
  const seen = new Set();
  for (const t of tasks) {
    if (!t || typeof t !== 'object') fail('_build/tasks.json contains a non-object task entry.');
    if (typeof t.id !== 'string' || !idRe.test(t.id)) {
      fail(`_build/tasks.json contains a task with a malformed id: ${JSON.stringify(t.id)}`);
    }
    if (seen.has(t.id)) fail(`_build/tasks.json contains a duplicate task id: ${t.id}`);
    seen.add(t.id);
    if (!Array.isArray(t.deps)) fail(`${t.id} has a malformed deps field (must be an array).`);
    if (!VALID_TRACKS.has(t.track)) {
      fail(`${t.id} has an unrecognised track "${t.track}". Valid tracks: ${[...VALID_TRACKS].join(', ')}`);
    }
    if (t.verify !== null && typeof t.verify !== 'string') {
      fail(`${t.id} has a malformed verify field (must be a string or null).`);
    }
  }
  for (const t of tasks) {
    for (const d of t.deps) {
      if (!seen.has(d)) fail(`${t.id} depends on unknown task ${d} — dangling dependency in _build/tasks.json.`);
    }
  }
  // cycle detection
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(tasks.map((t) => [t.id, WHITE]));
  const stack = [];
  function visit(id) {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of byId.get(id).deps) {
      if (color.get(dep) === GRAY) {
        fail(`_build/tasks.json contains a dependency cycle: ${stack.concat(dep).join(' -> ')}`);
      }
      if (color.get(dep) === WHITE) visit(dep);
    }
    stack.pop();
    color.set(id, BLACK);
  }
  for (const t of tasks) {
    if (color.get(t.id) === WHITE) visit(t.id);
  }
}

function taskById(tasks, id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) fail(`No such task: ${id}`);
  return t;
}

// ---------------------------------------------------------------- claims ---

function loadClaims() {
  mustExistDir(CLAIMS_DIR, '_build/claims');
  const map = {};
  const entries = fs.readdirSync(CLAIMS_DIR).filter((f) => f.endsWith('.json'));
  for (const entry of entries) {
    const full = path.join(CLAIMS_DIR, entry);
    const raw = readFileSafe(full, `claim file ${entry}`);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      fail(`_build/claims/${entry} is not valid JSON: ${err.message}`);
    }
    if (!parsed || typeof parsed.taskId !== 'string') {
      fail(`_build/claims/${entry} is malformed: missing taskId.`);
    }
    map[parsed.taskId] = parsed;
  }
  return map;
}

function claimPath(id) {
  return path.join(CLAIMS_DIR, `${id}.json`);
}

function writeClaim(id, claim) {
  mustExistDir(CLAIMS_DIR, '_build/claims');
  fs.writeFileSync(claimPath(id), JSON.stringify(claim, null, 2) + '\n', 'utf8');
}

function isDone(id, claims) {
  return claims[id]?.status === 'done';
}

function isActive(id, claims) {
  return claims[id]?.status === 'active';
}

function depsMet(task, claims) {
  return task.deps.every((d) => isDone(d, claims));
}

function unmetDeps(task, claims) {
  return task.deps.filter((d) => !isDone(d, claims));
}

function staleHours(claim) {
  const claimedAt = Date.parse(claim.claimedAt);
  if (Number.isNaN(claimedAt)) return null;
  return Math.floor((Date.now() - claimedAt) / (60 * 60 * 1000));
}

function pushHint(id, verb) {
  return [
    '',
    `Push this immediately so the claim race window stays seconds, not hours:`,
    `  git add _build/claims/${id}.json`,
    `  git commit -m "${verb} ${id}"`,
    `  git push`,
  ].join('\n');
}

// ------------------------------------------------------------- formatting --

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function fmtDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ------------------------------------------------------------------ next ---

function pickNext(tasks, claims, track) {
  for (const t of tasks) {
    if (isDone(t.id, claims)) continue;
    if (isActive(t.id, claims)) continue;
    if (!depsMet(t, claims)) continue;
    const trackOk = track ? t.track === track : t.track === 'any';
    if (!trackOk) continue;
    return t;
  }
  return null;
}

function printTaskCard(t) {
  const lines = [];
  lines.push(`${t.id} — ${t.title}`);
  lines.push(`  phase: ${t.phase}   track: ${t.track}   size: ${t.size}`);
  lines.push('');
  lines.push('  ================================================================');
  lines.push(`  CONTRACT SECTIONS — READ THESE FIRST: ${t.contract.join(', ')}`);
  lines.push('  ================================================================');
  lines.push('');
  lines.push('  files:');
  if (t.files.length === 0) lines.push('    (none named)');
  for (const f of t.files) lines.push(`    - ${f}`);
  lines.push('');
  lines.push(`  verify: ${t.verify === null ? '(none — documentation/manual task; `done` will ask for a note)' : t.verify}`);
  lines.push('');
  lines.push(`  doneWhen: ${t.doneWhen}`);
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------- STATE.md -

function regenerateBoard(tasks, claims) {
  writeStateMd(tasks, claims);
  writeTasksMd(tasks, claims);
}

function boardData(tasks, claims) {
  const done = [];
  const inFlight = [];
  const blocked = [];
  const nextUp = [];
  const byPhase = {};

  for (const t of tasks) {
    byPhase[t.phase] ??= { total: 0, done: 0 };
    byPhase[t.phase].total += 1;
    if (isDone(t.id, claims)) {
      byPhase[t.phase].done += 1;
      done.push(t);
    } else if (isActive(t.id, claims)) {
      inFlight.push(t);
    } else if (!depsMet(t, claims)) {
      blocked.push(t);
    }
  }

  for (const t of tasks) {
    if (nextUp.length >= 3) break;
    if (isDone(t.id, claims) || isActive(t.id, claims)) continue;
    if (!depsMet(t, claims)) continue;
    nextUp.push(t);
  }

  return { done, inFlight, blocked, nextUp, byPhase };
}

function writeStateMd(tasks, claims) {
  const { done, inFlight, blocked, nextUp, byPhase } = boardData(tasks, claims);
  const lines = [];
  lines.push('# Build state');
  lines.push('');
  lines.push('Generated by `tools/baton.mjs`. Never hand-edit this file — it is overwritten on every `baton done`.');
  lines.push('');
  lines.push('## By phase');
  lines.push('');
  for (const phase of Object.keys(byPhase).sort((a, b) => Number(a) - Number(b))) {
    const { total, done: d } = byPhase[phase];
    lines.push(`- Phase ${phase}: ${d}/${total} done`);
  }
  lines.push('');
  lines.push(`Total: ${done.length}/${tasks.length} done`);
  lines.push('');
  lines.push(`## Done (${done.length})`);
  lines.push('');
  if (done.length === 0) lines.push('(none yet)');
  for (const t of done) {
    const c = claims[t.id];
    lines.push(`- ${t.id} — ${t.title} — done by ${c.who} at ${c.finishedAt ?? '?'}`);
  }
  lines.push('');
  lines.push(`## In flight (${inFlight.length})`);
  lines.push('');
  if (inFlight.length === 0) lines.push('(none)');
  for (const t of inFlight) {
    const c = claims[t.id];
    const hrs = staleHours(c);
    lines.push(`- ${t.id} — held by ${c.who}, ${hrs}h stale — ${t.title}`);
  }
  lines.push('');
  lines.push(`## Next up (${nextUp.length})`);
  lines.push('');
  if (nextUp.length === 0) lines.push('(none available — everything is either done, claimed, or blocked)');
  for (const t of nextUp) {
    lines.push(`- ${t.id} [${t.track}] — ${t.title}`);
  }
  lines.push('');
  lines.push(`## Blocked (${blocked.length})`);
  lines.push('');
  if (blocked.length === 0) lines.push('(none)');
  for (const t of blocked) {
    lines.push(`- ${t.id} — blocked by: ${unmetDeps(t, claims).join(', ')} — ${t.title}`);
  }
  lines.push('');
  fs.writeFileSync(STATE_MD, lines.join('\n'));
}

function writeTasksMd(tasks, claims) {
  const lines = [];
  lines.push('# Tasks');
  lines.push('');
  lines.push('Generated by `tools/baton.mjs` from `_build/tasks.json`. Never hand-edit this file.');
  lines.push('');
  lines.push('| ID | Phase | Track | Status | Title | Contract |');
  lines.push('|---|---|---|---|---|---|');
  for (const t of tasks) {
    let status = 'available';
    if (isDone(t.id, claims)) status = 'done';
    else if (isActive(t.id, claims)) status = `claimed (${claims[t.id].who})`;
    else if (!depsMet(t, claims)) status = 'blocked';
    lines.push(`| ${t.id} | ${t.phase} | ${t.track} | ${status} | ${t.title} | ${t.contract.join(', ')} |`);
  }
  lines.push('');
  fs.writeFileSync(TASKS_MD, lines.join('\n'));
}

// -------------------------------------------------------------- commands ---

// The git hooks only run if core.hooksPath points at .githooks, and that is
// per-clone local config that nothing sets automatically. A teammate who skips
// that setup step gets NO secret scan, NO integrity check, NO claim check and NO
// task-id check -- silently, with everything appearing to work. Warn loudly.
function warnIfHooksNotWired() {
  let configured = '';
  try {
    const r = spawnSync('git', ['config', '--get', 'core.hooksPath'],
      { encoding: 'utf8', windowsHide: true });
    configured = (r.stdout || '').trim();
  } catch { /* git absent -- the caller has bigger problems */ }
  if (configured === '.githooks') return;
  console.log('  !! GIT HOOKS ARE NOT ACTIVE ON THIS MACHINE.');
  console.log('     No secret scan, no integrity check, no claim check on commit.');
  console.log('     Fix it now:  git config core.hooksPath .githooks');
  console.log('');
}

function cmdStatus(tasks, claims) {
  warnIfHooksNotWired();
  const { done, inFlight, blocked, nextUp, byPhase } = boardData(tasks, claims);
  console.log('Framewright — build board\n');
  for (const phase of Object.keys(byPhase).sort((a, b) => Number(a) - Number(b))) {
    const { total, done: d } = byPhase[phase];
    console.log(`  Phase ${phase}: ${d}/${total} done`);
  }
  console.log(`\n  Total: ${done.length}/${tasks.length} done\n`);

  console.log(`DONE (${done.length})`);
  for (const t of done) console.log(`  ${t.id}  ${truncate(t.title, 70)}`);

  console.log(`\nIN FLIGHT (${inFlight.length})`);
  for (const t of inFlight) {
    const c = claims[t.id];
    console.log(`  ${t.id}  held by ${c.who}, ${staleHours(c)}h stale — ${truncate(t.title, 55)}`);
  }

  console.log(`\nNEXT UP (${nextUp.length})`);
  for (const t of nextUp) console.log(`  ${t.id}  [${t.track}]  ${truncate(t.title, 60)}`);

  console.log(`\nBLOCKED (${blocked.length})`);
  for (const t of blocked) {
    console.log(`  ${t.id}  blocked by ${unmetDeps(t, claims).join(', ')} — ${truncate(t.title, 45)}`);
  }
}

function cmdNext(tasks, claims, opts) {
  const track = opts.track ?? null;
  if (track && !VALID_TRACKS.has(track)) {
    fail(`Unknown track "${track}". Valid tracks: ${[...VALID_TRACKS].join(', ')}`);
  }
  const t = pickNext(tasks, claims, track);
  if (!t) {
    console.log(track
      ? `No task is currently available on track "${track}" — everything is done, claimed, or blocked.`
      : `No task is currently available — everything is done, claimed, or blocked. Try a specific --track.`);
    return;
  }
  printTaskCard(t);
}

function cmdClaim(tasks, claims, id, identity) {
  const t = taskById(tasks, id);
  const existing = claims[id];
  if (existing && existing.status === 'active') {
    const hrs = staleHours(existing);
    fail(
      `${id} is already claimed by ${existing.who} (${hrs}h stale). ` +
      `Talk to them, or run \`baton takeover ${id}\` if it is genuinely abandoned.`
    );
  }
  if (existing && existing.status === 'done') {
    fail(`${id} is already done.`);
  }
  const claim = {
    taskId: id,
    who: identity,
    device: os.hostname(),
    claimedAt: nowIso(),
    status: 'active',
    takenFrom: null,
    takenAt: null,
  };
  writeClaim(id, claim);
  console.log(`Claimed ${id} — ${t.title}`);
  console.log(pushHint(id, 'Claim'));
}

function cmdDone(tasks, claims, id, identity) {
  const t = taskById(tasks, id);
  const existing = claims[id];
  if (!existing || existing.status !== 'active' || existing.who !== identity) {
    fail(
      `You do not hold an active claim on ${id}. Run \`baton claim ${id}\` ` +
      `(or \`baton takeover ${id}\` if someone else holds it) first.`
    );
  }

  if (t.verify === null) {
    const note = readOneLineNoteSync(
      `${id} is a documentation/manual task with no verify command.\nOne-line note on what was done: `
    );
    if (!note) {
      fail(`A one-line note is required to close a manual task. Nothing was recorded.`);
    }
    finishTask(t, existing, identity, claims, { note });
    return;
  }

  console.log(`Running verification: ${t.verify}`);
  let output = '';
  try {
    output = execSync(t.verify, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString('utf8') : '';
    const stderr = err.stderr ? err.stderr.toString('utf8') : '';
    console.error(`\nVerification FAILED for ${id}. ${id} is NOT done.\n`);
    if (stdout) console.error('--- stdout ---\n' + stdout);
    if (stderr) console.error('--- stderr ---\n' + stderr);
    fail(`\`${t.verify}\` exited non-zero. The claim on ${id} remains active. Fix the failure and run \`baton done ${id}\` again.`);
  }
  if (output.trim()) console.log(output.trim());
  finishTask(t, existing, identity, claims, {});
}

function finishTask(t, existing, identity, claims, extra) {
  const finishedAt = nowIso();
  const startedAt = existing.claimedAt;
  const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);

  appendJournal(identity, t, { startedAt, finishedAt, durationMs, device: existing.device, ...extra });

  const updated = {
    ...existing,
    status: 'done',
    finishedAt,
    durationMs,
    ...(extra.note ? { note: extra.note } : {}),
  };
  writeClaim(t.id, updated);

  claims[t.id] = updated;
  regenerateBoard(tasksCache, claims);

  console.log(`\n${t.id} marked done. Journal updated, _build/STATE.md and _build/TASKS.md regenerated.`);
  console.log(`Commit and push, with the task id in the message:`);
  console.log(`  git add -A`);
  console.log(`  git commit -m "${t.id}: ${t.title}"`);
  console.log(`  git push`);
}

function appendJournal(who, t, { startedAt, finishedAt, durationMs, device, note }) {
  mustExistDir(LOG_DIR, '_build/log');
  const safeName = who.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const logPath = path.join(LOG_DIR, `${safeName}.md`);
  const isNew = !fs.existsSync(logPath);
  const entryLines = [];
  if (isNew) {
    entryLines.push(`# Journal — ${who}`, '');
  }
  entryLines.push(`## ${t.id} — ${t.title}`);
  entryLines.push(`- Started: ${startedAt}`);
  entryLines.push(`- Finished: ${finishedAt}`);
  entryLines.push(`- Duration: ${fmtDuration(durationMs)}`);
  entryLines.push(`- Device: ${device}`);
  entryLines.push(`- Files: ${t.files.length ? t.files.join(', ') : '(none named)'}`);
  if (note) entryLines.push(`- Note: ${note}`);
  entryLines.push('');
  fs.appendFileSync(logPath, entryLines.join('\n') + '\n');
}

function readOneLineNoteSync(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  process.stdout.write(prompt);
  const fd = 0;
  let buf = Buffer.alloc(0);
  const chunkSize = 1024;
  const chunk = Buffer.alloc(chunkSize);
  try {
    while (true) {
      let bytesRead;
      try {
        bytesRead = fs.readSync(fd, chunk, 0, chunkSize, null);
      } catch (err) {
        if (err.code === 'EAGAIN') continue;
        if (err.code === 'EOF') break;
        throw err;
      }
      if (bytesRead === 0) break;
      buf = Buffer.concat([buf, chunk.subarray(0, bytesRead)]);
      const nl = buf.indexOf(0x0a);
      if (nl !== -1) {
        buf = buf.subarray(0, nl);
        break;
      }
    }
  } finally {
    rl.close();
  }
  return buf.toString('utf8').replace(/\r$/, '').trim();
}

function cmdDrop(tasks, claims, id, identity, opts) {
  const t = taskById(tasks, id);
  const existing = claims[id];
  if (!existing || existing.status !== 'active' || existing.who !== identity) {
    fail(`You do not hold an active claim on ${id}, so there is nothing of yours to drop.`);
  }
  const why = opts.why;
  if (!why || !why.trim()) {
    fail(`\`baton drop ${id}\` requires a reason: baton drop ${id} --why="..."`);
  }
  const updated = { ...existing, status: 'dropped', why: why.trim(), droppedAt: nowIso() };
  writeClaim(id, updated);
  console.log(`Dropped ${id} — ${t.title}\nReason: ${why.trim()}`);
  console.log(pushHint(id, 'Drop'));
}

function cmdTakeover(tasks, claims, id, identity, opts) {
  const t = taskById(tasks, id);
  const existing = claims[id];
  if (!existing || existing.status !== 'active') {
    fail(`${id} is not actively claimed by anyone right now. Use \`baton claim ${id}\` instead.`);
  }
  const hrs = staleHours(existing);
  const claimedAt = Date.parse(existing.claimedAt);
  const staleMs = Number.isNaN(claimedAt) ? Infinity : Date.now() - claimedAt;
  const force = !!opts.force;
  if (staleMs < TWO_HOURS_MS && !force) {
    fail(
      `${id} is held by ${existing.who} and is only ${hrs}h stale (under 2h). ` +
      `Refusing to take it over without --force.`
    );
  }
  const updated = {
    ...existing,
    takenFrom: existing.who,
    takenAt: nowIso(),
    who: identity,
    device: os.hostname(),
    claimedAt: nowIso(),
    status: 'active',
  };
  writeClaim(id, updated);
  console.log(`Took over ${id} from ${existing.who} (was ${hrs}h stale) — ${t.title}`);
  console.log(pushHint(id, 'Takeover'));
}

function cmdWho(tasks, claims, identity) {
  const held = Object.values(claims).filter((c) => c.who === identity && c.status === 'active');
  if (held.length === 0) {
    console.log(`${identity} holds nothing right now.`);
    return;
  }
  console.log(`${identity} holds:`);
  for (const c of held) {
    const t = tasks.find((x) => x.id === c.taskId);
    console.log(`  ${c.taskId}  ${t ? t.title : '(unknown task)'}`);
  }
}

// ------------------------------------------------------------------ sync ---
//
// The whole design point: report ONLY what is relevant to the caller, so
// that silence is trustworthy. Fetch-only — never pulls, merges, or touches
// the working tree or any branch.

function git(args) {
  const res = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (res.error) {
    return { status: 1, stdout: '', stderr: res.error.message };
  }
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function syncMarkerPath(identity) {
  const safe = identity.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return { path: path.join(BUILD_DIR, `.sync-${safe}`), label: `_build/.sync-${safe}` };
}

function writeSyncMarker(marker, sha) {
  mustExistDir(BUILD_DIR, '_build');
  fs.writeFileSync(marker.path, `${sha}\n`, 'utf8');
}

function gitRemotes() {
  const res = git(['remote']);
  if (res.status !== 0) {
    fail(`could not list git remotes: ${(res.stderr || 'unknown error').trim()}`);
  }
  return res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

// Extracts ATX markdown headings ("## 7. Title", "### 5.2 Title") with their
// 1-indexed line numbers from a file at a given revision. Returns null if the
// file cannot be read at that revision.
function extractHeadingsAt(rev, filePath) {
  const res = git(['show', `${rev}:${filePath}`]);
  if (res.status !== 0) return null;
  const headingRe = /^#{1,6}\s+(\d+(?:\.\d+)?)\.?\s+(.*)$/;
  const headings = [];
  const lines = res.stdout.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = headingRe.exec(lines[i]);
    if (m) headings.push({ line: i + 1, section: m[1], text: lines[i].replace(/^#{1,6}\s+/, '').trim() });
  }
  return headings;
}

// Headings are in ascending line order (the file is scanned top to bottom),
// so the last one at or before lineNo is the nearest preceding heading.
function nearestHeadingBefore(headings, lineNo) {
  let best = null;
  for (const h of headings) {
    if (h.line <= lineNo) best = h;
    else break;
  }
  return best;
}

// "§7 R7" -> "7"; "§13.2" -> "13.2"; anything without a §N token -> null.
function sectionTokenFromContract(entry) {
  const m = /§(\d+(?:\.\d+)?)/.exec(entry);
  return m ? m[1] : null;
}

function sectionsRelated(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

// A best-effort "diff hunk header scan": for each 0-context hunk touching
// docs/CONTRACT.md in this commit, find the nearest markdown heading before
// the hunk's start line (in the new file for additions/changes, the old file
// for pure deletions), and collect the distinct sections touched. Returns
// null — meaning "could not reasonably determine" — for a root commit
// (no parent to diff against), an unreadable diff, or a diff with no
// resolvable heading context at all.
function contractHeadingsChangedByCommit(sha) {
  const parentRes = git(['rev-parse', `${sha}^`]);
  if (parentRes.status !== 0) return null;
  const parentRev = parentRes.stdout.trim();

  const diffRes = git(['diff', '--unified=0', parentRev, sha, '--', CONTRACT_FILE]);
  if (diffRes.status !== 0) return null;

  const hunkRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  const hunks = [];
  for (const line of diffRes.stdout.split(/\r?\n/)) {
    const m = hunkRe.exec(line);
    if (m) {
      hunks.push({
        oldStart: Number(m[1]),
        newStart: Number(m[3]),
        newCount: m[4] === undefined ? 1 : Number(m[4]),
      });
    }
  }
  if (hunks.length === 0) return null;

  const newHeadings = extractHeadingsAt(sha, CONTRACT_FILE);
  const oldHeadings = extractHeadingsAt(parentRev, CONTRACT_FILE);

  const sections = new Set();
  const texts = new Set();
  let found = false;
  for (const h of hunks) {
    const heading = h.newCount > 0 && newHeadings
      ? nearestHeadingBefore(newHeadings, h.newStart)
      : (oldHeadings ? nearestHeadingBefore(oldHeadings, h.oldStart) : null);
    if (heading) {
      sections.add(heading.section);
      texts.add(heading.text);
      found = true;
    }
  }
  return found ? { sections, texts } : null;
}

// Parses `git log <from>..<to> --name-only` into structured commits. Newest
// first, matching git's default order.
function commitsInRange(fromRef, toRef) {
  const res = git(['log', `${fromRef}..${toRef}`, '--name-only', `--pretty=format:${RECORD_SEP}%H${UNIT_SEP}%an${UNIT_SEP}%s`]);
  if (res.status !== 0) {
    fail(`could not read the commit range ${fromRef}..${toRef}: ${(res.stderr || 'git log failed').trim()}`);
  }
  if (!res.stdout.trim()) return [];
  const chunks = res.stdout.split(RECORD_SEP).filter((c) => c.length > 0);
  const commits = [];
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/);
    const [sha, author, ...subjectParts] = lines[0].split(UNIT_SEP);
    const subject = subjectParts.join(UNIT_SEP);
    const files = lines.slice(1).map((l) => l.trim()).filter(Boolean);
    commits.push({ sha, author, subject, files });
  }
  return commits;
}

function cmdSync(tasks, claims, identity) {
  const remotes = gitRemotes();
  if (!remotes.includes('origin')) {
    console.log(
      'sync: no "origin" remote is configured yet — that is expected before this repository ' +
      'is published, not an error. Nothing to sync.'
    );
    return;
  }

  const fetchRes = git(['fetch', 'origin']);
  if (fetchRes.status !== 0) {
    fail(`git fetch origin failed: ${(fetchRes.stderr || fetchRes.stdout || 'unknown error').trim()}`);
  }

  const headRes = git(['rev-parse', 'HEAD']);
  if (headRes.status !== 0) {
    // A remote exists but nothing has been committed yet. That is the normal
    // state between `git remote add` and the first push -- not an error. Say so
    // and exit clean, the same way the no-origin case does.
    console.log('sync: this repository has no commits yet, so there is nothing to compare against.');
    console.log('      That is expected before the first push. Nothing to sync.');
    return;
  }
  const head = headRes.stdout.trim();

  const originMainRes = git(['rev-parse', 'origin/main']);
  if (originMainRes.status !== 0) {
    fail(`origin/main does not exist on the fetched remote — is "main" the right branch name there?`);
  }
  const originMain = originMainRes.stdout.trim();

  const behindRes = git(['rev-list', '--count', `${head}..${originMain}`]);
  if (behindRes.status !== 0) {
    fail(`could not compute how far behind origin/main this branch is: ${(behindRes.stderr || 'unknown error').trim()}`);
  }
  const behindCount = Number(behindRes.stdout.trim()) || 0;

  const marker = syncMarkerPath(identity);
  let baseSha = null;
  if (fs.existsSync(marker.path)) {
    const raw = readFileSafe(marker.path, marker.label).trim();
    if (raw && git(['cat-file', '-e', `${raw}^{commit}`]).status === 0) {
      baseSha = raw;
    }
    // A marker that exists but is empty or points at an unreachable commit
    // (e.g. history was rewritten) is not trusted — fall through to a fresh
    // merge-base rather than guessing.
  }
  let firstRun = false;
  if (!baseSha) {
    firstRun = true;
    const mb = git(['merge-base', head, originMain]);
    if (mb.status !== 0) {
      fail(`could not compute a merge-base between HEAD and origin/main: ${(mb.stderr || 'unknown error').trim()}`);
    }
    baseSha = mb.stdout.trim();
  }

  const heldTasks = Object.values(claims)
    .filter((c) => c.who === identity && c.status === 'active')
    .map((c) => tasks.find((t) => t.id === c.taskId))
    .filter(Boolean);

  const newCommits = commitsInRange(baseSha, originMain);

  const lines = [];
  lines.push(
    `sync: fetched origin.` +
    (firstRun ? ' First sync recorded for this identity — comparing from the merge-base of HEAD and origin/main.' : '')
  );
  lines.push(`  ${behindCount} commit${behindCount === 1 ? '' : 's'} behind origin/main.`);

  const staleClaims = Object.values(claims).filter((c) => {
    if (c.status !== 'active') return false;
    const claimedAt = Date.parse(c.claimedAt);
    if (Number.isNaN(claimedAt)) return false;
    return Date.now() - claimedAt > TWO_HOURS_MS;
  });
  if (staleClaims.length === 0) {
    lines.push(`  No claim held by anyone is more than 2h stale.`);
  } else {
    lines.push(`  Stale claims (>2h), any holder:`);
    for (const c of staleClaims) {
      lines.push(`    - ${c.taskId} — held by ${c.who}, ${staleHours(c)}h stale`);
    }
  }

  if (heldTasks.length === 0) {
    lines.push('');
    lines.push(`sync: you hold no active task, so there is nothing else to check. Run \`baton next\` to pick one up.`);
    console.log(lines.join('\n'));
    writeSyncMarker(marker, originMain);
    return;
  }

  const heldIds = heldTasks.map((t) => t.id);
  lines.push('');
  lines.push(`Checking what changed since your last sync against what you hold (${heldIds.join(', ')}):`);

  let foundSomething = false;

  // (a) commits that touched a file belonging to a task the caller holds.
  for (const t of heldTasks) {
    const fileSet = new Set(t.files);
    const hits = newCommits
      .map((c) => ({ c, touched: c.files.filter((f) => fileSet.has(f)) }))
      .filter((x) => x.touched.length > 0);
    if (hits.length === 0) continue;
    foundSomething = true;
    lines.push('');
    lines.push(`  ${t.id} — files you hold were touched:`);
    for (const { c, touched } of hits) {
      lines.push(`    - ${c.sha.slice(0, 10)} "${c.subject}" by ${c.author} — touched: ${touched.join(', ')}`);
    }
  }

  // (b) docs/CONTRACT.md commits, filtered to sections the held tasks reference.
  const contractCommits = newCommits.filter((c) => c.files.includes(CONTRACT_FILE));
  if (contractCommits.length > 0) {
    const heldSections = [];
    for (const t of heldTasks) {
      for (const entry of t.contract) {
        const token = sectionTokenFromContract(entry);
        if (token) heldSections.push({ task: t, entry, token });
      }
    }
    for (const c of contractCommits) {
      const changed = contractHeadingsChangedByCommit(c.sha);
      if (changed === null) {
        foundSomething = true;
        lines.push('');
        lines.push(
          `  docs/CONTRACT.md changed by ${c.sha.slice(0, 10)} "${c.subject}" by ${c.author} — ` +
          `could not determine which section from the diff. You hold task(s) with contract ` +
          `references (${heldIds.join(', ')}) — check it directly.`
        );
        continue;
      }
      const matches = heldSections.filter((hs) => [...changed.sections].some((s) => sectionsRelated(s, hs.token)));
      if (matches.length === 0) continue;
      foundSomething = true;
      lines.push('');
      lines.push(`  docs/CONTRACT.md changed by ${c.sha.slice(0, 10)} "${c.subject}" by ${c.author}:`);
      const seen = new Set();
      for (const m of matches) {
        const key = `${m.task.id}:${m.entry}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(`    - ${m.task.id} references ${m.entry} — section changed: ${[...changed.texts].join('; ')}`);
      }
    }
  }

  // (c) a held task claimed or completed by someone else, per origin/main.
  for (const t of heldTasks) {
    const remoteRes = git(['show', `${originMain}:_build/claims/${t.id}.json`]);
    if (remoteRes.status !== 0) continue; // not on the remote yet — nothing to compare
    let remoteClaim;
    try {
      remoteClaim = JSON.parse(remoteRes.stdout);
    } catch {
      continue; // unreadable remote claim — nothing safe to report
    }
    if (remoteClaim.who === identity) continue;
    if (remoteClaim.status === 'done') {
      foundSomething = true;
      lines.push('');
      lines.push(`  CONFLICT — ${t.id} is marked done on origin/main by ${remoteClaim.who}, but you hold it locally.`);
    } else if (remoteClaim.status === 'active') {
      foundSomething = true;
      lines.push('');
      lines.push(`  CONFLICT — ${t.id} is claimed on origin/main by ${remoteClaim.who}, but you hold it locally.`);
    }
  }

  if (!foundSomething) {
    lines.push('');
    lines.push(`sync: up to date, nothing affecting ${heldIds.join(', ')}.`);
  }

  console.log(lines.join('\n'));
  writeSyncMarker(marker, originMain);
}

// -------------------------------------------------------------- arg parse --

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) {
        flags[arg.slice(2)] = true;
      } else {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

// ------------------------------------------------------------------- main --

let tasksCache = null;

function main() {
  const argv = process.argv.slice(2);
  const { positional, flags } = parseArgs(argv);
  const [command, arg1] = positional;

  if (!command) {
    console.error(
      'Usage: baton <status|next|claim|done|drop|takeover|who|sync> [args]\nSee docs/BATON.md.'
    );
    process.exitCode = 1;
    return;
  }

  const tasks = loadTasks();
  tasksCache = tasks;

  switch (command) {
    case 'status': {
      const claims = loadClaims();
      cmdStatus(tasks, claims);
      return;
    }
    case 'next': {
      const claims = loadClaims();
      cmdNext(tasks, claims, { track: flags.track ?? null });
      return;
    }
    case 'claim': {
      if (!arg1) fail('Usage: baton claim <id>');
      const claims = loadClaims();
      const identity = resolveIdentity();
      cmdClaim(tasks, claims, arg1, identity);
      return;
    }
    case 'done': {
      if (!arg1) fail('Usage: baton done <id>');
      const claims = loadClaims();
      const identity = resolveIdentity();
      cmdDone(tasks, claims, arg1, identity);
      return;
    }
    case 'drop': {
      if (!arg1) fail('Usage: baton drop <id> --why="..."');
      const claims = loadClaims();
      const identity = resolveIdentity();
      cmdDrop(tasks, claims, arg1, identity, { why: flags.why });
      return;
    }
    case 'takeover': {
      if (!arg1) fail('Usage: baton takeover <id> [--force]');
      const claims = loadClaims();
      const identity = resolveIdentity();
      cmdTakeover(tasks, claims, arg1, identity, { force: !!flags.force });
      return;
    }
    case 'who': {
      const claims = loadClaims();
      const identity = resolveIdentity();
      cmdWho(tasks, claims, identity);
      return;
    }
    case 'sync': {
      const claims = loadClaims();
      const identity = resolveIdentity();
      cmdSync(tasks, claims, identity);
      return;
    }
    default:
      fail(`Unknown command: ${command}\nUsage: baton <status|next|claim|done|drop|takeover|who|sync> [args]`);
  }
}

function runCli() {
  try {
    main();
  } catch (err) {
    if (err instanceof BatonError) {
      console.error(`baton: ${err.message}`);
    } else {
      console.error(`baton: unexpected error: ${err.stack || err.message}`);
    }
    process.exitCode = 1;
  }
}

// Only run the CLI when this file is executed directly (`node tools/baton.mjs ...`),
// not when it is imported — e.g. by a test harness exercising regenerateBoard's
// determinism directly.
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli();
}

export { loadTasks, loadClaims, regenerateBoard, validateTasks };
