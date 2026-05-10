import { describe, expect, it } from "vitest";

import { InMemoryCollectionStore } from "./collectionStore.js";
import {
  RegisterCollectionError,
  registerCollection,
  type RegisterCollectionDeps,
} from "./registerCollection.js";

const VALID_POLICY = "a".repeat(56);

const VALID_RULES_JSON = JSON.stringify({
  baseStats: { hp: 70, atk: 50, def: 50, spd: 50 },
  baseLevel: 5,
  baseAffinity: "kraken",
  baseMoves: [
    {
      key: "tide_surge",
      name: "Tide Surge",
      affinity: "kraken",
      basePower: 65,
      accuracy: 100,
      kind: "damage",
    },
  ],
  traits: {},
});

function makeDeps(opts: {
  initial?: ConstructorParameters<typeof InMemoryCollectionStore>[0];
  files?: Record<string, string>;
  readFile?: RegisterCollectionDeps["readFile"];
}): { deps: RegisterCollectionDeps; store: InMemoryCollectionStore } {
  const store = new InMemoryCollectionStore(opts.initial);
  const readFile =
    opts.readFile ??
    (async (path: string) => {
      const file = opts.files?.[path];
      if (file === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return file;
    });
  return { deps: { store, readFile }, store };
}

describe("registerCollection", () => {
  it("creates a new collection when none exists for the policy", async () => {
    const { deps, store } = makeDeps({ files: { "rules.json": VALID_RULES_JSON } });

    const result = await registerCollection(deps, {
      policyId: VALID_POLICY,
      name: "Order of the Kraken",
      rulesPath: "rules.json",
    });

    expect(result.outcome).toBe("created");
    expect(result.policyId).toBe(VALID_POLICY);
    expect(result.name).toBe("Order of the Kraken");
    expect(result.rules.baseStats.hp).toBe(70);

    const all = await store.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe("Order of the Kraken");
  });

  it("updates an existing collection (upsert by policyId)", async () => {
    const { deps, store } = makeDeps({
      initial: [
        {
          policyId: VALID_POLICY,
          name: "Old Name",
          rules: {
            baseStats: { hp: 50, atk: 50, def: 50, spd: 50 },
            baseLevel: 1,
            baseAffinity: "kraken",
            baseMoves: [
              {
                key: "x",
                name: "X",
                affinity: "kraken",
                basePower: 10,
                accuracy: 100,
                kind: "damage",
              },
            ],
            traits: {},
          },
        },
      ],
      files: { "rules.json": VALID_RULES_JSON },
    });

    const result = await registerCollection(deps, {
      policyId: VALID_POLICY,
      name: "Renamed",
      rulesPath: "rules.json",
    });

    expect(result.outcome).toBe("updated");
    const all = await store.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe("Renamed");
    expect(all[0]?.rules.baseStats.hp).toBe(70);
  });

  it("normalises policyId to lowercase before lookup", async () => {
    const { deps, store } = makeDeps({ files: { "rules.json": VALID_RULES_JSON } });

    const upperPolicy = VALID_POLICY.toUpperCase();
    const result = await registerCollection(deps, {
      policyId: upperPolicy,
      name: "MixedCase",
      rulesPath: "rules.json",
    });

    expect(result.policyId).toBe(VALID_POLICY);
    const all = await store.listAll();
    expect(all[0]?.policyId).toBe(VALID_POLICY);
  });

  it("dry-run does not mutate the store", async () => {
    const { deps, store } = makeDeps({ files: { "rules.json": VALID_RULES_JSON } });

    const result = await registerCollection(deps, {
      policyId: VALID_POLICY,
      name: "Preview",
      rulesPath: "rules.json",
      dryRun: true,
    });

    expect(result.outcome).toBe("dry_run");
    expect(result.wouldChange).toBe("created");
    expect(await store.listAll()).toHaveLength(0);
  });

  it("dry-run reports 'updated' when the policy already exists", async () => {
    const { deps } = makeDeps({
      initial: [
        {
          policyId: VALID_POLICY,
          name: "Existing",
          rules: {
            baseStats: { hp: 50, atk: 50, def: 50, spd: 50 },
            baseLevel: 1,
            baseAffinity: "kraken",
            baseMoves: [
              {
                key: "x",
                name: "X",
                affinity: "kraken",
                basePower: 10,
                accuracy: 100,
                kind: "damage",
              },
            ],
            traits: {},
          },
        },
      ],
      files: { "rules.json": VALID_RULES_JSON },
    });

    const result = await registerCollection(deps, {
      policyId: VALID_POLICY,
      name: "Existing",
      rulesPath: "rules.json",
      dryRun: true,
    });

    expect(result.wouldChange).toBe("updated");
  });

  it("rejects an invalid policy id", async () => {
    const { deps } = makeDeps({ files: { "rules.json": VALID_RULES_JSON } });
    await expect(
      registerCollection(deps, {
        policyId: "not-hex",
        name: "n",
        rulesPath: "rules.json",
      }),
    ).rejects.toThrow(RegisterCollectionError);
  });

  it("rejects empty --name", async () => {
    const { deps } = makeDeps({ files: { "rules.json": VALID_RULES_JSON } });
    await expect(
      registerCollection(deps, {
        policyId: VALID_POLICY,
        name: "   ",
        rulesPath: "rules.json",
      }),
    ).rejects.toThrow(/--name/);
  });

  it("wraps unreadable file errors", async () => {
    const { deps } = makeDeps({ files: {} });
    await expect(
      registerCollection(deps, {
        policyId: VALID_POLICY,
        name: "n",
        rulesPath: "missing.json",
      }),
    ).rejects.toThrow(/failed to read --rules file/);
  });

  it("wraps invalid JSON", async () => {
    const { deps } = makeDeps({ files: { "rules.json": "{not json" } });
    await expect(
      registerCollection(deps, {
        policyId: VALID_POLICY,
        name: "n",
        rulesPath: "rules.json",
      }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("wraps schema-validation failures with field path", async () => {
    const broken = JSON.stringify({
      baseStats: { hp: 70, atk: 50, def: 50, spd: 50 },
      baseLevel: 1,
      baseAffinity: "ghost",
      baseMoves: [
        {
          key: "x",
          name: "X",
          affinity: "kraken",
          basePower: 10,
          accuracy: 100,
          kind: "damage",
        },
      ],
    });
    const { deps } = makeDeps({ files: { "rules.json": broken } });
    await expect(
      registerCollection(deps, {
        policyId: VALID_POLICY,
        name: "n",
        rulesPath: "rules.json",
      }),
    ).rejects.toThrow(/invalid rules:.*baseAffinity/);
  });
});
