import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function restartApiService(): Promise<void> {
  if (process.env.HAAI_RESTART_MODE === "disabled") return;
  if (process.env.HAAI_RESTART_MODE === "direct") {
    setTimeout(() => {
      process.exit(0);
    }, 500);
    return;
  }

  await execFileAsync("sudo", ["-n", "systemctl", "restart", "--no-block", "haai-api.service"], {
    timeout: 10_000
  });
}

export function scheduleApiRestart(onError: (error: unknown) => void): void {
  setTimeout(() => {
    void restartApiService().catch(onError);
  }, 250);
}
