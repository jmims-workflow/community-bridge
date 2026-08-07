import { GoogleGenAI, Type } from "@google/genai";
import type { FindResourcesResponse, GroundingSource, ResourceItem } from "../shared/types.ts";

// This file is the ONLY place the Gemini API key is read. It runs on the
// server and is never bundled into client-side JS, unlike the previous
// version of this app which shipped the key straight to the browser.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function fetchResourcesFromModel(
  county: string,
  state: string,
  needs: string[]
): Promise<{ results: ResourceItem[]; sources: GroundingSource[] }> {
  const categoriesList = needs.join(", ");

  const prompt = `Find publicly available, currently active resources in ${county} County, ${state} for adults who are working, newly out of a job, facing housing instability, or food insecure.

Return resources for the following requested categories only: ${categoriesList}.

Category guidance:
${needs.includes("Food") ? `- FOOD: Food pantries, SNAP application help, and end-of-day surplus food options (e.g. Too Good To Go, Flashfood, local bakery/grocery surplus deals).` : ""}
${needs.includes("Housing") ? `- HOUSING: Local rental assistance programs, utility bill aid (LIHEAP/utility grants), housing authorities, emergency shelter, PadSplit (furnished rooms/co-living), and extended stay hotels.` : ""}
${needs.includes("Jobs") ? `- JOBS: Local career centers (e.g. American Job Centers), free resume assistance/writing & review services, job placement, and hiring resources.` : ""}
${needs.includes("UpSkill") ? `- UPSKILL: Free training courses, trade apprenticeship programs, WIOA grants, and education grants. Also include free, reputable career self-assessment tools if relevant (such as the O*NET Interest Profiler, CareerOneStop's Skills Matcher, or MyNextMove.org) to help someone figure out what field to pursue before committing to a training program.` : ""}
${needs.includes("Volunteer") ? `- VOLUNTEER: Verified community volunteer opportunities (100% free to participate, no fees allowed).` : ""}
${needs.includes("HomeRepair") ? `- HOME REPAIR: Free or low-cost home repair, weatherization, and accessibility modification programs (ramps, grab bars, etc.), especially those serving seniors and people with disabilities.` : ""}
${needs.includes("Seniors") ? `- SENIORS: Senior centers, meal delivery (e.g. Meals on Wheels), transportation assistance, and Medicare/benefits counseling for older adults.` : ""}
${needs.includes("Veterans") ? `- VETERANS: VA benefits navigation, veteran-specific housing programs, veteran employment services, and local Veteran Service Organizations (VSOs).` : ""}
${needs.includes("Animals") ? `- ANIMALS: Low-cost or free veterinary clinics, pet food pantries/banks, and spay/neuter assistance programs.` : ""}
${needs.includes("Business") ? `- BUSINESS: Free small business mentorship and support, specifically SBA (Small Business Administration) resources, SCORE mentors, Small Business Development Centers (SBDCs), and legitimate nonprofit/CDFI microloan programs.` : ""}

Important exclusions, apply to every category:
- Do NOT include payday lenders, rent-to-own schemes, "credit repair" services, or any service that charges upfront fees to a person seeking help.
- Do NOT include job placement or training "services" that require the applicant to pay for the promise of a job or income.
- Do NOT include home repair "contractors" that demand full payment upfront or pressure seniors into signing on the spot, this is a common scam pattern targeting older adults specifically.
- Do NOT include MLMs (multi-level marketing), "business opportunity" pitches requiring an upfront buy-in, paid business "coaching" programs, or franchise sales content disguised as free mentorship. Only include genuinely free, reputable programs (SBA, SCORE, SBDC, established nonprofit lenders).
- Prefer government programs, established nonprofits, libraries, and well-known reputable platforms over unfamiliar businesses.

Return a JSON array of real organizations, programs, or platforms with valid contact or web links matching [${categoriesList}]. Only include something if you have reasonable confidence it currently operates in or serves this area.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      // Caps how long a single response can run. This app never needs more
      // than a handful of short resource entries, so if the model starts
      // looping/repeating instead of stopping cleanly, this cuts it off
      // early rather than letting it run to the max and cost more.
      maxOutputTokens: 3000,
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Official name of the organization, service, or program" },
            category: {
              type: Type.STRING,
              enum: ["Housing", "Food", "Jobs", "UpSkill", "Volunteer", "HomeRepair", "Seniors", "Veterans", "Animals", "Business", "Other"],
              description: "The primary category",
            },
            description: { type: Type.STRING, description: "Brief description of services, programs, or help offered" },
            website: { type: Type.STRING, description: "Official website or app download URL" },
            phone: { type: Type.STRING, description: "Contact phone number (optional)" },
            address: { type: Type.STRING, description: "Physical address or coverage area (optional)" },
            tag: { type: Type.STRING, description: "A short badge label, 2-5 words maximum, e.g. 'Rental & Utility Aid', 'Resume Assistance', 'SBA & SCORE Partner'. Never a long list of keywords or phrases." },
            isVolunteer: { type: Type.BOOLEAN, description: "True if this is a volunteer opportunity" },
          },
          required: ["name", "category", "description", "website"],
        },
      },
    },
  });

  const text = response.text;
  let parsed: ResourceItem[] = [];
  try {
    parsed = text ? JSON.parse(text) : [];
  } catch {
    // The model occasionally produces malformed or truncated JSON (most often
    // when it's gotten stuck in a repetition loop and hit the output cap
    // above mid-string). Treat this the same as "found nothing usable" rather
    // than crashing the whole request, the person just sees an empty result
    // for this category instead of an error.
    parsed = [];
  }

  const filtered = parsed
    .filter((item) => needs.includes(item.category))
    .filter(isSaneResourceItem)
    .map(sanitizeResourceItem);

  const sources = extractGroundingSources(response);

  return { results: filtered, sources };
}

