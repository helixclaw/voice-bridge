import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { Pipeline } from "../../src/core/pipeline.js";
import type {
  VoiceTransport,
  SpeechToText,
  TextToSpeech,
  AIBackend,
  UserAudioStream,
} from "../../src/core/interfaces.js";

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
  const stream = new Readable({
    read() {
      this.push(data);
      this.push(null);
    },
  });
  return stream;
}

describe("Pipeline", () => {
  let transport: ReturnType<typeof createMockTransport>;
  let stt: SpeechToText;
  let tts: TextToSpeech;
  let ai: AIBackend;

  beforeEach(() => {
    transport = createMockTransport();
    stt = { transcribe: vi.fn().mockResolvedValue("hello world") };
    tts = { synthesize: vi.fn().mockResolvedValue(Buffer.from("audio-data")) };
    ai = { chat: vi.fn().mockResolvedValue("Hi there!") };
  });

  it("runs the full pipeline: audio → STT → AI → TTS → playback", async () => {
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

    const audioBuffer = Buffer.from("raw-audio");
    const stream = createReadableFromBuffer(audioBuffer);

    await pipeline.handleUserAudio({ userId: "user-1", audioStream: stream });

    expect(stt.transcribe).toHaveBeenCalledWith(audioBuffer);
    expect(ai.chat).toHaveBeenCalledWith("hello world");
    expect(tts.synthesize).toHaveBeenCalledWith("Hi there!");
    expect(transport._playedAudio).toHaveLength(1);
    expect(transport._playedAudio[0]).toEqual(Buffer.from("audio-data"));
    expect(onTranscription).toHaveBeenCalledWith("user-1", "hello world");
    expect(onAIResponse).toHaveBeenCalledWith("Hi there!");
  });

  it("skips processing when transcription is empty", async () => {
    (stt.transcribe as ReturnType<typeof vi.fn>).mockResolvedValue("");

    const pipeline = new Pipeline({ transport, stt, tts, ai });
    pipeline.start();

    const stream = createReadableFromBuffer(Buffer.from("audio"));
    await pipeline.handleUserAudio({ userId: "user-1", audioStream: stream });

    expect(ai.chat).not.toHaveBeenCalled();
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("skips processing when AI response is empty", async () => {
    (ai.chat as ReturnType<typeof vi.fn>).mockResolvedValue("");

    const pipeline = new Pipeline({ transport, stt, tts, ai });
    pipeline.start();

    const stream = createReadableFromBuffer(Buffer.from("audio"));
    await pipeline.handleUserAudio({ userId: "user-1", audioStream: stream });

    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("skips when already processing", async () => {
    const slowSTT = {
      transcribe: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("text"), 100))
      ),
    };

    const pipeline = new Pipeline({
      transport,
      stt: slowSTT,
      tts,
      ai,
    });

    pipeline.start();

    const stream1 = createReadableFromBuffer(Buffer.from("audio1"));
    const stream2 = createReadableFromBuffer(Buffer.from("audio2"));

    const p1 = pipeline.handleUserAudio({ userId: "u1", audioStream: stream1 });

    // Give the first call time to start
    await new Promise((r) => setTimeout(r, 10));
    expect(pipeline.isProcessing()).toBe(true);

    const p2 = pipeline.handleUserAudio({ userId: "u2", audioStream: stream2 });

    await Promise.all([p1, p2]);

    // Only the first call should have gone through
    expect(slowSTT.transcribe).toHaveBeenCalledTimes(1);
  });

  it("calls onError when pipeline fails", async () => {
    const error = new Error("STT failure");
    (stt.transcribe as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const onError = vi.fn();
    const pipeline = new Pipeline({ transport, stt, tts, ai, onError });
    pipeline.start();

    // Trigger the handler registered with transport
    const stream = createReadableFromBuffer(Buffer.from("audio"));
    transport._handler?.({ userId: "user-1", audioStream: stream });

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 50));

    expect(onError).toHaveBeenCalledWith(error);
  });

  it("skips processing when audio buffer is empty", async () => {
    const pipeline = new Pipeline({ transport, stt, tts, ai });
    pipeline.start();

    const emptyStream = new Readable({
      read() {
        this.push(null);
      },
    });

    await pipeline.handleUserAudio({
      userId: "user-1",
      audioStream: emptyStream,
    });

    expect(stt.transcribe).not.toHaveBeenCalled();
  });
});
