import type { SpeechToText } from "../core/interfaces.js";

export interface WhisperConfig {
  /** Base URL for whisper.cpp HTTP server (e.g. http://whisper:8080) */
  url: string;
}

interface WhisperResponse {
  text: string;
}

/**
 * Speech-to-text via whisper.cpp server mode.
 * Sends PCM audio as a WAV file via multipart form POST.
 */
export class WhisperSTT implements SpeechToText {
  private readonly url: string;

  constructor(config: WhisperConfig) {
    this.url = config.url.replace(/\/$/, "");
  }

  async transcribe(audio: Buffer): Promise<string> {
    const wavBuffer = this.wrapInWav(audio);
    const blob = new Blob([new Uint8Array(wavBuffer)], { type: "audio/wav" });

    const form = new FormData();
    form.append("file", blob, "audio.wav");
    form.append("response_format", "json");

    const response = await fetch(`${this.url}/inference`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      throw new Error(
        `Whisper STT failed: ${response.status} ${response.statusText}`
      );
    }

    const result = (await response.json()) as WhisperResponse;
    return result.text?.trim() ?? "";
  }

  /** Wrap raw 16-bit 16kHz mono PCM in a minimal WAV header. */
  private wrapInWav(pcm: Buffer): Buffer {
    const header = Buffer.alloc(44);
    const dataSize = pcm.length;
    const fileSize = dataSize + 36;

    header.write("RIFF", 0);
    header.writeUInt32LE(fileSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(16000, 24); // sample rate
    header.writeUInt32LE(32000, 28); // byte rate (16000 * 2)
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcm]);
  }
}
