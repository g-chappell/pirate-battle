import { readFile } from "node:fs/promises";

import { prisma } from "@pirate-battle/db";

import { PrismaCollectionStore } from "../src/cardano/collectionStore.js";
import { RegisterCollectionError, registerCollection } from "../src/cardano/registerCollection.js";

interface ParsedArgv {
  policy: string;
  name: string;
  rules: string;
  dryRun: boolean;
}

const USAGE = `Usage: register-collection --policy <id> --name <text> --rules <jsonFile> [--dry-run]

Registers (creates or updates) a Collection row keyed by policyId.

Arguments:
  --policy <id>       56-char hex Cardano policy id
  --name <text>       Human-readable collection name
  --rules <jsonFile>  Path to a JSON file matching the CollectionRules schema
  --dry-run           Validate inputs without writing to the database
`;

export function parseArgv(argv: readonly string[]): ParsedArgv {
  const out: Partial<ParsedArgv> = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.info(USAGE);
      process.exit(0);
    }
    const eqIdx = arg.indexOf("=");
    const key = eqIdx >= 0 ? arg.slice(0, eqIdx) : arg;
    const inlineValue = eqIdx >= 0 ? arg.slice(eqIdx + 1) : undefined;
    const takeValue = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new RegisterCollectionError(`${key} requires a value`);
      }
      i += 1;
      return next;
    };
    switch (key) {
      case "--policy":
        out.policy = takeValue();
        break;
      case "--name":
        out.name = takeValue();
        break;
      case "--rules":
        out.rules = takeValue();
        break;
      default:
        throw new RegisterCollectionError(`unknown argument: ${arg}`);
    }
  }
  if (!out.policy) throw new RegisterCollectionError("--policy is required");
  if (!out.name) throw new RegisterCollectionError("--name is required");
  if (!out.rules) throw new RegisterCollectionError("--rules is required");
  return out as ParsedArgv;
}

async function main(): Promise<void> {
  let parsed: ParsedArgv;
  try {
    parsed = parseArgv(process.argv.slice(2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[register-collection] ${msg}\n\n${USAGE}`);
    process.exit(2);
  }

  const store = new PrismaCollectionStore(prisma);
  const result = await registerCollection(
    { store, readFile: (p) => readFile(p, "utf8") },
    {
      policyId: parsed.policy,
      name: parsed.name,
      rulesPath: parsed.rules,
      dryRun: parsed.dryRun,
    },
  );

  if (result.outcome === "dry_run") {
    console.info(
      `[register-collection] dry-run OK — would ${result.wouldChange ?? "write"} ${result.policyId} (${result.name})`,
    );
  } else {
    console.info(`[register-collection] ${result.outcome} ${result.policyId} (${result.name})`);
  }
}

main()
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[register-collection] failed: ${msg}`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
