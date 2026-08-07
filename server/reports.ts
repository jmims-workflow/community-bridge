import { appendFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ReportIssueRequest } from "../shared/types.ts";

// File-backed instead of in-memory: reports now survive a server restart.
// This is still a starting point, not a finished moderation pipeline: for
// higher-volume use, swap this for a real database table. The JSONL format
// keeps this easy to migrate later (one JSON object per line).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.jsonl");

interface StoredReport extends ReportIssueRequest {
  reportedAt: string;
}

async function ensureDataFile(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

export async function addReport(report: ReportIssueRequest): Promise<void> {
  const stored: StoredReport = { ...report, reportedAt: new Date().toISOString() };

  await ensureDataFile();
  await appendFile(REPORTS_FILE, JSON.stringify(stored) + "\n", "utf8");

  // eslint-disable-next-line no-console
  console.warn("[resource report]", JSON.stringify(stored));

  await notifyWebhook(stored);
}

export async function getAllReports(): Promise<StoredReport[]> {
  await ensureDataFile();
  try {
    const raw = await readFile(REPORTS_FILE, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StoredReport);
  } catch {
    return [];
  }
}

// Optional: if REPORT_WEBHOOK_URL is set (a Slack incoming webhook, a
// generic HTTP endpoint, whatever), each report also gets POSTed there so
// a real person actually sees it instead of it just sitting in a file.
// Failures here are logged but never block the report from being saved,
// since the file write above is the source of truth.
async function notifyWebhook(report: StoredReport): Promise<void> {
  const url = process.env.REPORT_WEBHOOK_URL;
  if (!url) return;

  const text = `Resource issue reported: "${report.name}" (${report.website}) in ${report.county} County, ${report.state}. Reason: ${report.reason}.${report.details ? ` Details: ${report.details}` : ""}`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, report }),
    });
  } catch (err) {
    console.error("Failed to notify report webhook:", err);
  }
}
