import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PiperTTS } from "../../src/tts/piper.js";

describe("PiperTTS", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends text to piper server and returns audio buffer", async () => {
    const audioData = new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer;
    const mockResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(audioData),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse
    );

    const tts = new PiperTTS({ url: "http://localhost:5000" });
    const result = await tts.synthesize("hello");

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(4);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:5000/api/tts",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello" }),
      })
    );
  });

  it("throws on non-ok response", async () => {
    const mockResponse = {
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse
    );

    const tts = new PiperTTS({ url: "http://localhost:5000" });
    await expect(tts.synthesize("hello")).rejects.toThrow(
      "Piper TTS failed: 503 Service Unavailable"
    );
  });
});
