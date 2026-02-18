import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenClawAI } from "../../src/ai/openclaw.js";

describe("OpenClawAI", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends transcription to gateway webhook and returns response", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        text: "  Hello!  ",
      }),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse
    );

    const ai = new OpenClawAI({
      gatewayUrl: "http://localhost:18789",
      token: "test-token",
    });
    const result = await ai.chat("hi");

    expect(result).toBe("Hello!");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:18789/webhook/voice-bridge",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
      })
    );

    const body = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.text).toBe("hi");
    expect(body.userId).toBeDefined();
    expect(body.sessionId).toBeDefined();
  });

  it("creates a new session ID on newSession()", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    const ai = new OpenClawAI({
      gatewayUrl: "http://localhost:18789",
      token: "test-token",
    });

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ text: "ok" }),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse
    );

    await ai.chat("first");
    const firstBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );

    vi.advanceTimersByTime(1000);
    ai.newSession();
    await ai.chat("second");
    const secondBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body
    );

    expect(firstBody.sessionId).not.toBe(secondBody.sessionId);
    vi.useRealTimers();
  });

  it("throws on non-ok response", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: vi.fn().mockResolvedValue("unauthorized"),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse
    );

    const ai = new OpenClawAI({
      gatewayUrl: "http://localhost:18789",
      token: "bad-token",
    });
    await expect(ai.chat("test")).rejects.toThrow(
      "OpenClaw gateway failed: 401 Unauthorized"
    );
  });
});
