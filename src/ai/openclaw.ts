import type { AIBackend } from "../core/interfaces.js";

export interface OpenClawConfig {
  /** Gateway URL (e.g. http://host.docker.internal:18789) */
  gatewayUrl: string;
  /** Gateway auth token */
  token: string;
}

interface WebhookResponse {
  text?: string;
  error?: string;
}

/**
 * AI backend via OpenClaw gateway webhook.
 * POSTs transcribed text to the voice-bridge channel plugin's HTTP endpoint
 * on the gateway, which routes it through the full agent pipeline
 * (memory, tools, personality, context).
 */
export class OpenClawAI implements AIBackend {
  private readonly gatewayUrl: string;
  private readonly token: string;
  private sessionId: string;
  private userId = "voice-user";

  constructor(config: OpenClawConfig) {
    this.gatewayUrl = config.gatewayUrl.replace(/\/$/, "");
    this.token = config.token;
    this.sessionId = `voice-${Date.now()}`;
  }

  /** Reset session ID — call on each join for a fresh conversation. */
  newSession(): void {
    this.sessionId = `voice-${Date.now()}`;
    console.log(`[OpenClaw] New session: ${this.sessionId}`);
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  async chat(userMessage: string): Promise<string> {
    const response = await fetch(`${this.gatewayUrl}/webhook/voice-bridge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        text: userMessage,
        userId: this.userId,
        sessionId: this.sessionId,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenClaw gateway failed: ${response.status} ${response.statusText} — ${body}`,
      );
    }

    const result = (await response.json()) as WebhookResponse;
    if (result.error) {
      throw new Error(`OpenClaw error: ${result.error}`);
    }
    return result.text?.trim() ?? "";
  }
}
