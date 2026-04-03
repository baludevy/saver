import {
	AttachmentBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
	type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { runCommand, spawnProcess } from "@/utils/shell";
import {
	getMediaDuration,
	getBestEncoder,
	shouldCompress,
} from "@/utils/media";

type Command = {
	data: RESTPostAPIApplicationCommandsJSONBody;
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const MAX_SIZE = 8 * 1024 * 1024;

const command: Command = {
	data: {
		name: "save",
		description: "download and compress media directly",
		integration_types: [1],
		contexts: [0, 1, 2],
		options: [
			{
				name: "url",
				description: "the url to download",
				type: 3,
				required: true,
			},
		],
	},

	async execute(i: ChatInputCommandInteraction) {
		const url = i.options.getString("url", true);

		const baseTmp = process.platform === "linux" ? "/dev/shm" : os.tmpdir();

		const workDir = await fs.mkdtemp(path.join(baseTmp, "bot_dl_"));

		const inputPath = path.join(workDir, "input.mp4");
		const outputPath = path.join(workDir, "output.mp4");

		await i.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			await i.editReply({ content: "downloading video..." });

			await runCommand(
				`yt-dlp --no-playlist -S "res:720" -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" -o "${inputPath}" "${url}"`,
			);

			let finalPath = inputPath;

			const stats = await fs.stat(inputPath);

			if (stats.size > MAX_SIZE && (await shouldCompress(inputPath))) {
				await i.editReply({ content: "compressing video..." });

				const encoder = await getBestEncoder();

				// duration only needed if you use bitrate logic
				const duration = await getMediaDuration(inputPath);

				const isNVENC = encoder.includes("nvenc");

				const videoArgs = isNVENC
					? [
							"-c:v",
							encoder,
							"-preset",
							"p1",
							"-tune",
							"ll",
							"-rc",
							"vbr",
							"-cq",
							"28",
						]
					: ["-c:v", encoder, "-preset", "ultrafast", "-crf", "30"];

				await spawnProcess("ffmpeg", [
					"-y",
					"-hwaccel",
					"auto",
					"-i",
					inputPath,
					...videoArgs,
					"-c:a",
					"aac",
					"-b:a",
					"128k",
					"-movflags",
					"+faststart",
					outputPath,
				]);

				finalPath = outputPath;
			}

			await i.editReply({ content: "uploading..." });

			const attachment = new AttachmentBuilder(finalPath, {
				name: "video.mp4",
			});

			await i.followUp({
				content: `${i.user} downloaded\n<${url}>`,
				files: [attachment],
			});

			await i.deleteReply();
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);

			if (i.deferred || i.replied) {
				await i.editReply({
					content: `error: \`${errorMessage}\``,
				});
			}
		} finally {
			await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
		}
	},
};

export default command;
