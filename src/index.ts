import { Client, GatewayIntentBits } from "discord.js";
import { loadCommands } from "./handlers/loadCommands";
import { deployCommands } from "./handlers/deployCommands";
import { config } from "./config";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = await loadCommands();
await deployCommands(config.token, config.clientId, commands.values());

client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const cmd = commands.get(interaction.commandName);
	if (!cmd) return;

	try {
		await cmd.execute(interaction);
	} catch (err) {
		console.error(err);
		if (interaction.deferred || interaction.replied) {
			await interaction.followUp({
				content: "error running command.",
				ephemeral: true,
			});
		} else {
			await interaction.reply({
				content: "error running command.",
				ephemeral: true,
			});
		}
	}
});

client.once("clientReady", () => {
	console.log(`logged in as ${client.user?.tag}`);
});

await client.login(config.token);
