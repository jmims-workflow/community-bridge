import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { rateLimit } from "./rateLimit.ts";
import { cacheGet, cacheSet, cacheInvalidate, cacheKeyFor } from "./cache.ts";
import { fetchResourcesFromModel } from "./resourceFinder.ts";
import { addReport, getAllReports } from "./reports.ts";
import { isValidUSState, isValidCountyName } from "../shared/usStates.ts";
import type {
  FindResourcesRequest,
  FindResourcesResponse,
  ReportIssueRequest,
  ResourceCategory,
} from "../shared/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_CATEGORIES: ResourceCategory[] = ["Housing", "Food", "Jobs", "UpSkill", "Volunteer", "HomeRepair", "Seniors", "Veterans", "Animals", "Business", "Other"];

if (!process.env.GEMINI_API_KEY) {
  // Fail loudly at startup rather than letting every request silently 500.
  console.error(
    "GEMINI_API_KEY is not set. Add it to a .env file in the project root (see .env.example). The server will start, but /api/resources will fail until it's set."
  );
}

const app = express();
app.use(express.json());

app.post("/api/resources", rateLimit, async (req, res) => {
  const body = req.body as Partial<FindResourcesRequest>;
  const county = (body.county ?? "").trim();
  const state = (body.state ?? "").trim();
  const needs = Array.isArray(body.needs) ? body.needs : [];

  if (!isValidCountyName(county)) {
    res.status(400).json({ error: "Please enter a valid county name." });
    return;
  }
  if (!isValidUSState(state)) {
    res.status(400).json({ error: "Please choose a valid U.S. state." });
    return;
  }
  const validNeeds = needs.filter((n): n is ResourceCategory => VALID_CATEGORIES.includes(n as ResourceCategory));
  if (validNeeds.length === 0) {
    res.status(400).json({ error: "Please select at least one category." });
    return;
  }

  try {
    const perCategory = await Promise.all(
      validNeeds.map(async (category) => {
        const key = cacheKeyFor(county, state, category);
        const cached = cacheGet<{ results: any[]; sources: any[] }>(key);
        if (cached) {
          return { ...cached, servedFrom: "cache" as const };
        }
        const fresh = await fetchResourcesFromModel(county, state, [category]);
        cacheSet(key, fresh);
        return { ...fresh, servedFrom: "live" as const };
      })
    );

    const results = perCategory.flatMap((p) => p.results);
    const sources = dedupeSources(perCategory.flatMap((p) => p.sources));
    const servedFrom = perCategory.every((p) => p.servedFrom === "cache") ? "cache" : "live";

    const payload: FindResourcesResponse = {
      results,
      sources,
      servedFrom,
      fetchedAt: new Date().toISOString(),
    };
    res.json(payload);
  } catch (error) {
    console.error("Error finding resources:", error);
    res.status(502).json({ error: "We couldn't reach the search service. Please try again in a moment." });
  }
});

app.post("/api/report", async (req, res) => {
  const body = req.body as Partial<ReportIssueRequest>;
  const { name, website, county, state, reason } = body;

  if (!name || !website || !county || !state || !reason) {
    res.status(400).json({ error: "Missing required fields." });
    return;
  }

  await addReport({
    name: String(name).slice(0, 200),
    website: String(website).slice(0, 500),
    county: String(county).slice(0, 60),
    state: String(state).slice(0, 60),
    reason: String(reason).slice(0, 100),
    details: body.details ? String(body.details).slice(0, 1000) : undefined,
  });

  // Force the next search for this county/state/category combo to skip the
  // cache, since we now know at least one entry there may be stale or bad.
  // We don't know the exact category here, so bust all of this county+state's
  // category caches to be safe.
  for (const category of VALID_CATEGORIES) {
    cacheInvalidate(cacheKeyFor(county, state, category));
  }

  res.json({ ok: true });
});

// Minimal, token-gated admin view of reports. Not a real auth system, just
// enough to keep this off by default until an ADMIN_TOKEN is configured.
app.get("/api/reports", async (req, res) => {
  const token = req.header("x-admin-token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    res.status(404).end();
    return;
  }
  res.json(await getAllReports());
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

function dedupeSources<T extends { url: string }>(sources: T[]): T[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`Community Bridge API listening on http://localhost:${PORT}`);
});
