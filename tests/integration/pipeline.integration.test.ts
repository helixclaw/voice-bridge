import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Readable } from "node:stream";
import { Pipeline } from "../../src/core/pipeline.js";
import { WhisperSTT } from "../../src/stt/whisper.js";
import { PiperTTS } from "../../src/tts/piper.js";
import { OpenClawAI } from "../../src/ai/openclaw.js";
import type { VoiceTransport, UserAudioStream } from "../../src/core/interfaces.js";
import { createMockWhisperServer, type MockWhisperServer } from "../helpers/mock-whisper.js";
import { createMockPiperServer, type MockPiperServer } from "../helpers/mock-piper.js";
import { createMockOpenClawServer, type MockOpenClawServer } from "../helpers/mock-openclaw.js";
import { generateTestPCM } from "../helpers/fixtures.js";

const TOKEN = "pipeline-test-token";

function createMockTransport(): VoiceTransport & {
  _handler: ((ua: UserAudioStream) => void) | null;
  _playedAudio: Buffer[];
} {
  return {
    _handler: null,
    _playedAudio: [],
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    onUserAudio(handler) {
      this._handler = handler;
    },
    async playAudio(audio: Buffer) {
      this._playedAudio.push(audio);
    },
    isConnected: vi.fn().mockReturnValue(true),
  };
}

function createReadableFromBuffer(data: Buffer): Readable {
  return new Readable({
    read() {
      this.push(data);
      this.push(null);
    },
  });
}

describe("Pipeline integration (all mock servers)", () => {
  let whisperMock: MockWhisperServer;
  let piperMock: MockPiperServer;
  let openclawMock: MockOpenClawServer;

  beforeAll(async () => {
    [whisperMock, piperMock, openclawMock] = await Promise.all([
      createMockWhisperServer(),
      createMockPiperServer(),
      createMockOpenClawServer(TOKEN),
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      whisperMock.close(),
      piperMock.close(),
      openclawMock.close(),
    ]);
  });

  it("full happy path: audio → STT → AI → TTS → playback", async () => {
    whisperMock.setResponse("what is the weather");
    openclawMock.setResponse("It's sunny today!");

    const transport = createMockTransport();
    const stt = new WhisperSTT({ url: whisperMock.url });
    const tts = new PiperTTS({ url: piperMock.url });
    const ai = new OpenClawAI({ gatewayUrl: openclawMock.url, token: TOKEN });

    const onTranscription = vi.fn();
    const onAIResponse = vi.fn();

    const pipeline = new Pipeline({
      transport,
      stt,
      tts,
      ai,
      onTranscription,
      onAIResponse,
    });
    pipeline.start();

    const audioStream = createReadableFromBuffer(generateTestPCM(100));
    await pipeline.handleUserAudio({ userId: "test-user", audioStream });

    // Verify each mock received exactly one request
    expect(whisperMock.getRequests().length).toBeGreaterThanOrEqual(1);
    expect(openclawMock.getRequests().length).toBeGreaterThanOrEqual(1);
    expect(piperMock.getRequests().length).toBeGreaterThanOrEqual(1);

    // Verify the AI received the transcription
    const lastOpenClawReq = openclawMock.getRequests().at(-1)!;
    expect(lastOpenClawReq.text).toBe("what is the weather");

    // Verify Piper received the AI response
    const lastPiperReq = piperMock.getRequests().at(-1)!;
    expect(lastPiperReq.text).toBe("It's sunny today!");

    // Verify transport received audio
    expect(transport._playedAudio.length).toBe(1);
    expect(transport._playedAudio[0]).toBeInstanceOf(Buffer);
    expect(transport._playedAudio[0].length).toBeGreaterThan(0);

    // Verify callbacks
    expect(onTranscription).toHaveBeenCalledWith("test-user", "what is the weather");
    expect(onAIResponse).toHaveBeenCalledWith("It's sunny today!");
  });

  it("STT failure propagation", async () => {
    whisperMock.setError(500, "STT crashed");

    const transport = createMockTransport();
    const stt = new WhisperSTT({ url: whisperMock.url });
    const tts = new PiperTTS({ url: piperMock.url });
    const ai = new OpenClawAI({ gatewayUrl: openclawMock.url, token: TOKEN });

    const onError = vi.fn();
    const pipeline = new Pipeline({ transport, stt, tts, ai, onError });
    pipeline.start();

    const audioStream = createReadableFromBuffer(generateTestPCM(100));
    transport._handler?.({ userId: "test-user", audioStream });

    await new Promise((r) => setTimeout(r, 100));
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toContain("500");

    whisperMock.clearError();
  });

  it("AI failure propagation", async () => {
    whisperMock.setResponse("test input");
    openclawMock.setError(500, "AI crashed");

    const transport = createMockTransport();
    const stt = new WhisperSTT({ url: whisperMock.url });
    const tts = new PiperTTS({ url: piperMock.url });
    const ai = new OpenClawAI({ gatewayUrl: openclawMock.url, token: TOKEN });

    const onError = vi.fn();
    const pipeline = new Pipeline({ transport, stt, tts, ai, onError });
    pipeline.start();

    const audioStream = createReadableFromBuffer(generateTestPCM(100));
    transport._handler?.({ userId: "test-user", audioStream });

    await new Promise((r) => setTimeout(r, 100));
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toContain("500");

    openclawMock.clearError();
  });

  it("TTS failure propagation", async () => {
    whisperMock.setResponse("test input");
    openclawMock.setResponse("AI response");
    piperMock.setError(500, "TTS crashed");

    const transport = createMockTransport();
    const stt = new WhisperSTT({ url: whisperMock.url });
    const tts = new PiperTTS({ url: piperMock.url });
    const ai = new OpenClawAI({ gatewayUrl: openclawMock.url, token: TOKEN });

    const onError = vi.fn();
    const pipeline = new Pipeline({ transport, stt, tts, ai, onError });
    pipeline.start();

    const audioStream = createReadableFromBuffer(generateTestPCM(100));
    transport._handler?.({ userId: "test-user", audioStream });

    await new Promise((r) => setTimeout(r, 100));
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toContain("500");

    piperMock.clearError();
  });
});
