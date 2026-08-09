# Community Bridge

AI-assisted local resource discovery designed around real community needs, human verification, and responsible AI use.

Community Bridge helps people find local support for housing, food, employment, training, home repair, senior services, veteran resources, pet and animal needs, small-business support, and volunteer opportunities.

The goal was not simply to build a chatbot. I wanted to explore whether AI could reduce the fragmented, manual work of finding community resources while preserving the human judgment needed when information may be outdated, incomplete, or high-stakes.

The application is live and working.

**Live Demo:** https://community-bridge-567873217345.us-central1.run.app

**Built with:** React, TypeScript, Vite, Express, Gemini API, Google Search grounding, Google Cloud Run

---

## The Problem

Finding community assistance often means searching across government sites, nonprofits, local organizations, directories, and individual program pages.

Someone looking for help may need to separately research:

- rental or utility assistance
- food support
- employment and resume services
- job training or education grants
- senior services
- home repair or accessibility programs
- veteran resources
- animal care assistance
- small-business resources

The burden of finding, comparing, and evaluating those resources often falls on the person who already needs help, or on a community organization assisting them.

Community Bridge explores a simpler workflow:

**Tell the system where you are → choose what you need → receive organized local options → review the supporting information → verify before acting.**

---

## Initial Product

The first version focused on five needs:

- Housing & Utilities
- Food Support & Savings
- Jobs & Resume Help
- UpSkill & Trade Grants
- Volunteer Opportunities

The interface guides users through location and need selection rather than requiring them to know exactly what to search for.

The application uses Gemini with Google Search grounding to find relevant local resources and returns structured results instead of an open-ended AI response. The frontend and model interaction are separated through an Express backend, which also handles caching, validation, rate limiting, and issue reporting.

---

## Discovery and Stakeholder Feedback

After creating the initial working version, I put Community Bridge in front of potential users and a nonprofit professional.

The feedback validated the core problem. Users immediately saw value in having multiple types of community resources consolidated into one experience. One tester said they would normally have to conduct individual searches, and wanted to share Community Bridge with people looking for employment and with community-resource groups.

Testing also exposed areas that needed improvement, including:

- search latency
- inconsistent zero-result experiences
- a category that failed during testing
- a preference for a warmer, more visual presentation from some users

Rather than treating the positive feedback as the end of the project, I used both the praise and the failure points as product input.

---

## From User Request to Product Expansion

A later user, through a community post, asked whether Community Bridge could locate home repair resources for seniors.

That question exposed a broader limitation in the original resource categories.

Instead of building a one-off senior home-repair feature, I looked at adjacent needs I had seen people seek and expanded the resource model.

The current experience includes:

- Housing & Utilities
- Food Support & Savings
- Jobs & Resume Help
- UpSkill & Trade Grants
- Home Repair & Accessibility
- Senior Resources
- Veteran Resources
- Pet & Animal Resources
- Start a Business
- Volunteer Opportunities

This shifted Community Bridge from a small set of predefined searches toward a more reusable community-resource discovery framework.

---## Screenshots

![Landing page](assets/screenshots/1-community-bridge-landing.png)
*Landing page framing the tool for both people seeking help and people looking to volunteer, with quick links into the most common categories.*

![Location input](assets/screenshots/2-community-bridge-location-input.png)
*Step 1 of the intake flow. The user enters county and state so every result returned afterward is scoped to real local programs rather than generic national links.*

![Category selection](assets/screenshots/3-community-bridge-category-selection.png)
*Step 2 of the intake flow. Users select one or more categories such as housing, food, jobs, or senior resources, and can select all at once if their need spans several areas.*

![UpSkill and Trade Grants results](assets/screenshots/4-community-bridge-upskill-results.png)
*Results page for UpSkill and Trade Grants in Fulton County, Georgia, showing a contextual tip above the listings and full contact details for each program.*

![Explore further section](assets/screenshots/5-community-bridge-explore-further.png)
*Explore Further section at the bottom of a results page, letting users load additional categories on demand instead of restarting the whole search.*

