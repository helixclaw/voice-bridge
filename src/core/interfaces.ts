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

  /** Send a text message to the associated text channel (optional). */
  sendToTextChannel?(message: string): Promise<void>;
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
 * Dual response from an AI backend: detailed text for text channels
 * and a concise voice-friendly variant for TTS.
 */
export interface DualResponse {
  text: string;
  voice: string;
}

/**
 * AI backend: takes user text, returns AI response with both text and voice variants.
 */
export interface AIBackend {
  chat(userMessage: string): Promise<DualResponse>;
}
