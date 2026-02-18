import type { TextToSpeech } from "../core/interfaces.js";

export interface PiperConfig {
  /** Base URL for Piper TTS HTTP server (e.g. http://piper:5000) */
  url: string;
}

/**
 * Text-to-speech via Piper TTS server.
 * POSTs text and receives WAV audio back.
 */
export class PiperTTS implements TextToSpeech {
  private readonly url: string;

  constructor(config: PiperConfig) {
    this.url = config.url.replace(/\/$/, "");
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.url, { method: "GET", signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async synthesize(text: string): Promise<Buffer> {
    const response = await fetch(`${this.url}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(
        `Piper TTS failed: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
