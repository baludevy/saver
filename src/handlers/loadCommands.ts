import { Collection } from "discord.js";
import type { Command } from "../types/command.js";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function loadCommands(): Promise<Collection<string, Command>> {
	const commands = new Collection<string, Command>();

	const commandsDir = path.join(process.cwd(), "src", "commands");

	const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".ts"));

	for (const file of files) {
		const fileUrl = pathToFileURL(path.join(commandsDir, file)).href;
		const mod = await import(fileUrl);
		const cmd: Command = mod.default ?? mod[Object.keys(mod)[0]!];
		commands.set(cmd.data.name, cmd);
	}

	return commands;
}