![Volunteer results](assets/screenshots/6-community-bridge-volunteer-results.png)
*Results for the I Want to Help path in Miami-Dade County, showing the tool also serves people looking to give back, not only people seeking assistance.*

---

## Human-in-the-Loop Design

Community Bridge intentionally does not treat AI output as verified truth.

**AI helps with:**
- searching for relevant local resources
- organizing results into useful categories
- returning structured resource information
- surfacing web sources used during grounded search

**The application handles:**
- input validation
- API access
- caching
- request rate limiting
- issue-report intake
- refresh behavior after questionable information is reported
- clear search failure states

**People remain responsible for:**
- deciding whether a resource fits their situation
- confirming eligibility
- verifying hours and availability
- contacting the organization
- reporting incorrect, closed, or suspicious listings

The application explicitly tells users that results are AI-found and not independently verified, and instructs them to confirm current details directly with the organization.

---

## Trust, Safety, and Governance Decisions

Because Community Bridge may be used by people seeking financial or social support, trust was part of the product design rather than an afterthought.

**Server-side model access**
The React frontend never receives the Gemini API key. Requests go through an Express backend, keeping model credentials out of browser code entirely.

**Resource reporting**
Users can flag listings that appear incorrect, closed, or suspicious. Reports are stored outside the frontend, and reporting a questionable result invalidates the cached search so the next request re-checks the area instead of automatically returning the same information.

**Human verification**
The system distinguishes between finding information and verifying that information. Users are explicitly instructed to confirm operating hours, requirements, and availability before visiting or applying.

**Volunteer safeguards**
The interface states that volunteer opportunities should be free to participate in and warns users against fees or deposits associated with volunteering.

**Scam-pattern exclusions**
The AI is explicitly instructed to exclude predatory patterns common to specific categories: upfront-payment demands from home-repair contractors (a known scam targeting seniors), MLMs and pay-to-play "business opportunities," and job placement services that charge for the promise of income.

**Failure-state design**
A failed search is treated differently from a legitimate search returning no resources. That distinction matters: a system error should not tell someone that help does not exist simply because the application could not retrieve it. The application maintains a separate search-error state specifically to avoid presenting a technical failure as "nothing is available."

**Output sanitization**
Structured AI output is validated before being shown to a user. Results that are abnormally long, repetitive, or malformed (a known failure mode of generative models) are filtered or trimmed server-side rather than displayed as-is.

---

## Architecture

```
User
  ↓
React / Vite Frontend
  ↓
Community Bridge API (Express / TypeScript)
  ↓
Validation → Rate Limiting → Caching
  ↓
Gemini API
  ↓
Google Search Grounding
  ↓
Structured Resource Results
  ↓
Human Review / Verification
  ↓
Report Issue
  ↓
Cache Invalidation + Re-search
```

**Frontend**
React and Vite provide the guided user experience, including location selection, need selection, resource filtering, saved-search behavior, issue reporting, and error/empty states.

**Backend**
Express provides the controlled layer between the user and the model: Gemini API access, server-side credentials, validation, rate limiting, caching, report intake, and production static serving.

**AI Layer**
Gemini performs the resource search using Google Search grounding. The application requests structured resource data rather than relying on free-form conversational output.

**Deployment**
Containerized with Docker and deployed to Google Cloud Run, which scales to zero when idle and serves the app publicly over HTTPS.

### Why the Backend Exists

One of the key architectural changes during development was moving AI requests away from the browser entirely. The browser now calls Community Bridge's own API, while the backend is the only place the Gemini key is available. This created a place to enforce validation, caching, rate limits, reporting, and future governance controls, and it makes the AI provider less tightly coupled to the user interface.

---

## Reusable AI Workflow Pattern

Although Community Bridge focuses on community-resource discovery, the underlying workflow is not specific to this use case.

