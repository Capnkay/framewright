// guard-secret-shell.mjs
//
// LAW — PreToolUse[Bash] guard. Closes a real gap: protect-secrets.mjs only
// matches the Write and Edit tools, so any secret written through a shell
// command — a redirect, a heredoc, `tee`, or git plumbing that hides a
// tracked file from future status checks — currently passes every existing
// hook untouched. This hook is the check that sees the shell path.
//
// Denies:
//   1. A shell redirect (`>`, `>>`) or `tee` whose target is a
//      secret-by-convention path: .env (any variant EXCEPT the tracked
//      .env.example / .env.sample / .env.template templates), a secrets/
//      directory, *.pem, or *.key. This also covers heredocs, which reach
//      disk through the same redirect operator (e.g. `cat <<EOF > .env`).
//   2. A credential-shaped literal appearing anywhere in the command text —
//      the same pattern family protect-secrets.mjs uses for Write/Edit
//      content, applied here to the command string itself (a secret typed
//      straight into `curl -H "Authorization: Bearer sk-..."` never touches
//      Write or Edit at all). Placeholders pass, exactly as they do there.
//   3. `git add -f` / `git add --force` targeting a secret-by-convention
//      path — the entire point of -f is overriding .gitignore, and a
//      secret-by-convention path is gitignored on purpose.
//   4. `git update-index --skip-worktree` or `--assume-unchanged` targeting
//      a secret-by-convention path — both hide a tracked file's future
//      changes from `git status`, which is a documented way to quietly
//      re-introduce a secret after the other checks have been satisfied
//      once.
//
// FAIL-CLOSED ON MALFORMED STDIN: reads stdin directly instead of the shared
// _lib.mjs readHookInput(), for the same reason protect-secrets.mjs does —
// see that file's header comment. Genuinely empty stdin still degrades to
// `{}` (nothing to check); non-empty, non-JSON stdin throws, which
// failClosed() turns into a deny instead of silently allowing the command.
//
// Wrapped in failClosed: any internal error here denies instead of silently
// letting the command run.

import fs from 'node:fs';
import { allow, deny, failClosed } from './_lib.mjs';

function readHookInputStrict() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return {};
  }
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('malformed (non-empty, non-JSON) stdin: ' + (err && err.message ? err.message : String(err)));
  }
}

// --- secret-by-convention paths, same family as protect-secrets.mjs --------

const ENV_TEMPLATE_RE = /(^|\/)\.env\.(example|sample|template)$/;

function isSecretPath(rawPath) {
  const norm = String(rawPath).replace(/\\/g, '/').replace(/^["']|["']$/g, '');
  if (ENV_TEMPLATE_RE.test(norm)) return false;
  if (/(^|\/)\.env(\.[^/]+)?$/.test(norm)) return true;
  if (/(^|\/)secrets\//.test(norm)) return true;
  if (/\.pem$/i.test(norm)) return true;
  if (/\.key$/i.test(norm)) return true;
  return false;
}

// --- credential-shaped literals, same family as protect-secrets.mjs --------

const SECRET_CONTENT_PATTERNS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Stripe live/test secret key', /(sk|pk)_(live|test)_[A-Za-z0-9]{20,}/],
  ['GitHub token', /gh[po]_[A-Za-z0-9]{36,}/],
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /sk-(proj-)?[A-Za-z0-9_-]{20,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT', /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/],
  [
    'generic API key / secret / token assignment',
    /(API_KEY|SECRET|TOKEN)\s*=\s*['"]?[A-Za-z0-9_-]{20,}['"]?/i,
  ],
];

const PLACEHOLDER_RE =
  /YOUR[_-]|placeholder|xxx|\.\.\.|<[^>]+>|example\.com|changeme|change_me|dummy|redacted|fake[_-]?key|not[_-]?a[_-]?real|sample/i;

function isPlaceholder(matchedText) {
  return PLACEHOLDER_RE.test(matchedText);
}

// --- redirect / tee target extraction ---------------------------------------

function redirectTargets(cmd) {
  const targets = [];
  const redirRe = />>?\s*"?'?([^\s"'|;&<>]+)"?'?/g;
  let m;
  while ((m = redirRe.exec(cmd))) targets.push(m[1]);
  const teeRe = /\btee\b(\s+-a)?\s+"?'?([^\s"'|;&]+)"?'?/gi;
  while ((m = teeRe.exec(cmd))) targets.push(m[2]);
  return targets;
}

// --- git add -f / git update-index --skip-worktree|--assume-unchanged ------

function segmentsOf(cmd) {
  return cmd.split(/[;&|\n]+/);
}

function gitAddForceSecretPath(cmd) {
  for (const seg of segmentsOf(cmd)) {
    if (!/\bgit\s+add\b/.test(seg)) continue;
    const tokens = seg.trim().split(/\s+/).filter(Boolean);
    const hasForce = tokens.some((t) => t === '-f' || t === '--force' || /^-[a-z]*f[a-z]*$/i.test(t));
    if (!hasForce) continue;
    const pathArgs = tokens.slice(1).filter((t) => !t.startsWith('-'));
    if (pathArgs.some((p) => isSecretPath(p))) return true;
  }
  return false;
}

function gitUpdateIndexHideSecretPath(cmd) {
  for (const seg of segmentsOf(cmd)) {
    if (!/\bgit\s+update-index\b/.test(seg)) continue;
    if (!/--skip-worktree\b|--assume-unchanged\b/.test(seg)) continue;
    const tokens = seg.trim().split(/\s+/).filter(Boolean);
    const pathArgs = tokens.slice(1).filter((t) => !t.startsWith('-'));
    if (pathArgs.some((p) => isSecretPath(p))) return true;
  }
  return false;
}

await failClosed(async () => {
  if (process.env.HOOK_SELFTEST_THROW) throw new Error('selftest: forced internal failure');

  const input = readHookInputStrict();
  const cmd = input && input.tool_input && input.tool_input.command;
  if (!cmd) return allow();
  const cmdStr = String(cmd);

  for (const target of redirectTargets(cmdStr)) {
    if (isSecretPath(target)) {
      return deny(`guard-secret-shell: shell redirect/tee writes into a secret-by-convention path: ${target}`);
    }
  }

  for (const [label, re] of SECRET_CONTENT_PATTERNS) {
    const m = cmdStr.match(re);
    if (m && !isPlaceholder(m[0])) {
      return deny(
        `guard-secret-shell: possible ${label} appears in the command text. ` +
          'If this is a placeholder, make it look like one (e.g. YOUR_KEY_HERE).',
      );
    }
  }

  if (gitAddForceSecretPath(cmdStr)) {
    return deny('guard-secret-shell: git add -f targeting a secret-by-convention path (this overrides .gitignore)');
  }

  if (gitUpdateIndexHideSecretPath(cmdStr)) {
    return deny(
      'guard-secret-shell: git update-index --skip-worktree/--assume-unchanged targeting a secret-by-convention path',
    );
  }

  return allow();
});
