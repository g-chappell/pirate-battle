import type { CollectionRules } from "@pirate-battle/shared";

import {
  CollectionRulesParseError,
  isValidPolicyId,
  parseCollectionRules,
} from "./collectionRulesParser.js";
import type {
  CollectionRecord,
  CollectionStore,
  CollectionUpsertChange,
} from "./collectionStore.js";

export interface RegisterCollectionInput {
  policyId: string;
  name: string;
  rulesPath: string;
  dryRun?: boolean;
}

export type RegisterCollectionOutcome = CollectionUpsertChange | "dry_run";

export interface RegisterCollectionResult {
  policyId: string;
  name: string;
  rules: CollectionRules;
  outcome: RegisterCollectionOutcome;
  wouldChange?: CollectionUpsertChange;
}

export interface RegisterCollectionDeps {
  store: CollectionStore;
  readFile: (path: string) => Promise<string>;
}

export class RegisterCollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterCollectionError";
  }
}

export async function registerCollection(
  deps: RegisterCollectionDeps,
  input: RegisterCollectionInput,
): Promise<RegisterCollectionResult> {
  const policyId = input.policyId.toLowerCase();
  if (!isValidPolicyId(policyId)) {
    throw new RegisterCollectionError(
      `--policy must be a 56-char hex string (got length ${input.policyId.length})`,
    );
  }
  const name = input.name.trim();
  if (name.length === 0) {
    throw new RegisterCollectionError("--name must be a non-empty string");
  }

  let raw: string;
  try {
    raw = await deps.readFile(input.rulesPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RegisterCollectionError(`failed to read --rules file: ${msg}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RegisterCollectionError(`--rules file is not valid JSON: ${msg}`);
  }

  let rules: CollectionRules;
  try {
    rules = parseCollectionRules(parsedJson);
  } catch (err) {
    if (err instanceof CollectionRulesParseError) {
      throw new RegisterCollectionError(`invalid rules: ${err.message}`);
    }
    throw err;
  }

  const record: CollectionRecord = { policyId, name, rules };

  if (input.dryRun) {
    const existing = await deps.store.listAll();
    const found = existing.find((r) => r.policyId.toLowerCase() === policyId);
    return {
      policyId,
      name,
      rules,
      outcome: "dry_run",
      wouldChange: found ? "updated" : "created",
    };
  }

  const result = await deps.store.upsertOne(record);
  return {
    policyId: result.record.policyId,
    name: result.record.name,
    rules: result.record.rules,
    outcome: result.change,
  };
}
