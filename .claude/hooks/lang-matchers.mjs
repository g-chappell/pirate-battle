// lang-matchers.mjs — maps file extensions to language identifiers
// Used by post-edit.mjs to decide which commands to run after a file edit.
//
// Add a new language by:
//   1. Adding its extensions to EXT_TO_LANG
//   2. Adding its commands to DEFAULT_COMMANDS (can be overridden per-project via project.json)

export const EXT_TO_LANG = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
};

// Default commands per language. Project-level overrides in .claude/project.json
// under `commands.typecheck` and `commands.test` take precedence if set.
export const DEFAULT_COMMANDS = {
  typescript: {
    typecheck: 'npx tsc -b',
    test: 'npm test',
  },
  javascript: {
    typecheck: null,
    test: 'npm test',
  },
  python: {
    typecheck: 'mypy .',
    test: 'pytest',
  },
  go: {
    typecheck: 'go vet ./...',
    test: 'go test ./...',
  },
  rust: {
    typecheck: 'cargo check',
    test: 'cargo test',
  },
  java: {
    typecheck: null,
    test: './gradlew test',
  },
  ruby: {
    typecheck: null,
    test: 'bundle exec rspec',
  },
};

export function extOf(filePath) {
  const m = filePath.match(/(\.[a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

export function langOf(filePath) {
  return EXT_TO_LANG[extOf(filePath)] || null;
}