```
Collect Context
  ↓
Identify User Need
  ↓
Retrieve Current Information
  ↓
Apply AI Constraints
  ↓
Return Structured Results
  ↓
Expose Supporting Evidence
  ↓
Human Evaluation
  ↓
Capture Feedback
  ↓
Revalidate When Necessary
```

The same general pattern could support other AI-enabled workflows, such as internal knowledge discovery, customer or vendor research, policy navigation, account research, employee resource navigation, or support triage. The reusable capability is the workflow itself, not just the Community Bridge interface.

---

## Product Decisions

| Decision | Reason |
|---|---|
| Guided categories instead of only a blank search box | Reduce the burden on users who may not know what programs or terminology to search for |
| Grounded AI search | Improve the connection between generated results and current web information |
| Structured responses | Make AI output easier to organize and use |
| Server-side API access | Protect credentials and create a controlled integration layer |
| Per-IP rate limits | Reduce automated abuse and uncontrolled API consumption |
| Search caching | Reduce duplicate model requests |
| Report-an-issue workflow | Create a human feedback mechanism |
| Cache invalidation after reports | Prevent known questionable results from simply being served again |
| Separate errors from empty results | Avoid misleading users when the search itself fails |
| Verification messaging | Keep final judgment with the user |

---

## What I Learned

**AI should solve a workflow problem, not simply be added to an interface.** The useful part of the application is not Gemini itself. It is reducing the steps between someone's need and potentially relevant information.

**Grounding improves AI output but does not eliminate the need for verification.** A retrieved source may itself be outdated or incomplete.

**Human feedback should affect system behavior.** A report button is more useful when a report changes what happens next. In Community Bridge, reported searches are removed from cache so they can be refreshed.

**Failure UX matters.** "No resources exist" and "we were unable to complete the search" are fundamentally different messages.

**One user request may indicate a broader system requirement.** The request for senior home-repair assistance led to expanding the underlying resource taxonomy rather than creating a single isolated feature.

**Different users prefer different interaction models.** Early feedback included interest in both a warmer, more visual presentation and a straightforward, minimal search experience. That suggests future versions should keep the retrieval capability independent enough to support multiple interfaces.

---

## Measuring a Future Pilot

The current project has early qualitative feedback but has not undergone a formal organizational pilot. If deployed with a nonprofit or community organization, I would measure:

**Efficiency:** average time required to locate appropriate resources, searches completed per staff member, percentage of repeat searches served without another model call.

**Adoption:** active users, repeat users, searches by category, saved-search reuse.

**Quality:** resources reported as incorrect, outdated or broken-link rate, percentage of searches producing useful results.

**User Confidence:** perceived usefulness, confidence in results, willingness to use Community Bridge again, willingness to recommend it to someone seeking support.

This would allow adoption and usefulness to be evaluated separately from simple usage volume.

---

## Current Limitations

Community Bridge is a working prototype, not a finished public-service infrastructure platform.

- AI-found resources still require human verification
- caching is currently optimized for a relatively small deployment
- the reporting workflow is not yet a full moderation system
- larger deployments would require more durable data storage and observability
- additional user testing is needed across different populations and locations

The current reporting implementation is intentionally documented as a starting point that should move from flat-file storage to a database at meaningful scale.

---

## Next Steps

- usage analytics
- database-backed issue reporting
- moderation dashboard
- resource-quality scoring
- improved performance instrumentation
- accessibility testing
- additional stakeholder interviews
- organizational pilot
- comparison of visual browsing and search-first interfaces
- configurable resource categories
- additional audit and governance logging

---

## Running Locally

**Requirements:** Node.js 18+

```bash
npm install
```

Copy `.env.example` to `.env` and add your Gemini API key.

```bash
npm run dev
```

This starts the React/Vite frontend and Express backend together. The frontend proxies `/api/*` requests to the local API server.

For production:

```bash
npm run build
npm start
```

---

## Project Status

**Status:** Live working prototype
**Stage:** Stakeholder-tested / iterating
**Primary focus:** AI-enabled resource discovery, human oversight, and reusable workflow design
