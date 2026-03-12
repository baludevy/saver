import { spawn, exec } from "child_process"
import { promisify } from "util"

const execPromise = promisify(exec)

export async function runCommand(command: string) {
	return await execPromise(command)
}

export function spawnProcess(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args)
		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`${command} exited with code ${code}`))
			} else {
				resolve()
			}
		})
	})
}