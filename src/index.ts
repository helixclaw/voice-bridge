import { Client, Events, GatewayIntentBits } from "discord.js";
import { loadConfig } from "./config.js";
import { Pipeline } from "./core/pipeline.js";
import { WhisperSTT } from "./stt/whisper.js";
import { PiperTTS } from "./tts/piper.js";
import { OpenClawAI } from "./ai/openclaw.js";
import {
  DiscordTransport,
  handleJoin,
  handleLeave,
  handleStatus,
} from "./transports/discord/index.js";

const config = loadConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const transport = new DiscordTransport({
  listenUserId: config.discord.listenUserId,
  client,
  textChannelId: config.discord.textChannelId,
});

const stt = new WhisperSTT({ url: config.whisper.url });
const tts = new PiperTTS({ url: config.piper.url });
const ai = new OpenClawAI({
  gatewayUrl: config.openclaw.gatewayUrl,
  token: config.openclaw.token,
});

const pipeline = new Pipeline({
  transport,
  stt,
  tts,
  ai,
  debugAudioDir: process.env.DEBUG_AUDIO_DIR,
  onTranscription: (userId, text) => {
    console.log(`[STT] ${userId}: ${text}`);
  },
  onAIResponse: ({ text, voice }) => {
    console.log(`[AI:text] ${text}`);
    console.log(`[AI:voice] ${voice}`);
  },
  onError: (err) => {
    console.error(`[Pipeline Error]`, err);
  },
});

pipeline.start();

/** Start a fresh OpenClaw session (new conversation context). */
function startNewSession(): void {
  ai.newSession();
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case "join":
      startNewSession();
      await handleJoin(interaction, transport);
      break;
    case "leave":
      await handleLeave(interaction, transport);
      break;
    case "status":
      await handleStatus(interaction, transport);
      break;
  }
});

// Auto-join/leave: follow the listened user into voice channels
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const targetUserId = config.discord.listenUserId;
  if (!targetUserId) return;

  // Only react to the target user's voice state changes
  if (newState.member?.id !== targetUserId && oldState.member?.id !== targetUserId) return;

  const userId = newState.member?.id ?? oldState.member?.id;
  if (userId !== targetUserId) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  // User joined or switched to a voice channel
  if (newChannel && newChannel.id !== oldChannel?.id) {
    console.log(`[Auto-Join] ${targetUserId} joined ${newChannel.name}, following...`);
    try {
      if (transport.isConnected()) {
        await transport.leave();
      }
      startNewSession();
      await transport.join(newChannel.id, newChannel);
      console.log(`[Auto-Join] Connected to ${newChannel.name}`);
    } catch (err) {
      console.error(`[Auto-Join] Failed to join:`, err);
    }
  }

  // User left voice entirely
  if (!newChannel && oldChannel) {
    console.log(`[Auto-Leave] ${targetUserId} left voice, disconnecting...`);
    await transport.leave();
  }
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.login(config.discord.token);
