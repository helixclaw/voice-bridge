import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { Pipeline } from "../../src/core/pipeline.js";
import type {
  VoiceTransport,
  SpeechToText,
  TextToSpeech,
  AIBackend,
  DualResponse,
  UserAudioStream,
} from "../../src/core/interfaces.js";

function createMockTransport(options?: {
  sendToTextChannel?: ReturnType<typeof vi.fn>;
}): VoiceTransport & {
  _handler: ((ua: UserAudioStream) => void) | null;
  _playedAudio: Buffer[];
} {
  const base: VoiceTransport & {
    _handler: ((ua: UserAudioStream) => void) | null;
    _playedAudio: Buffer[];
  } = {
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
  if (options?.sendToTextChannel) {
    base.sendToTextChannel = options.sendToTextChannel;
  }
  return base;
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
    ai = { chat: vi.fn().mockResolvedValue({ text: "Hi there!", voice: "Hi there!" }) };
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
    expect(onAIResponse).toHaveBeenCalledWith({ text: "Hi there!", voice: "Hi there!" });
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
    (ai.chat as ReturnType<typeof vi.fn>).mockResolvedValue({ text: "", voice: "" });

    const pipeline = new Pipeline({ transport, stt, tts, ai });
    pipeline.start();

    const stream = createReadableFromBuffer(Buffer.from("audio"));
    await pipeline.handleUserAudio({ userId: "user-1", audioStream: stream });

    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("queues audio received during processing and processes it after", async () => {
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

    // This should be queued, not dropped
    const p2 = pipeline.handleUserAudio({ userId: "u2", audioStream: stream2 });

    await Promise.all([p1, p2]);

    // Wait for the queued drain to complete (fire-and-forget)
    await new Promise((r) => setTimeout(r, 250));

    // Both utterances should have been processed
    expect(slowSTT.transcribe).toHaveBeenCalledTimes(2);
    expect(transport._playedAudio).toHaveLength(2);
  });

  it("keeps only the most recent queued utterance (depth 1)", async () => {
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
    const stream3 = createReadableFromBuffer(Buffer.from("audio3"));

    const p1 = pipeline.handleUserAudio({ userId: "u1", audioStream: stream1 });

    await new Promise((r) => setTimeout(r, 10));
    expect(pipeline.isProcessing()).toBe(true);

    // Queue stream2, then replace it with stream3
    pipeline.handleUserAudio({ userId: "u2", audioStream: stream2 });
    pipeline.handleUserAudio({ userId: "u3", audioStream: stream3 });

    await p1;

    // Wait for the queued item to also complete
    await new Promise((r) => setTimeout(r, 250));

    // stream1 + stream3 processed, stream2 was replaced
    expect(slowSTT.transcribe).toHaveBeenCalledTimes(2);
    // Verify stream3 was the one processed (not stream2)
    expect(slowSTT.transcribe).toHaveBeenNthCalledWith(2, Buffer.from("audio3"));
  });

  it("drains queue even when first utterance hits early return", async () => {
    const slowSTT = {
      transcribe: vi.fn()
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve(""), 100))
        )
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve("valid text"), 50))
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

    await new Promise((r) => setTimeout(r, 10));

    // Queue stream2 while stream1 is processing
    pipeline.handleUserAudio({ userId: "u2", audioStream: stream2 });

    await p1;

    // Wait for queued item to complete
    await new Promise((r) => setTimeout(r, 200));

    // First call returned empty transcription (early return), but second still processed
    expect(slowSTT.transcribe).toHaveBeenCalledTimes(2);
    expect(ai.chat).toHaveBeenCalledTimes(1);
    expect(ai.chat).toHaveBeenCalledWith("valid text");
    expect(transport._playedAudio).toHaveLength(1);
  });

  it("resets processing state and drains queue after error", async () => {
    const sttError = new Error("STT failure");
    const slowSTT = {
      transcribe: vi.fn()
        .mockImplementationOnce(
          () => new Promise((_, reject) => setTimeout(() => reject(sttError), 100))
        )
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve("text"), 50))
        ),
    };

    const onError = vi.fn();
    const pipeline = new Pipeline({
      transport,
      stt: slowSTT,
      tts,
      ai,
      onError,
    });

    pipeline.start();

    const stream1 = createReadableFromBuffer(Buffer.from("audio1"));
    const stream2 = createReadableFromBuffer(Buffer.from("audio2"));

    // Trigger via transport handler so onError gets called
    transport._handler?.({ userId: "u1", audioStream: stream1 });

    await new Promise((r) => setTimeout(r, 10));

    // Queue stream2 while stream1 is processing
    transport._handler?.({ userId: "u2", audioStream: stream2 });

    // Wait for both to complete
    await new Promise((r) => setTimeout(r, 400));

    expect(onError).toHaveBeenCalledWith(sttError);
    // Second utterance should still be processed despite first erroring
    expect(slowSTT.transcribe).toHaveBeenCalledTimes(2);
    expect(transport._playedAudio).toHaveLength(1);
    expect(pipeline.isProcessing()).toBe(false);
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

  describe("dual response", () => {
    it("sends voice variant to TTS and both variants to onAIResponse", async () => {
      (ai.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: "Here is the detailed explanation with code...",
        voice: "Here's a quick summary.",
      });

      const onAIResponse = vi.fn();
      const pipeline = new Pipeline({
        transport,
        stt,
        tts,
        ai,
        onAIResponse,
      });
      pipeline.start();

      const stream = createReadableFromBuffer(Buffer.from("audio"));
      await pipeline.handleUserAudio({ userId: "u1", audioStream: stream });

      expect(tts.synthesize).toHaveBeenCalledWith("Here's a quick summary.");
      expect(onAIResponse).toHaveBeenCalledWith({
        text: "Here is the detailed explanation with code...",
        voice: "Here's a quick summary.",
      });
    });

    it("calls sendToTextChannel with text variant when available", async () => {
      (ai.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: "detailed response",
        voice: "brief response",
      });

      const sendToTextChannel = vi.fn().mockResolvedValue(undefined);
      const transportWithText = {
        ...createMockTransport(),
        sendToTextChannel,
      };

      const pipeline = new Pipeline({
        transport: transportWithText,
        stt,
        tts,
        ai,
      });
      pipeline.start();

      const stream = createReadableFromBuffer(Buffer.from("audio"));
      await pipeline.handleUserAudio({ userId: "u1", audioStream: stream });

      expect(sendToTextChannel).toHaveBeenCalledWith("detailed response");
    });

    it("uses text for TTS when voice is empty", async () => {
      (ai.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: "only text available",
        voice: "",
      });

      const pipeline = new Pipeline({ transport, stt, tts, ai });
      pipeline.start();

      const stream = createReadableFromBuffer(Buffer.from("audio"));
      await pipeline.handleUserAudio({ userId: "u1", audioStream: stream });

      expect(tts.synthesize).toHaveBeenCalledWith("only text available");
    });

    it("skips sendToTextChannel when not defined on transport", async () => {
      (ai.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: "detailed",
        voice: "brief",
      });

      // transport does not have sendToTextChannel - should not throw
      const pipeline = new Pipeline({ transport, stt, tts, ai });
      pipeline.start();

      const stream = createReadableFromBuffer(Buffer.from("audio"));
      await expect(
        pipeline.handleUserAudio({ userId: "u1", audioStream: stream })
      ).resolves.toBeUndefined();

      expect(tts.synthesize).toHaveBeenCalledWith("brief");
    });
  });

  describe("TTS error handling", () => {
    it("falls back to text channel when TTS synthesis fails", async () => {
      const sendToTextChannel = vi.fn().mockResolvedValue(undefined);
      const transportWithText = createMockTransport({ sendToTextChannel });
      const failingTts = {
        synthesize: vi.fn().mockRejectedValue(new Error("Piper down")),
      };

      const pipeline = new Pipeline({
        transport: transportWithText,
        stt,
        tts: failingTts,
        ai,
      });
      pipeline.start();

      const stream = createReadableFromBuffer(Buffer.from("audio"));
      await pipeline.handleUserAudio({ userId: "user-1", audioStream: stream });

      expect(failingTts.synthesize).toHaveBeenCalledWith("Hi there!");
      expect(transportWithText._playedAudio).toHaveLength(0);
      // Called once for normal text delivery, once for TTS fallback
      expect(sendToTextChannel).toHaveBeenCalledWith("Hi there!");
      expect(pipeline.isProcessing()).toBe(false);
    });

    it("falls back to text channel when playback fails", async () => {
      const sendToTextChannel = vi.fn().mockResolvedValue(undefined);
      const transportWithText = createMockTransport({ sendToTextChannel });
      transportWithText.playAudio = vi
        .fn()
        .mockRejectedValue(new Error("Audio player error"));

      const pipeline = new Pipeline({
        transport: transportWithText,
        stt,
        tts,
        ai,
      });
      pipeline.start();

      const stream = createReadableFromBuffer(Buffer.from("audio"));
      await pipeline.handleUserAudio({ userId: "user-1", audioStream: stream });

      expect(tts.synthesize).toHaveBeenCalledWith("Hi there!");
      expect(sendToTextChannel).toHaveBeenCalledWith("Hi there!");
    });

    it("logs warning when TTS fails and no text channel configured", async () => {
      const failingTts = {
        synthesize: vi.fn().mockRejectedValue(new Error("Piper down")),
      };
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const pipeline = new Pipeline({
        transport,
        stt,
        tts: failingTts,
        ai,
      });
      pipeline.start();

      const stream = createReadableFromBuffer(Buffer.from("audio"));
      await pipeline.handleUserAudio({ userId: "user-1", audioStream: stream });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No text channel configured")
      );
      expect(pipeline.isProcessing()).toBe(false);
      warnSpy.mockRestore();
    });

    it("continues processing after TTS fallback", async () => {
      const sendToTextChannel = vi.fn().mockResolvedValue(undefined);
      const transportWithText = createMockTransport({ sendToTextChannel });
      const ttsImpl = {
        synthesize: vi
          .fn()
          .mockRejectedValueOnce(new Error("Piper down"))
          .mockResolvedValueOnce(Buffer.from("audio-data")),
      };

      const pipeline = new Pipeline({
        transport: transportWithText,
        stt,
        tts: ttsImpl,
        ai,
      });
      pipeline.start();

      // First call: TTS fails, falls back to text
      const stream1 = createReadableFromBuffer(Buffer.from("audio1"));
      await pipeline.handleUserAudio({ userId: "u1", audioStream: stream1 });

      // Second call: normal pipeline succeeds
      const stream2 = createReadableFromBuffer(Buffer.from("audio2"));
      await pipeline.handleUserAudio({ userId: "u2", audioStream: stream2 });

      expect(ttsImpl.synthesize).toHaveBeenCalledTimes(2);
      expect(transportWithText._playedAudio).toHaveLength(1);
      expect(pipeline.isProcessing()).toBe(false);
    });

    it("handles fallback itself failing gracefully", async () => {
      const sendToTextChannel = vi
        .fn()
        .mockResolvedValueOnce(undefined) // normal text delivery succeeds
        .mockRejectedValueOnce(new Error("Discord API error")); // TTS fallback fails
      const transportWithText = createMockTransport({ sendToTextChannel });
      const failingTts = {
        synthesize: vi.fn().mockRejectedValue(new Error("Piper down")),
      };
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const pipeline = new Pipeline({
        transport: transportWithText,
        stt,
        tts: failingTts,
        ai,
      });
      pipeline.start();

      const stream = createReadableFromBuffer(Buffer.from("audio"));
      await pipeline.handleUserAudio({ userId: "user-1", audioStream: stream });

      expect(sendToTextChannel).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Text channel fallback also failed"),
        expect.any(Error)
      );
      expect(pipeline.isProcessing()).toBe(false);
      errorSpy.mockRestore();
    });
  });
});
