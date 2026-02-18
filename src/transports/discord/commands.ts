import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import type { DiscordTransport } from "./transport.js";

export const joinCommand = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join your current voice channel");

export const leaveCommand = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("Leave the voice channel");

export const statusCommand = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show current voice bridge status");

export const allCommands = [joinCommand, leaveCommand, statusCommand];

export async function handleJoin(
  interaction: ChatInputCommandInteraction,
  transport: DiscordTransport
): Promise<void> {
  const member = interaction.member;
  if (!member || !("voice" in member) || !member.voice.channel) {
    await interaction.reply({
      content: "You must be in a voice channel to use this command.",
      ephemeral: true,
    });
    return;
  }

  const channel = member.voice.channel;
  if (
    channel.type !== ChannelType.GuildVoice &&
    channel.type !== ChannelType.GuildStageVoice
  ) {
    await interaction.reply({
      content: "Unsupported channel type.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await transport.join(channel.id, channel);
    await interaction.editReply(`Joined **${channel.name}** — listening.`);
  } catch (err) {
    await interaction.editReply(
      `Failed to join: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function handleLeave(
  interaction: ChatInputCommandInteraction,
  transport: DiscordTransport
): Promise<void> {
  if (!transport.isConnected()) {
    await interaction.reply({
      content: "Not currently in a voice channel.",
      ephemeral: true,
    });
    return;
  }

  await transport.leave();
  await interaction.reply({ content: "Left the voice channel.", ephemeral: true });
}

export async function handleStatus(
  interaction: ChatInputCommandInteraction,
  transport: DiscordTransport
): Promise<void> {
  const connected = transport.isConnected();
  await interaction.reply({
    content: connected
      ? "Connected and listening."
      : "Not connected to any voice channel.",
    ephemeral: true,
  });
}
