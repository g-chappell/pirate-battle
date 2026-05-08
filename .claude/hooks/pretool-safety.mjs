#!/usr/bin/env node
// pretool-safety.mjs — PreToolUse hook scoped to Bash.
//
// Blocks (exit 2 with message) a short list of unambiguously-destructive
// commands that no autonomous cycle or interactive session should ever
// need. Not a comprehensive security sandbox — defence in depth on top of
// the settings.json deny-list.
//
// Wired into .claude/settings.json as:
//   { "matcher": "Bash", "hooks": [{ "type": "command",
//     "command": "node .claude/hooks/pretool-safety.mjs" }] }
//
// Exit 0: allow the command.
// Exit 2: block it (Claude Code surfaces the stderr message to the user).

import { readFileSync } from 'node:fs';

function readStdinSync() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parsePayload() {
  const raw = readStdinSync();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function block(reason) {
  process.stderr.write(`[pretool-safety] BLOCKED: ${reason}\n`);
  process.exit(2);
}

const payload = parsePayload();
const cmd = payload?.tool_input?.command;
if (typeof cmd !== 'string' || !cmd) process.exit(0);

// Split the command into "likely-command" chunks at unquoted shell
// statement separators: `;`, `&&`, `||`, `|`, `\n`, and subshell
// boundaries. Any match INSIDE a quoted string stays attached to its
// chunk but is marked as quoted so we don't flag it.
//
// This is a heuristic — a full POSIX shell parser would be safer, but
// the goal is to distinguish "git commit -m '... git push --force ...'"
// (the flagged pattern is inside a heredoc / quote, harmless) from
// "git push --force origin main" (actually destructive). Tracking quote
// balance from line start to match position catches the common cases
// without blocking every commit message or echo that mentions a
// dangerous phrase.
function isInsideQuotes(str, pos) {
  let single = 0;
  let double = 0;
  let backtick = 0;
  for (let i = 0; i < pos; i++) {
    const c = str[i];
    if (c === '\\') { i++; continue; }
    if (c === "'" && double % 2 === 0 && backtick % 2 === 0) single++;
    else if (c === '"' && single % 2 === 0 && backtick % 2 === 0) double++;
    else if (c === '`' && single % 2 === 0 && double % 2 === 0) backtick++;
  }
  return (single % 2 === 1) || (double % 2 === 1) || (backtick % 2 === 1);
}

function firstUnquotedMatch(str, re) {
  re.lastIndex = 0;
  let m;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = g.exec(str)) !== null) {
    if (!isInsideQuotes(str, m.index)) return m;
    if (m.index === g.lastIndex) g.lastIndex++;
  }
  return null;
}

// 1. git push --force / -f targeting main|master|HEAD.
const pushMatch = firstUnquotedMatch(
  cmd,
  /\bgit\s+push\b[^;&|\n]*?(?:--force(?:-with-lease)?|(?<!\w)-f\b)[^;&|\n]*?\b(main|master|HEAD)\b/,
);
if (pushMatch) block(`force-push to main/master/HEAD: ${cmd}`);

// 2. git reset --hard naming main|master|HEAD.
const resetMatch = firstUnquotedMatch(
  cmd,
  /\bgit\s+reset\s+--hard\s*(?:origin\/)?(main|master|HEAD)\b/,
);
if (resetMatch) block(`destructive reset to main/master/HEAD: ${cmd}`);

// 3. rm -rf / or rm -rf $HOME.
const rmRoot = firstUnquotedMatch(
  cmd,
  /\brm\s+(?:-rf|-fr|-r\s+-f|-f\s+-r)\s+\/(?:\s|$)/,
);
if (rmRoot) block(`rm -rf /: ${cmd}`);
const rmHome = firstUnquotedMatch(
  cmd,
  /\brm\s+(?:-rf|-fr|-r\s+-f|-f\s+-r)\s+(?:\$HOME|~)\b/,
);
if (rmHome) block(`rm -rf $HOME: ${cmd}`);

// 4. git config --global.
const gcMatch = firstUnquotedMatch(cmd, /\bgit\s+config\s+--global\b/);
if (gcMatch) block(`git config --global: ${cmd}`);

// 5. Redirection writes to .env / secrets/** (bash-driven, beyond the
//    Write/Edit deny-list). Detected on the unquoted portion only.
const envWrite = firstUnquotedMatch(
  cmd,
  />\s*(?:\.\/)?\.env(?:\.local)?\b/,
);
if (envWrite) block(`write to .env file: ${cmd}`);
const secretsWrite = firstUnquotedMatch(
  cmd,
  />\s*(?:\.\/)?secrets\/\S+/,
);
if (secretsWrite) block(`write to secrets/: ${cmd}`);

process.exit(0);
