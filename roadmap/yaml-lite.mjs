// yaml-lite.mjs — a minimal YAML subset parser, zero dependencies.
//
// Supports ONLY the features needed for roadmap.yml:
//   - key: value   (string, number, true/false, null)
//   - key: "quoted string"   (double quotes, escape support: \" \\ \n)
//   - key: 'quoted string'   (single quotes)
//   - key: |      (block scalar — preserves newlines, strips common indent)
//   - key: []     (empty inline array)
//   - key:
//       - item    (block-style list of mappings or scalars)
//   - Nested mappings via indentation (2-space indent expected).
//   - # comments (full-line or trailing)
//
// Does NOT support: anchors, refs, tags, flow-style sequences of objects,
// folded scalars, merge keys, explicit document markers, or any advanced YAML.

export function parse(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const ctx = { lines, i: 0 };
  return parseMapping(ctx, 0);
}

function isBlank(s) { return /^\s*(#.*)?$/.test(s); }
function indentOf(s) { return s.match(/^( *)/)[1].length; }
function stripTrailingComment(s) {
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '' || v === '~' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    const inner = v.slice(1, -1);
    if (v[0] === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return inner.replace(/''/g, "'");
  }
  if (v === '[]') return [];
  if (v === '{}') return {};
  if (v.startsWith('[') && v.endsWith(']')) {
    // very simple inline list: [a, b, "c"]
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return splitTopLevel(inner, ',').map((p) => parseScalar(p));
  }
  return v; // plain string
}

function splitTopLevel(s, delim) {
  const out = [];
  let depth = 0, inS = false, inD = false, buf = '';
  for (const c of s) {
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (!inS && !inD) {
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
      else if (c === delim && depth === 0) { out.push(buf); buf = ''; continue; }
    }
    buf += c;
  }
  if (buf.length) out.push(buf);
  return out;
}

function parseBlockScalar(ctx, baseIndent) {
  const out = [];
  while (ctx.i < ctx.lines.length) {
    const raw = ctx.lines[ctx.i];
    if (raw === '') { out.push(''); ctx.i++; continue; }
    const ind = indentOf(raw);
    if (ind <= baseIndent && raw.trim() !== '') break;
    out.push(raw.slice(baseIndent + 2));
    ctx.i++;
  }
  // trim trailing blank lines
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function parseMapping(ctx, indent) {
  const obj = {};
  while (ctx.i < ctx.lines.length) {
    const raw = ctx.lines[ctx.i];
    if (isBlank(raw)) { ctx.i++; continue; }
    const ind = indentOf(raw);
    if (ind < indent) break;
    if (ind > indent) break; // shouldn't happen in a clean document
    const trimmed = stripTrailingComment(raw).slice(indent);
    if (trimmed.startsWith('- ')) break; // caller should handle list
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) { ctx.i++; continue; } // skip malformed
    const key = m[1];
    const rest = m[2];
    ctx.i++;
    if (rest === '|') {
      obj[key] = parseBlockScalar(ctx, indent);
    } else if (rest === '' || rest === undefined) {
      // nested mapping or list
      // look ahead at next non-blank line
      let j = ctx.i;
      while (j < ctx.lines.length && isBlank(ctx.lines[j])) j++;
      if (j >= ctx.lines.length) { obj[key] = null; continue; }
      const nextInd = indentOf(ctx.lines[j]);
      const nextTrim = ctx.lines[j].slice(nextInd);
      if (nextInd > indent && nextTrim.startsWith('- ')) {
        obj[key] = parseList(ctx, nextInd);
      } else if (nextInd > indent) {
        obj[key] = parseMapping(ctx, nextInd);
      } else {
        obj[key] = null;
      }
    } else {
      obj[key] = parseScalar(rest);
    }
  }
  return obj;
}

function parseList(ctx, indent) {
  const arr = [];
  while (ctx.i < ctx.lines.length) {
    const raw = ctx.lines[ctx.i];
    if (isBlank(raw)) { ctx.i++; continue; }
    const ind = indentOf(raw);
    if (ind < indent) break;
    const trimmed = stripTrailingComment(raw).slice(indent);
    if (!trimmed.startsWith('- ')) break;
    const rest = trimmed.slice(2);
    ctx.i++;
    if (rest === '') {
      // block mapping item
      let j = ctx.i;
      while (j < ctx.lines.length && isBlank(ctx.lines[j])) j++;
      if (j < ctx.lines.length && indentOf(ctx.lines[j]) > indent) {
        arr.push(parseMapping(ctx, indentOf(ctx.lines[j])));
      } else {
        arr.push(null);
      }
    } else if (rest.match(/^[A-Za-z_][A-Za-z0-9_]*\s*:/)) {
      // inline first key of a mapping item; parse rest of current line + continuation
      // strategy: splice the rest back in front and reparse as a mapping at indent+2
      ctx.lines[ctx.i - 1] = ' '.repeat(indent + 2) + rest;
      ctx.i--;
      arr.push(parseMapping(ctx, indent + 2));
    } else {
      arr.push(parseScalar(rest));
    }
  }
  return arr;
}
