import { runCommand, spawnProcess } from "./shell"
import { VIDEO_CONFIG } from "@/consts/video"
import fs from "fs/promises"

export async function getMediaDuration(filePath: string): Promise<number> {
	const { stdout } = await runCommand(
		`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
	)
	const duration = parseFloat(stdout.trim())
	if (!duration || isNaN(duration)) throw new Error("Invalid duration")
	return duration
}

export async function getBestEncoder(): Promise<string> {
	try {
		const { stdout } = await runCommand("ffmpeg -encoders")
		return stdout.includes("h264_nvenc") ? "h264_nvenc" : "libx264"
	} catch {
		return "libx264"
	}
}

export function calculateVideoBitrate(duration: number): number {
	const targetBits =
		VIDEO_CONFIG.TARGET_SIZE_MB * 8 * 1024 * 1024 * VIDEO_CONFIG.BITRATE_FUDGE
	const totalBitrate = Math.floor(targetBits / duration)
	return Math.max(
		totalBitrate - VIDEO_CONFIG.AUDIO_BITRATE,
		VIDEO_CONFIG.MIN_VIDEO_BITRATE,
	)
}

export async function shouldCompress(filePath: string): Promise<boolean> {
	const stats = await fs.stat(filePath)
	return stats.size > VIDEO_CONFIG.TARGET_SIZE_BYTES
}