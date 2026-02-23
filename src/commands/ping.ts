import type { Command } from "../types/command.js";

export const ping: Command = {
	data: {
		name: "ping",
		description: "pong",
		integration_types: [1],
		contexts: [0, 1, 2],
	},
	async execute(interaction) {
		await interaction.reply("pong!");
	},
};

export default ping;