// Catches the specific failure mode seen in production: the model getting
// stuck in a repetition loop and producing something like
// "Food Pantry Box Food Pantry Box Food Pantry Box..." instead of a real
// name. Rather than trying to fix the model's behavior (out of our control),
// this rejects anything that looks like that before it ever reaches a user.
function isSaneResourceItem(item: ResourceItem): boolean {
  if (!item.name || !item.description) return false;

  // Real org names and descriptions don't run this long.
  if (item.name.length > 120) return false;
  if (item.description.length > 600) return false;

  return !looksRepetitive(item.name) && !looksRepetitive(item.description);
}

// Second failure mode seen in production: name/description/contact info were
// all correct, but the "tag" badge field turned into a long run-on string of
// keywords instead of a short label. That's a good listing with one bad
// field, so this trims the field instead of discarding the whole listing.
const MAX_TAG_LENGTH = 40;

function sanitizeResourceItem(item: ResourceItem): ResourceItem {
  if (item.tag && item.tag.length > MAX_TAG_LENGTH) {
    return { ...item, tag: undefined };
  }
  return item;
}

// A degenerate/looping string is mostly the same handful of words repeated
// over and over. A real sentence has much more variety than that. This
// checks the ratio of unique words to total words once there's enough text
// to make that ratio meaningful.
function looksRepetitive(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 12) return false; // too short for the ratio to mean anything

  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const uniqueRatio = uniqueWords.size / words.length;
  return uniqueRatio < 0.4;
}

// Best-effort extraction of the web sources Gemini's search grounding actually
// used. Field names here follow the @google/genai response shape at the time
// of writing; if the SDK changes this shape, this degrades to an empty list
// rather than throwing, since citations are a trust-building nice-to-have,
// not something the rest of the app depends on.
function extractGroundingSources(response: unknown): GroundingSource[] {
  try {
    const candidates = (response as any)?.candidates ?? [];
    const chunks = candidates[0]?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const sources: GroundingSource[] = [];

    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      const title = chunk?.web?.title ?? uri;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        sources.push({ title, url: uri });
      }
    }
    return sources;
  } catch {
    return [];
  }
}
