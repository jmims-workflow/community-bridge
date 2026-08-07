import type {
  FindResourcesResponse,
  ReportIssueRequest,
  ResourceCategory,
} from "../../shared/types.ts";

export type { ResourceItem, ResourceCategory, GroundingSource } from "../../shared/types.ts";

// The frontend no longer talks to Gemini directly, or holds any API key.
// It calls our own backend, which is the only place the key lives.
// In dev, vite.config.ts proxies /api to the backend on port 8787.
// In production, the same Express server serves both the built frontend
// and these API routes, so this is always a same-origin relative path.

export async function findLocalResources(
  county: string,
  state: string,
  needs: ResourceCategory[]
): Promise<FindResourcesResponse> {
  const res = await fetch("/api/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ county, state, needs }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Something went wrong while searching. Please try again.");
  }

  return res.json();
}

export async function reportResourceIssue(report: ReportIssueRequest): Promise<void> {
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Couldn't send that report. Please try again.");
  }
}
