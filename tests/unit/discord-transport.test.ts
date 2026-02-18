import { describe, it, expect, vi } from "vitest";
import { DiscordTransport } from "../../src/transports/discord/transport.js";
import type { Client } from "discord.js";

function createMockChannel(opts: { isTextBased: boolean }) {
  return {
    isTextBased: () => opts.isTextBased,
    send: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockClient(channel: ReturnType<typeof createMockChannel> | null) {
  return {
    channels: {
      fetch: vi.fn().mockResolvedValue(channel),
    },
  } as unknown as Client;
}

describe("DiscordTransport text channel methods", () => {
  describe("sendTextMessage", () => {
    it("fetches channel by ID and calls send() with content", async () => {
      const mockChannel = createMockChannel({ isTextBased: true });
      const mockClient = createMockClient(mockChannel);
      const transport = new DiscordTransport({ client: mockClient });

      await (transport as any).sendTextMessage("123456", "hello");

      expect(mockClient.channels.fetch).toHaveBeenCalledWith("123456");
      expect(mockChannel.send).toHaveBeenCalledWith("hello");
    });

    it("throws if no client is provided", async () => {
      const transport = new DiscordTransport();

      await expect((transport as any).sendTextMessage("123456", "hello")).rejects.toThrow(
        "No Discord client provided"
      );
    });

    it("throws if channel is not found", async () => {
      const mockClient = createMockClient(null);
      const transport = new DiscordTransport({ client: mockClient });

      await expect((transport as any).sendTextMessage("123456", "hello")).rejects.toThrow(
        "Channel not found: 123456"
      );
    });

    it("throws if channel is not text-based", async () => {
      const mockChannel = createMockChannel({ isTextBased: false });
      const mockClient = createMockClient(mockChannel);
      const transport = new DiscordTransport({ client: mockClient });

      await expect((transport as any).sendTextMessage("123456", "hello")).rejects.toThrow(
        "not a text-based channel"
      );
    });
  });

  describe("sendToTextChannel", () => {
    it("sends to configured textChannelId", async () => {
      const mockChannel = createMockChannel({ isTextBased: true });
      const mockClient = createMockClient(mockChannel);
      const transport = new DiscordTransport({
        client: mockClient,
        textChannelId: "999888",
      });

      await transport.sendToTextChannel("hello world");

      expect(mockClient.channels.fetch).toHaveBeenCalledWith("999888");
      expect(mockChannel.send).toHaveBeenCalledWith("hello world");
    });

    it("throws if no textChannelId configured", async () => {
      const mockClient = createMockClient(createMockChannel({ isTextBased: true }));
      const transport = new DiscordTransport({ client: mockClient });

      await expect(transport.sendToTextChannel("hello")).rejects.toThrow(
        "No text channel ID configured"
      );
    });
  });
});
