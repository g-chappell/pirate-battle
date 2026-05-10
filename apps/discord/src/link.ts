export interface LinkEnv {
  webUrl: string;
  serverUrl: string;
}

export function readLinkEnv(env: NodeJS.ProcessEnv = process.env): LinkEnv {
  const webUrl = env.PIRATE_BATTLE_WEB_URL;
  const serverUrl = env.PIRATE_BATTLE_SERVER_URL;
  if (!webUrl) {
    throw new Error("PIRATE_BATTLE_WEB_URL is required to handle /link");
  }
  if (!serverUrl) {
    throw new Error("PIRATE_BATTLE_SERVER_URL is required to handle /link-claim");
  }
  return { webUrl, serverUrl };
}

export interface LinkInstructions {
  channelReply: string;
}

export function buildLinkInstructions(env: LinkEnv): LinkInstructions {
  const lines = [
    "**Link your Discord account to Pirate-Battle**",
    "",
    `1. Visit ${env.webUrl} and sign in with your Cardano wallet.`,
    "2. Tap **Generate link token** to get a one-time code (valid 15 minutes).",
    "3. Run `/link-claim token:<paste-the-code>` here to finish linking.",
  ];
  return { channelReply: lines.join("\n") };
}

export type ClaimOutcome =
  | { kind: "ok"; userId: string; discordUserId: string }
  | { kind: "error"; reason: string; status: number };

export interface CallLinkClaimArgs {
  serverUrl: string;
  token: string;
  discordUserId: string;
  fetchImpl?: typeof fetch;
}

export async function callLinkClaim(args: CallLinkClaimArgs): Promise<ClaimOutcome> {
  const fetchFn = args.fetchImpl ?? fetch;
  const url = new URL("/api/discord/link-claim", args.serverUrl).toString();
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: args.token, discordUserId: args.discordUserId }),
    });
  } catch {
    return { kind: "error", reason: "network_error", status: 0 };
  }
  const body = await readJson(res);
  if (res.ok && isClaimSuccess(body)) {
    return { kind: "ok", userId: body.userId, discordUserId: body.discordUserId };
  }
  const reason = isErrorBody(body) ? body.error : "unknown_error";
  return { kind: "error", reason, status: res.status };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function isClaimSuccess(
  body: unknown,
): body is { ok: true; userId: string; discordUserId: string } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return b.ok === true && typeof b.userId === "string" && typeof b.discordUserId === "string";
}

function isErrorBody(body: unknown): body is { error: string } {
  if (!body || typeof body !== "object") return false;
  return typeof (body as Record<string, unknown>).error === "string";
}

const UNKNOWN_REASON_MESSAGE =
  "Something went wrong. Try again, and contact an admin if it persists.";

const FRIENDLY_REASONS: Record<string, string> = {
  token_unknown: "That link token wasn't recognised. Generate a fresh one in the web app.",
  token_used: "That link token has already been used. Generate a new one in the web app.",
  token_expired:
    "That link token has expired (15-minute window). Generate a new one in the web app.",
  invalid_token: "Token format looks wrong — copy it directly from the web app.",
  invalid_discord_user_id: "Couldn't read your Discord user id. Try again, or contact an admin.",
  invalid_body: "Bad request — try again, and contact an admin if it keeps failing.",
  conflict:
    "That Discord account is already linked to another captain. Contact an admin to unlink it first.",
  network_error: "Couldn't reach the Pirate-Battle server. Try again in a moment.",
  unknown_error: UNKNOWN_REASON_MESSAGE,
};

export interface ClaimReply {
  channelReply: string;
  dm?: string;
}

export function formatClaimReply(outcome: ClaimOutcome): ClaimReply {
  if (outcome.kind === "ok") {
    return {
      channelReply: "Linked successfully — check your DMs for confirmation.",
      dm: `Your Discord account is now linked to Pirate-Battle account \`${outcome.userId}\`. Set sail, captain!`,
    };
  }
  const friendly = FRIENDLY_REASONS[outcome.reason] ?? UNKNOWN_REASON_MESSAGE;
  return { channelReply: `Link failed: ${friendly}` };
}
