import { getAiSettings } from "../db/repositories.js";
import { runAnalysis } from "./analysis.js";
import { startLetsEncryptCertificateRenewal } from "./certificates.js";

let timer: NodeJS.Timeout | undefined;
let lastRunKey = "";
let lastCertificateRenewalCheckKey = "";

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(checkSchedule, 60_000);
  void checkSchedule();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}

async function checkSchedule(): Promise<void> {
  await checkCertificateRenewal();

  const settings = getAiSettings(false);
  if (!settings.enabled) return;
  const parsed = parseDailyCron(settings.scheduleCron);
  if (!parsed) return;
  const now = new Date();
  const runKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${parsed.hour}-${parsed.minute}`;
  if (now.getHours() === parsed.hour && now.getMinutes() === parsed.minute && runKey !== lastRunKey) {
    lastRunKey = runKey;
    await runAnalysis("scheduled").catch((error) => console.error("Scheduled analysis failed", error));
  }
}

async function checkCertificateRenewal(): Promise<void> {
  const now = new Date();
  const runKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (runKey === lastCertificateRenewalCheckKey) return;
  lastCertificateRenewalCheckKey = runKey;

  try {
    startLetsEncryptCertificateRenewal(false);
  } catch (error) {
    console.error("Scheduled certificate renewal check failed", error);
  }
}

function parseDailyCron(cron: string): { minute: number; hour: number } | null {
  const [minuteRaw, hourRaw, day, month, weekday] = cron.trim().split(/\s+/);
  if (day !== "*" || month !== "*" || weekday !== "*") return null;
  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  return { minute, hour };
}
