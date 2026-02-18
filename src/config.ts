function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export interface AppConfig {
  discord: {
    token: string;
    clientId: string;
    guildId: string;
    listenUserId?: string;
    textChannelId?: string;
  };
  whisper: {
    url: string;
  };
  piper: {
    url: string;
  };
  openclaw: {
    gatewayUrl: string;
    token: string;
  };
}

export function loadConfig(): AppConfig {
  return {
    discord: {
      token: requireEnv("DISCORD_TOKEN"),
      clientId: requireEnv("DISCORD_CLIENT_ID"),
      guildId: requireEnv("DISCORD_GUILD_ID"),
      listenUserId: process.env["DISCORD_LISTEN_USER_ID"],
      textChannelId: process.env["DISCORD_TEXT_CHANNEL_ID"],
    },
    whisper: {
      url: optionalEnv("WHISPER_URL", "http://whisper:8080"),
    },
    piper: {
      url: optionalEnv("PIPER_URL", "http://piper:5000"),
    },
    openclaw: {
      gatewayUrl: requireEnv("OPENCLAW_URL"),
      token: requireEnv("OPENCLAW_TOKEN"),
    },
  };
}
