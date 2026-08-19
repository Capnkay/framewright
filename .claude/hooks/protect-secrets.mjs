// protect-secrets.mjs
//
// LAW — PreToolUse[Write|Edit] guard. Denies writing real-looking credentials
// to disk, and denies writing to paths that are secrets by convention (.env
// files, a secrets/ folder, .pem/.key files) regardless of content.
//
// Placeholders (YOUR_KEY_HERE, xxx, example.com, etc.) are allowed through:
// a matched string is only treated as a real secret if it does NOT also look
// like a placeholder.
//
// CARVE-OUT (this is the fix this file exists to make): the source chassis
// version of this hook denies ANY write to a path matching ".env(.*)?" with
// no exceptions — which also denies writing ".env.example" itself, even
// though ".env.example" is a required, tracked, scored deliverable
// (docs/CONTRACT.md section 14: "`.env.example` must be tracked"). That is
// a bug, not a feature: a template file that documents placeholder shapes is
// not a secret. This version allows writes to ".env.example", ".env.sample",
// and ".env.template" ONLY after they pass BOTH of the following, in order:
//   1. The same real-secret content scan every other file gets
//      (SECRET_CONTENT_PATTERNS below).
//   2. A stricter check specific to env-template files: every "KEY=value"
//      line's right-hand side must itself look like a placeholder (a
//      YOUR_-style token, or one of the sanctioned local/example hosts —
//      localhost, 127.0.0.1, *.example.com, *.local — per the same allowed
//      hosts docs/CONTRACT.md section 14 sanctions for the tracked repo).
// A real-looking value on either check still denies the write, even inside
// ".env.example" — the carve-out is for the FILE, never for real secrets.
//
// FAIL-CLOSED ON MALFORMED STDIN: this hook reads stdin itself instead of
// relying on the shared _lib.mjs readHookInput(), which by design degrades
// ANY unparsable stdin (empty OR malformed) to `{}` and therefore allows the
// call through when there is nothing to check. That is correct for
// genuinely empty stdin, but wrong for non-empty, non-JSON stdin — garbled
// input is exactly the situation a fail-closed guard exists for. See
// readHookInputStrict() below: empty stdin still degrades to `{}` (pass
// nothing to check, same as upstream); non-empty-but-unparsable stdin throws
// instead, which failClosed() turns into a deny.
//
// Wrapped in failClosed: any internal error here (a bad regex, an unreadable
// file, malformed stdin) denies instead of silently letting the write
// through. Under --dangerously-skip-permissions this hook — not a human —
// is the last check before a key lands in the repo.

import fs from 'node:fs';
import { allow, deny, failClosed } from './_lib.mjs';

// See the FAIL-CLOSED ON MALFORMED STDIN note above.
function readHookInputStrict() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    // No stdin at all to read (e.g. no pipe). Treat as genuinely empty.
    return {};
  }
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('malformed (non-empty, non-JSON) stdin: ' + (err && err.message ? err.message : String(err)));
  }
}

// Paths that are secrets by convention — denied outright, no content check
// needed, EXCEPT the three documented template names below, which fall
// through to the content checks instead (see the carve-out note above).
const SECRET_PATH_RULES = [
  { re: /(^|\/)\.env(\.[^/]+)?$/, label: '.env file' },
  { re: /(^|\/)secrets\//, label: 'secrets/ directory' },
  { re: /\.pem$/i, label: '.pem private-key file' },
  { re: /\.key$/i, label: '.key private-key file' },
];

const ENV_TEMPLATE_RE = /(^|\/)\.env\.(example|sample|template)$/;

// Content patterns for real-looking secrets. Order matters: more specific
// patterns (Anthropic, Stripe) are checked before the generic ones so the
// reported label is the useful one — deny() exits on first match.
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
    /(API_KEY|SECRET|TOKEN)\s*=\s*['"][A-Za-z0-9_-]{20,}['"]/i,
  ],
];

