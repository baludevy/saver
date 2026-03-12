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
	calculateVideoBitrate,
	shouldCompress,
} from "@/utils/media";

type Command = {
	data: RESTPostAPIApplicationCommandsJSONBody;
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

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
		const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "bot_dl_"));
		const inputPath = path.join(workDir, "input.mp4");
		const outputPath = path.join(workDir, "output.mp4");

		await i.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			await i.editReply({ content: "downloading video..." });

			await runCommand(
				`yt-dlp --no-playlist -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b" --merge-output-format mp4 -o "${inputPath}" "${url}"`,
			);

			const duration = await getMediaDuration(inputPath);
			let finalPath = inputPath;

			if (await shouldCompress(inputPath)) {
				await i.editReply({ content: "compressing video..." });

				const encoder = await getBestEncoder();
				const videoBitrate = calculateVideoBitrate(duration);
				const vParams =
					encoder === "h264_nvenc"
						? ["-preset", "p1", "-tune", "ll"]
						: ["-preset", "ultrafast"];

				await spawnProcess("ffmpeg", [
					"-y",
					"-hwaccel",
					"auto",
					"-i",
					inputPath,
					"-c:v",
					encoder,
					"-b:v",
					videoBitrate.toString(),
					...vParams,
					"-c:a",
					"aac",
					"-b:a",
					"128k",
					"-map_metadata",
					"-1",
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
				content: `<${url}>`,
				files: [attachment],
			});

			await i.deleteReply();
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			if (i.deferred || i.replied) {
				await i.editReply({ content: `error: \`${errorMessage}\`` });
			}
		} finally {
			await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
		}
	},
};

export default command;
