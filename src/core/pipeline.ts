import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  VoiceTransport,
  SpeechToText,
  TextToSpeech,
  AIBackend,
  DualResponse,
  UserAudioStream,
} from "./interfaces.js";

export interface PipelineConfig {
  transport: VoiceTransport;
  stt: SpeechToText;
  tts: TextToSpeech;
  ai: AIBackend;
  debugAudioDir?: string;
  onTranscription?: (userId: string, text: string) => void;
  onAIResponse?: (response: DualResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * Pipeline orchestrator: wires transport → STT → AI → TTS → transport playback.
 * Collects audio from a user stream, transcribes it, sends to AI, synthesizes
 * the response, and plays it back through the transport.
 */
export class Pipeline {
  private readonly transport: VoiceTransport;
  private readonly stt: SpeechToText;
  private readonly tts: TextToSpeech;
  private readonly ai: AIBackend;
  private readonly onTranscription?: (userId: string, text: string) => void;
  private readonly onAIResponse?: (response: DualResponse) => void;
  private readonly onError?: (error: Error) => void;
  private readonly debugAudioDir?: string;
  private busy = false;
  private pendingAudio: UserAudioStream | null = null;

  constructor(config: PipelineConfig) {
    this.transport = config.transport;
    this.stt = config.stt;
    this.tts = config.tts;
    this.ai = config.ai;
    this.debugAudioDir = config.debugAudioDir;
    this.onTranscription = config.onTranscription;
    this.onAIResponse = config.onAIResponse;
    this.onError = config.onError;
  }

  /** Start listening for audio from the transport. */
  start(): void {
    this.transport.onUserAudio((userAudio: UserAudioStream) => {
      this.handleUserAudio(userAudio).catch((err) => {
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  /** Full pipeline: collect audio → STT → AI → TTS → playback. */
  async handleUserAudio(userAudio: UserAudioStream): Promise<void> {
    if (this.busy) {
      // Queue the latest utterance (depth 1 - replaces any previous pending)
      this.pendingAudio = userAudio;
      return;
    }
    this.busy = true;

    try {
      await this.processAudio(userAudio);
    } finally {
      this.busy = false;
      // Drain queue: if audio arrived while we were busy, process it now
      const next = this.pendingAudio;
      this.pendingAudio = null;
      if (next) {
        this.handleUserAudio(next).catch((err) => {
          this.onError?.(err instanceof Error ? err : new Error(String(err)));
        });
      }
    }
  }

  /** Whether the pipeline is currently processing audio. */
  isProcessing(): boolean {
    return this.busy;
  }

  /** Process a single audio utterance through the full pipeline. */
  private async processAudio(userAudio: UserAudioStream): Promise<void> {
    const audioBuffer = await this.collectStream(userAudio.audioStream);
    if (audioBuffer.length === 0) return;

    // Save as WAV for debugging (playable directly)
    if (this.debugAudioDir) {
      try {
        await mkdir(this.debugAudioDir, { recursive: true });
        const ts = Date.now();
        const wavBuffer = this.wrapInWav(audioBuffer);
        const path = join(this.debugAudioDir, `${ts}_${userAudio.userId}.wav`);
        await writeFile(path, wavBuffer);
        console.log(`[debug] Saved ${audioBuffer.length} bytes of audio to ${path}`);
      } catch (e) {
        console.warn("[debug] Failed to save audio:", e);
      }
    }

    const transcription = await this.stt.transcribe(audioBuffer);
    if (!transcription.trim()) return;

    // Filter whisper hallucinations on ambient noise
    if (this.isNonSpeech(transcription)) {
      console.log(`[STT] Filtered non-speech: "${transcription}"`);
      return;
    }

    this.onTranscription?.(userAudio.userId, transcription);

    const aiResponse = await this.ai.chat(transcription);
    const text = aiResponse.text.trim();
    const voice = aiResponse.voice.trim();
    if (!voice && !text) return;

    this.onAIResponse?.({ text, voice });
    if (text) await this.transport.sendToTextChannel?.(text);

    const speechAudio = await this.tts.synthesize(voice || text);
    await this.transport.playAudio(speechAudio);
  }

  /** Wrap raw 16-bit 16kHz mono PCM in a WAV header. */
  private wrapInWav(pcm: Buffer): Buffer {
    const header = Buffer.alloc(44);
    const dataSize = pcm.length;
    header.write("RIFF", 0);
    header.writeUInt32LE(dataSize + 36, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);   // PCM
    header.writeUInt16LE(1, 22);   // mono
    header.writeUInt32LE(16000, 24); // sample rate
    header.writeUInt32LE(32000, 28); // byte rate
    header.writeUInt16LE(2, 32);   // block align
    header.writeUInt16LE(16, 34);  // bits per sample
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcm]);
  }

  /** Detect whisper hallucinations on ambient/silent audio. */
  private isNonSpeech(text: string): boolean {
    const t = text.trim().toLowerCase();
    // Matches things like (engine rumbling), [BLANK_AUDIO], [silence], (clippers buzzing), etc.
    if (/^\(.*\)$/.test(t) || /^\[.*\]$/.test(t)) return true;
    // Common whisper hallucinations
    const hallucinations = [
      "you", "thank you", "thanks for watching",
      "subscribe", "like and subscribe",
      "thank you for watching",
    ];
    if (hallucinations.includes(t)) return true;
    return false;
  }

  private collectStream(stream: import("node:stream").Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }
}
