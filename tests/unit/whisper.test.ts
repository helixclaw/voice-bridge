import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WhisperSTT } from "../../src/stt/whisper.js";

describe("WhisperSTT", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends audio to whisper server and returns transcription", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ text: "  hello world  " }),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse
    );

    const stt = new WhisperSTT({ url: "http://localhost:8080" });
    const result = await stt.transcribe(Buffer.from("audio-data"));

    expect(result).toBe("hello world");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/inference",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on non-ok response", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse
    );

    const stt = new WhisperSTT({ url: "http://localhost:8080" });
    await expect(stt.transcribe(Buffer.from("audio"))).rejects.toThrow(
      "Whisper STT failed: 500 Internal Server Error"
    );
  });

  it("strips trailing slash from URL", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ text: "test" }),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse
    );

    const stt = new WhisperSTT({ url: "http://localhost:8080/" });
    await stt.transcribe(Buffer.from("audio"));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/inference",
      expect.anything()
    );
  });
});
