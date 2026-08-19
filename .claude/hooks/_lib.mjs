// _lib.mjs — shared helpers for every hook in this repository.
//
// Hooks are law. A hook must never exit 0 on its own failure.
//
// This is the one file every other hook imports from. It only uses Node
// builtins (fs, path) so it runs the same on Windows, macOS, and Linux — no
// shell-specific behavior lives here. It has no path back to any other
// project: this repository is self-contained.
//
// Claude Code's hook contract, in plain terms:
//   - PreToolUse hooks decide whether a tool call is allowed, asked-about,
//     or denied. Denying means exit code 2 with a reason on stderr.
//   - "ask" is a softer outcome than deny: it hands the decision back to the
//     normal permission prompt instead of hard-blocking. That needs a
//     specific JSON shape on stdout (see ask() below).
//   - SessionStart/UserPromptSubmit hooks can hand Claude extra context by
//     printing a JSON shape on stdout and exiting 0.
//   - Stop hooks can block the session from ending by exiting 2, or just
//     print something informational and exit 0.

import fs from 'node:fs';
import path from 'node:path';

// --- reading the tool call -------------------------------------------------

// Read and JSON.parse stdin. Degrades to {} on genuinely EMPTY stdin only —
// a hook must never crash just because stdin was empty (this happens on
// Windows more than people expect). Non-empty, non-parsable stdin is a
// different case: see readHookInputStrict() in individual hook files, which
// deliberately does NOT degrade that case to {} — malformed-but-non-empty
// input fails closed instead.
export function readHookInput() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    // Cannot read stdin at all. Anomalous -- deny.
    deny('hook input unreadable — failing closed');
  }
  // Genuinely empty stdin is legitimate (a hook invoked with no payload).
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Non-empty but unparsable. Something is wrong with the payload, and a
    // hook that cannot see what it is being asked to allow must not allow it.
    // This is the whole point of failing closed: an attacker or a corrupted
    // executor payload must never buy a free pass by being malformed.
    deny('hook input present but unparsable — failing closed');
  }
}

// Where the project root is, per Claude Code's own environment variable,
// falling back to the current working directory if that's ever unset.
export function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// --- outcomes ---------------------------------------------------------------

// Let the tool call proceed. The default outcome — no output, exit 0.
export function allow() {
  process.exit(0);
}

// Hard-block a PreToolUse tool call. Prints the reason to stderr (Claude
// sees this and can react to it) and exits 2, which Claude Code treats as a
// block.
export function deny(reason) {
  process.stderr.write(String(reason) + '\n');
  process.exit(2);
}

// Ask the human instead of hard-blocking. This is for things that are
// sometimes fine and sometimes not. Uses the permission-decision JSON shape
// Claude Code expects on stdout; exit 0 because "ask" hands control to the
// normal approval prompt rather than blocking outright.
export function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: String(reason),
      },
    }),
  );
  process.exit(0);
}

// Hand Claude some extra context (used by SessionStart / UserPromptSubmit
// hooks). Prints the JSON shape Claude Code reads as additionalContext and
// exits 0 — nothing here ever blocks anything.
export function context(text, eventName = 'SessionStart') {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: String(text),
      },
    }),
  );
  process.exit(0);
}

// --- the fail-closed wrapper -------------------------------------------------
//
// Wrap a PreToolUse hook body in this. If ANYTHING inside throws — a bad
// regex, an unreadable file, malformed input the hook deliberately rejects —
// the hook denies instead of quietly exiting 0. Fail-open is not an option
// here: whenever permissions are loosened (a passive run, a
// --dangerously-skip-permissions session), these hooks are the only thing
// standing between a bad tool call and the disk.
//
// SOFT hooks (SessionStart, Stop) do NOT use this wrapper. This repository
// does not currently ship any SOFT hooks; failClosed is for LAW hooks only.
export async function failClosed(fn) {
  try {
    await fn();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    deny('hook error, failing closed: ' + msg);
  }
}
