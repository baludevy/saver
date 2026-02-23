import type {
	ChatInputCommandInteraction,
	RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

export type Command = {
	data: RESTPostAPIApplicationCommandsJSONBody;
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