// If the matched text also looks like a placeholder, it's not a real secret.
const PLACEHOLDER_RE =
  /YOUR[_-]|placeholder|xxx|\.\.\.|<[^>]+>|example\.com|changeme|change_me|dummy|redacted|fake[_-]?key|not[_-]?a[_-]?real|sample/i;

function isPlaceholder(matchedText) {
  return PLACEHOLDER_RE.test(matchedText);
}

// Sanctioned local/example hosts (docs/CONTRACT.md section 14) — an
// env-template right-hand side pointing at one of these is a placeholder,
// even though it isn't a YOUR_-style token.
const ALLOWED_HOST_VALUE_RE =
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|([a-z0-9-]+\.)?example\.com|([a-z0-9-]+\.)*[a-z0-9-]+\.local)(:\d+)?(\/[^\s]*)?$/i;

// mongodb://localhost... and similar connection-string shapes pointed at a
// sanctioned local host also count as a placeholder value.
const ALLOWED_CONNECTION_STRING_RE = /^[a-z][a-z0-9+.-]*:\/\/(localhost|127\.0\.0\.1)([:/][^\s]*)?$/i;

function isPlaceholderValue(rawValue) {
  const v = String(rawValue).trim().replace(/^["']|["']$/g, '');
  if (v === '') return true;
  if (isPlaceholder(v)) return true;
  if (ALLOWED_HOST_VALUE_RE.test(v)) return true;
  if (ALLOWED_CONNECTION_STRING_RE.test(v)) return true;
  return false;
}

// Checks every "KEY=value" line of an env-template file's content. Returns
// the offending line, or null if every line is placeholder-shaped.
function findNonPlaceholderEnvLine(content) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue; // not a KEY=value line — nothing to check
    const [, key, rhs] = m;
    if (!isPlaceholderValue(rhs)) return { key, line: trimmed };
  }
  return null;
}

await failClosed(async () => {
  // Disclosed self-test affordance: forces a throw so failClosed can be
  // proven without editing this file. Only ever forces deny.
  if (process.env.HOOK_SELFTEST_THROW) {
    throw new Error('selftest: forced internal failure');
  }

  const input = readHookInputStrict();
  const ti = input.tool_input || {};
  const filePath = ti.file_path;

  let isEnvTemplate = false;

  if (filePath) {
    const norm = String(filePath).replace(/\\/g, '/');
    isEnvTemplate = ENV_TEMPLATE_RE.test(norm);

    for (const rule of SECRET_PATH_RULES) {
      if (!rule.re.test(norm)) continue;
      if (rule.label === '.env file' && isEnvTemplate) {
        // Carve-out: fall through to the content checks below instead of
        // denying outright.
        break;
      }
      return deny(`protect-secrets: write targets a secret-by-convention path (${rule.label}): ${filePath}`);
    }
  }

  // What's actually being written: Write's `content`, or Edit's `new_string`.
  let content = '';
  if (typeof ti.content === 'string') content += ti.content + '\n';
  if (typeof ti.new_string === 'string') content += ti.new_string + '\n';

  if (isEnvTemplate) {
    // Env templates get the extra line-by-line placeholder-shape check,
    // in addition to (not instead of) the generic content scan below.
    const bad = findNonPlaceholderEnvLine(content);
    if (bad) {
      return deny(
        `protect-secrets: ${filePath} is an env template, but "${bad.key}" does not have a placeholder-shaped ` +
          `value ("${bad.line}"). Env templates may only contain placeholder values ` +
          `(YOUR_..., localhost/127.0.0.1/example.com/.local, or empty).`,
      );
    }
  }

  if (!content) return allow();

  for (const [label, re] of SECRET_CONTENT_PATTERNS) {
    const m = content.match(re);
    if (m && !isPlaceholder(m[0])) {
      return deny(
        `protect-secrets: possible ${label} in the content being written` +
          (filePath ? ` (${filePath})` : '') +
          '. If this is a placeholder, make it look like one (e.g. YOUR_KEY_HERE).',
      );
    }
  }

  return allow();
});
