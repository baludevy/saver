import { AttachmentBuilder } from "discord.js";
import type {
	ChatInputCommandInteraction,
	RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { spawn } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { v4 as uuidv4 } from "uuid";

const execPromise = promisify(require("child_process").exec);

type Command = {
	data: RESTPostAPIApplicationCommandsJSONBody;
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const TARGET_SIZE_MB = 24.0;
const TARGET_SIZE_BYTES = TARGET_SIZE_MB * 1024 * 1024;

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

	async execute(interaction: ChatInputCommandInteraction) {
		const url = interaction.options.getString("url", true);
		const workId = uuidv4();
		const workDir = path.join(os.tmpdir(), `bot_dl_${workId}`);
		const inputPath = path.join(workDir, "input.mp4");
		const outputPath = path.join(workDir, "output.mp4");

		await interaction.deferReply();

		try {
			await fs.mkdir(workDir, { recursive: true });

			await interaction.editReply("fetching metadata...");
			const { stdout: metaJson } = await execPromise(
				`yt-dlp --dump-json --no-playlist "${url}"`,
			);
			const metadata = JSON.parse(metaJson);
			const title = metadata.title || "video";

			await interaction.editReply("downloading video...");
			await execPromise(
				`yt-dlp --no-playlist -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4] / bv*+ba/b" --merge-output-format mp4 -o "${inputPath}" "${url}"`,
			);

			if (!existsSync(inputPath)) throw new Error("download failed");

			const stats = await fs.stat(inputPath);
			let finalPath = inputPath;

			if (stats.size > TARGET_SIZE_BYTES) {
				await interaction.editReply("compressing video to fit upload limit...");
				let encoder = "libx264";
				try {
					const { stdout: encoders } = await execPromise("ffmpeg -encoders");
					if (encoders.includes("h264_nvenc")) encoder = "h264_nvenc";
				} catch {}

				const duration = metadata.duration || 0;
				if (duration === 0) throw new Error("could not determine duration");

				const targetBits = TARGET_SIZE_MB * 8 * 1024 * 1024 * 0.93;
				const totalBitrate = Math.floor(targetBits / duration);
				const videoBitrate = Math.max(totalBitrate - 128000, 100000);

				const vParams =
					encoder === "h264_nvenc"
						? ["-preset", "p1", "-tune", "ll"]
						: ["-preset", "ultrafast"];

				const ffmpegArgs = [
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
					"copy",
					"-map_metadata",
					"-1",
					"-movflags",
					"+faststart",
					outputPath,
				];

				await spawnFfmpeg(ffmpegArgs);
				finalPath = outputPath;
			}

			await interaction.editReply("uploading to discord...");
			const safeTitle = title
				.toLowerCase()
				.replace(/[^a-z0-9._-]/gi, "_")
				.substring(0, 50);
			const attachment = new AttachmentBuilder(finalPath, {
				name: `${safeTitle}.mp4`,
			});

			await interaction.editReply({ content: "", files: [attachment] });
		} catch (err) {
			await interaction.editReply({
				content: `error: ${(err as Error).message.toLowerCase()}`,
			});
		} finally {
			await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
		}
	},
};

async function spawnFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn("ffmpeg", args);
		proc.on("close", async (code) => {
			if (code !== 0) {
				const audioIdx = args.indexOf("-c:a");
				if (audioIdx !== -1 && args[audioIdx + 1] === "copy") {
					args[audioIdx + 1] = "aac";
					args.splice(audioIdx + 2, 0, "-b:a", "128k");
					try {
						await spawnFfmpeg(args);
						return resolve();
					} catch (e) {
						return reject(e);
					}
				}
				reject(new Error(`ffmpeg exited with code ${code}`));
			} else {
				resolve();
			}
		});
	});
}

export default command;
