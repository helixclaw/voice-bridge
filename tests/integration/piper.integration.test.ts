import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PiperTTS } from "../../src/tts/piper.js";
import { createMockPiperServer, type MockPiperServer } from "../helpers/mock-piper.js";

describe("PiperTTS integration", () => {
  let mock: MockPiperServer;

  beforeAll(async () => {
    mock = await createMockPiperServer();
  });

  afterAll(async () => {
    await mock.close();
  });

  it("synthesizes text via real HTTP to mock server", async () => {
    const tts = new PiperTTS({ url: mock.url });
    const result = await tts.synthesize("hello world");

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(44); // WAV header + some data
    // Verify it's a valid WAV
    expect(result.toString("ascii", 0, 4)).toBe("RIFF");
    expect(result.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("sends correct Content-Type and JSON body", async () => {
    const tts = new PiperTTS({ url: mock.url });
    await tts.synthesize("test message");

    const requests = mock.getRequests();
    const last = requests[requests.length - 1];
    expect(last.text).toBe("test message");
  });

  it("throws on server error", async () => {
    mock.setError(503, "Service Unavailable");

    const tts = new PiperTTS({ url: mock.url });
    await expect(tts.synthesize("hello")).rejects.toThrow(
      "Piper TTS failed: 503"
    );

    mock.clearError();
  });
});
