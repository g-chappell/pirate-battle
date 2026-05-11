import type { APIEmbed, Client } from "discord.js";

export interface ChannelSendSuccess {
  ok: true;
  messageId: string;
  sentAtMs: number;
}

export interface ChannelOpFailure {
  ok: false;
  reason: string;
}

export type ChannelSendResult = ChannelSendSuccess | ChannelOpFailure;

export interface ChannelOpSuccess {
  ok: true;
}

export type ChannelOpResult = ChannelOpSuccess | ChannelOpFailure;

export interface FetchMessageSuccess {
  ok: true;
  sentAtMs: number;
}

export type FetchMessageResult = FetchMessageSuccess | ChannelOpFailure;

export interface ChannelOps {
  sendEmbed(args: { channelId: string; embed: APIEmbed }): Promise<ChannelSendResult>;
  editEmbed(args: {
    channelId: string;
    messageId: string;
    embed: APIEmbed;
  }): Promise<ChannelOpResult>;
  setMessageContent(args: {
    channelId: string;
    messageId: string;
    content: string;
  }): Promise<ChannelOpResult>;
  fetchMessage(args: { channelId: string; messageId: string }): Promise<FetchMessageResult>;
}

export function createDiscordJsChannelOps(client: Client): ChannelOps {
  async function getTextChannel(channelId: string) {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return null;
    if (!("messages" in channel) || !("send" in channel)) return null;
    return channel as unknown as {
      send: (options: { embeds: APIEmbed[] }) => Promise<{ id: string; createdTimestamp: number }>;
      messages: {
        fetch: (id: string) => Promise<{ id: string; createdTimestamp: number }>;
        edit: (
          id: string,
          options: { embeds?: APIEmbed[]; content?: string },
        ) => Promise<{ id: string }>;
      };
    };
  }

  return {
    async sendEmbed({ channelId, embed }) {
      try {
        const channel = await getTextChannel(channelId);
        if (!channel) return { ok: false, reason: "channel_not_text" };
        const sent = await channel.send({ embeds: [embed] });
        return { ok: true, messageId: sent.id, sentAtMs: sent.createdTimestamp };
      } catch (err) {
        return { ok: false, reason: errorReason(err) };
      }
    },
    async editEmbed({ channelId, messageId, embed }) {
      try {
        const channel = await getTextChannel(channelId);
        if (!channel) return { ok: false, reason: "channel_not_text" };
        await channel.messages.edit(messageId, { embeds: [embed] });
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: errorReason(err) };
      }
    },
    async setMessageContent({ channelId, messageId, content }) {
      try {
        const channel = await getTextChannel(channelId);
        if (!channel) return { ok: false, reason: "channel_not_text" };
        await channel.messages.edit(messageId, { content });
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: errorReason(err) };
      }
    },
    async fetchMessage({ channelId, messageId }) {
      try {
        const channel = await getTextChannel(channelId);
        if (!channel) return { ok: false, reason: "channel_not_text" };
        const msg = await channel.messages.fetch(messageId);
        return { ok: true, sentAtMs: msg.createdTimestamp };
      } catch (err) {
        return { ok: false, reason: errorReason(err) };
      }
    },
  };
}

function errorReason(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown_error";
}
