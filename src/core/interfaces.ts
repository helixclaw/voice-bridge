import { Readable } from "node:stream";

/**
 * Audio stream from a voice transport, tagged with a user identifier.
 */
export interface UserAudioStream {
  userId: string;
  audioStream: Readable;
}

/**
 * Platform-agnostic voice transport.
 * Handles joining/leaving voice channels and sending/receiving audio.
 */
export interface VoiceTransport {
  /** Join a voice channel. channelId is platform-specific. */
  join(channelId: string): Promise<void>;

  /** Leave the current voice channel. */
  leave(): Promise<void>;

  /** Register a handler for incoming user audio streams. */
  onUserAudio(handler: (userAudio: UserAudioStream) => void): void;

  /** Play an audio buffer back into the voice channel. */
  playAudio(audio: Buffer): Promise<void>;

  /** Whether the transport is currently connected. */
  isConnected(): boolean;

  /** Send a text message to the configured text channel. */
  sendToTextChannel?(text: string): Promise<void>;
}

/**
 * Speech-to-text: converts raw audio buffers into text.
 */
export interface SpeechToText {
  transcribe(audio: Buffer): Promise<string>;
}

/**
 * Text-to-speech: converts text into a playable audio buffer.
 */
export interface TextToSpeech {
  synthesize(text: string): Promise<Buffer>;
}

/**
 * AI backend: takes user text, returns AI response text.
 */
export interface AIBackend {
  chat(userMessage: string): Promise<string>;
}
