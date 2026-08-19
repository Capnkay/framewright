// block-dangerous-shell.mjs
//
// LAW — PreToolUse[Bash] guard. Denies shell commands built to hand this
// machine over to someone else's script or to destroy something
// irreplaceable: piping a download straight into a shell/interpreter,
// PowerShell's Invoke-Expression/iex, eval'ing downloaded content, deleting
// a filesystem root or home directory, force-pushing over main/master, and
// disk-format commands.
//
// Deliberately narrow on `rm -rf` / `Remove-Item -Recurse`: it only fires
// when the target IS a root/home/drive-root, never on ordinary project
// cleanup like `rm -rf node_modules` or `rm -rf dist`.
//
// Wrapped in failClosed: any internal error denies instead of silently
// letting the command run.

import { readHookInput, allow, deny, failClosed } from './_lib.mjs';

const SIMPLE_PATTERNS = [
  ['pipe-to-shell (curl | sh/bash)', /curl\s+[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|pwsh|powershell)\b/i],
  ['pipe-to-shell (wget | sh/bash)', /wget\s+[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|pwsh|powershell)\b/i],
  [
    'pipe-to-shell (PowerShell download | iex)',
    /(iwr|invoke-webrequest|invoke-restmethod)\b[^\n|]*\|\s*(iex|invoke-expression)\b/i,
  ],
  ['Invoke-Expression / iex', /\b(invoke-expression|iex)\b\s*[\s(]/i],
  ['disk-format command', /\b(mkfs(\.\w+)?|diskpart|format-volume|clear-disk)\b/i],
  ['format <drive>: command', /\bformat\s+[a-z]:/i],
];

// eval combined with a download command anywhere in the same call — the
// spec's "eval of downloaded content" case, not a blanket ban on eval.
function hasEvalOfDownload(cmd) {
  return /\beval\b/i.test(cmd) && /(curl|wget|\biwr\b|invoke-webrequest|invoke-restmethod)/i.test(cmd);
}

// `rm -rf <target>` where <target> is exactly a root, home, or drive root —
// never a relative project path.
function isRmRfRootOrHome(cmd) {
  const segments = cmd.split(/[;&|\n]+/);
  for (const seg of segments) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const base = tokens[0].replace(/^.*[\\/]/, '');
    if (base !== 'rm') continue;

    const hasForce = tokens.some((t) => /^-[a-z]*f[a-z]*$/i.test(t) || t === '--force');
    const hasRecursive = tokens.some((t) => /^-[a-z]*r[a-z]*$/i.test(t) || t === '--recursive');
    if (!hasForce || !hasRecursive) continue;

    const targets = tokens.slice(1).filter((t) => !t.startsWith('-'));
    for (const raw of targets) {
      const t = raw.replace(/^["']|["']$/g, '');
      if (t === '/' || t === '~' || t === '$HOME' || /^[A-Za-z]:[\\/]?$/.test(t) || /^\/[A-Za-z]\/?$/.test(t)) {
        return true;
      }
    }
  }
  return false;
}

// PowerShell's equivalent: Remove-Item -Recurse against a bare drive root.
function isRemoveItemDriveRoot(cmd) {
  if (!/remove-item/i.test(cmd)) return false;
  if (!/-recurse\b/i.test(cmd)) return false;
  return /[A-Za-z]:[\\/](?=\s|["'`]|$)/.test(cmd);
}

// git push --force (or -f) where the target is main/master, or no branch is
// named at all (which pushes whatever's currently checked out).
function isForcePushToMainOrMaster(cmd) {
  if (!/git\s+push/i.test(cmd)) return false;
  if (!/(--force(-with-lease)?\b|(^|\s)-f(\s|$))/i.test(cmd)) return false;
  if (/\b(main|master)\b/i.test(cmd)) return true;
  return /git\s+push\s+(--force(-with-lease)?|-f)\s*(origin)?\s*$/i.test(cmd.trim());
}

await failClosed(async () => {
  if (process.env.HOOK_SELFTEST_THROW) throw new Error('selftest: forced internal failure');

  const input = readHookInput();
  const cmd = input && input.tool_input && input.tool_input.command;
  if (!cmd) return allow();

  for (const [label, re] of SIMPLE_PATTERNS) {
    if (re.test(cmd)) return deny(`block-dangerous-shell: ${label} matched in command`);
  }
  if (hasEvalOfDownload(cmd)) {
    return deny('block-dangerous-shell: eval combined with a download command (curl/wget/iwr)');
  }
  if (isRmRfRootOrHome(cmd)) {
    return deny('block-dangerous-shell: rm -rf targeting a filesystem root or home directory');
  }
  if (isRemoveItemDriveRoot(cmd)) {
    return deny('block-dangerous-shell: Remove-Item -Recurse targeting a drive root');
  }
  if (isForcePushToMainOrMaster(cmd)) {
    return deny('block-dangerous-shell: git push --force against main/master');
  }

  return allow();
});
