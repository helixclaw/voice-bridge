import { REST, Routes } from "discord.js";
import { allCommands } from "./commands.js";

const token = process.env["DISCORD_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];
const guildId = process.env["DISCORD_GUILD_ID"];

if (!token || !clientId || !guildId) {
  console.error(
    "Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID"
  );
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

const commandData = allCommands.map((cmd) => cmd.toJSON());

console.log(`Registering ${commandData.length} slash commands...`);

rest
  .put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commandData,
  })
  .then(() => console.log("Slash commands registered."))
  .catch(console.error);
