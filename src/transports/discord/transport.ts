import { Readable, Transform, type TransformCallback } from "node:stream";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
  type VoiceConnection,
  type AudioPlayer,
  type AudioReceiveStream,
} from "@discordjs/voice";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const prism = require("prism-media");
import type { VoiceBasedChannel } from "discord.js";
import type { VoiceTransport, UserAudioStream } from "../../core/interfaces.js";

/**
 * Downsamples 48kHz stereo s16le PCM to 16kHz mono s16le PCM.
 * Takes every 3rd sample from the left channel (48000/16000 = 3).
 */
class Downsampler extends Transform {
  private remainder = Buffer.alloc(0);

  _transform(chunk: Buffer, _encoding: string, callback: TransformCallback): void {
    const buf = this.remainder.length > 0 ? Buffer.concat([this.remainder, chunk]) : chunk;
    // Each stereo frame = 4 bytes (2 bytes left + 2 bytes right)
    const frameSize = 4; // stereo s16le
    const decimation = 3; // 48kHz → 16kHz
    const stepBytes = frameSize * decimation; // 12 bytes per output sample
    const outputSamples = Math.floor(buf.length / stepBytes);
    const output = Buffer.alloc(outputSamples * 2); // mono s16le

    for (let i = 0; i < outputSamples; i++) {
      const offset = i * stepBytes;
      output.writeInt16LE(buf.readInt16LE(offset), i * 2);
    }

    this.remainder = Buffer.from(buf.subarray(outputSamples * stepBytes));
    callback(null, output);
  }

  _flush(callback: TransformCallback): void {
    this.remainder = Buffer.alloc(0);
    callback();
  }
}

export interface DiscordTransportOptions {
  /** Only listen to this user ID (optional — if unset, listens to all) */
  listenUserId?: string;
}

export class DiscordTransport implements VoiceTransport {
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private audioHandler: ((userAudio: UserAudioStream) => void) | null = null;
  private readonly listenUserId?: string;
  private subscribedUsers = new Set<string>();

  constructor(options: DiscordTransportOptions = {}) {
    this.listenUserId = options.listenUserId;
  }

  async join(channelId: string, channel?: VoiceBasedChannel): Promise<void> {
    if (!channel) {
      throw new Error(
        "DiscordTransport.join requires a VoiceBasedChannel as the second argument"
      );
    }

    this.player = createAudioPlayer();

    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    this.connection.subscribe(this.player);

    await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);

    this.connection.receiver.speaking.on("start", (userId: string) => {
      if (this.listenUserId && userId !== this.listenUserId) return;
      if (this.subscribedUsers.has(userId)) return;
      this.subscribedUsers.add(userId);

      const opusStream: AudioReceiveStream =
        this.connection!.receiver.subscribe(userId, {
          end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 1000,
          },
        });

      // Decode Opus → 48kHz stereo s16le PCM → downsample to 16kHz mono
      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });
      const downsampler = new Downsampler();
      const audioStream: Readable = opusStream.pipe(decoder).pipe(downsampler);

      audioStream.on("end", () => {
        this.subscribedUsers.delete(userId);
      });

      this.audioHandler?.({ userId, audioStream });
    });
  }

  async leave(): Promise<void> {
    this.connection?.destroy();
    this.connection = null;
    this.player = null;
    this.subscribedUsers.clear();
  }

  onUserAudio(handler: (userAudio: UserAudioStream) => void): void {
    this.audioHandler = handler;
  }

  async playAudio(audio: Buffer): Promise<void> {
    if (!this.player || !this.connection) {
      throw new Error("Not connected to a voice channel");
    }

    const readable = Readable.from(audio);
    const resource = createAudioResource(readable);
    this.player.play(resource);

    return new Promise((resolve, reject) => {
      this.player!.once(AudioPlayerStatus.Idle, () => resolve());
      this.player!.once("error", reject);
    });
  }

  isConnected(): boolean {
    return (
      (this.connection?.state.status === VoiceConnectionStatus.Ready) || false
    );
  }
}
