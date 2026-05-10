import type { Affinity, MoveDef, MoveKind } from "@pirate-battle/core";
import type { BaseStats, CollectionRules, StatDelta, TraitRule } from "@pirate-battle/shared";

import { POLICY_ID_HEX_LEN } from "./blockfrost.js";

const AFFINITIES: readonly Affinity[] = ["kraken", "ironclad", "phantom", "bloodborne"];
const MOVE_KINDS: readonly MoveKind[] = ["damage", "status", "buff"];
const STAT_KEYS: readonly (keyof BaseStats)[] = ["hp", "atk", "def", "spd"];

export class CollectionRulesParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectionRulesParseError";
  }
}

function fail(path: string, msg: string): never {
  throw new CollectionRulesParseError(`${path}: ${msg}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFiniteInt(path: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    fail(path, "must be a finite integer");
  }
  return value;
}

function parseBaseStats(path: string, value: unknown): BaseStats {
  if (!isObject(value)) fail(path, "must be an object");
  const out = {} as BaseStats;
  for (const key of STAT_KEYS) {
    const v = requireFiniteInt(`${path}.${key}`, value[key]);
    if (v < 1) fail(`${path}.${key}`, "must be >= 1");
    out[key] = v;
  }
  return out;
}

function parseStatDelta(path: string, value: unknown): StatDelta {
  if (!isObject(value)) fail(path, "must be an object");
  const out: StatDelta = {};
  for (const key of STAT_KEYS) {
    if (value[key] === undefined) continue;
    out[key] = requireFiniteInt(`${path}.${key}`, value[key]);
  }
  return out;
}

function parseAffinity(path: string, value: unknown): Affinity {
  if (typeof value !== "string" || !AFFINITIES.includes(value as Affinity)) {
    fail(path, `must be one of ${AFFINITIES.join("|")}`);
  }
  return value as Affinity;
}

function parseMoveDef(path: string, value: unknown): MoveDef {
  if (!isObject(value)) fail(path, "must be an object");
  if (typeof value.key !== "string" || value.key.length === 0) {
    fail(`${path}.key`, "must be a non-empty string");
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    fail(`${path}.name`, "must be a non-empty string");
  }
  const affinity = parseAffinity(`${path}.affinity`, value.affinity);
  const basePower = requireFiniteInt(`${path}.basePower`, value.basePower);
  if (basePower < 0) fail(`${path}.basePower`, "must be >= 0");
  const accuracy = requireFiniteInt(`${path}.accuracy`, value.accuracy);
  if (accuracy < 0 || accuracy > 100) fail(`${path}.accuracy`, "must be between 0 and 100");
  if (typeof value.kind !== "string" || !MOVE_KINDS.includes(value.kind as MoveKind)) {
    fail(`${path}.kind`, `must be one of ${MOVE_KINDS.join("|")}`);
  }
  const move: MoveDef = {
    key: value.key,
    name: value.name,
    affinity,
    basePower,
    accuracy,
    kind: value.kind as MoveKind,
  };
  if (value.statusEffect !== undefined) {
    if (typeof value.statusEffect !== "string" || value.statusEffect.length === 0) {
      fail(`${path}.statusEffect`, "must be a non-empty string when present");
    }
    move.statusEffect = value.statusEffect;
  }
  if (value.priority !== undefined) {
    move.priority = requireFiniteInt(`${path}.priority`, value.priority);
  }
  return move;
}

function parseMoves(path: string, value: unknown): MoveDef[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length === 0) fail(path, "must contain at least one move");
  return value.map((m, i) => parseMoveDef(`${path}[${i}]`, m));
}

function parseTraitRule(path: string, value: unknown): TraitRule {
  if (!isObject(value)) fail(path, "must be an object");
  const out: TraitRule = {};
  if (value.delta !== undefined) {
    out.delta = parseStatDelta(`${path}.delta`, value.delta);
  }
  if (value.affinity !== undefined) {
    out.affinity = parseAffinity(`${path}.affinity`, value.affinity);
  }
  if (value.moves !== undefined) {
    out.moves = parseMoves(`${path}.moves`, value.moves);
  }
  if (out.delta === undefined && out.affinity === undefined && out.moves === undefined) {
    fail(path, "must define at least one of delta|affinity|moves");
  }
  return out;
}

function parseTraits(path: string, value: unknown): Record<string, Record<string, TraitRule>> {
  if (!isObject(value)) fail(path, "must be an object");
  const out: Record<string, Record<string, TraitRule>> = {};
  for (const traitName of Object.keys(value)) {
    const inner = value[traitName];
    if (!isObject(inner)) fail(`${path}.${traitName}`, "must be an object");
    const innerOut: Record<string, TraitRule> = {};
    for (const traitValue of Object.keys(inner)) {
      innerOut[traitValue] = parseTraitRule(
        `${path}.${traitName}.${traitValue}`,
        inner[traitValue],
      );
    }
    out[traitName] = innerOut;
  }
  return out;
}

export function parseCollectionRules(value: unknown): CollectionRules {
  const path = "rules";
  if (!isObject(value)) fail(path, "must be an object");
  const baseStats = parseBaseStats(`${path}.baseStats`, value.baseStats);
  const baseLevel = requireFiniteInt(`${path}.baseLevel`, value.baseLevel);
  if (baseLevel < 1) fail(`${path}.baseLevel`, "must be >= 1");
  const baseAffinity = parseAffinity(`${path}.baseAffinity`, value.baseAffinity);
  const baseMoves = parseMoves(`${path}.baseMoves`, value.baseMoves);
  const traits = parseTraits(`${path}.traits`, value.traits ?? {});
  return { baseStats, baseLevel, baseAffinity, baseMoves, traits };
}

export function isValidPolicyId(value: string): boolean {
  return value.length === POLICY_ID_HEX_LEN && /^[0-9a-f]+$/i.test(value);
}
