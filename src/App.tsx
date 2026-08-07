import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Heart, 
  ArrowRight, 
  Loader2, 
  Home, 
  Utensils, 
  Briefcase, 
  GraduationCap, 
  HeartHandshake, 
  ExternalLink, 
  Phone, 
  MapPin, 
  ChevronLeft, 
  ShieldCheck, 
  ShoppingBag, 
  Sparkles, 
  Info,
  CheckCircle2,
  Tag,
  Search,
  Plus,
  FileText,
  AlertTriangle,
  Flag,
  PhoneCall,
  Link2,
  History,
  Wrench,
  Users,
  Award,
  PawPrint,
  Rocket
} from "lucide-react";
import { findLocalResources, reportResourceIssue, ResourceItem, ResourceCategory, GroundingSource } from "./services/resourceService";
import { US_STATES } from "../shared/usStates";

type Step = "welcome" | "location" | "needs" | "searching" | "results";

const STORAGE_KEY = "community-bridge:last-search";

interface SavedSearch {
  county: string;
  state: string;
  selectedNeeds: string[];
  results: ResourceItem[];
  sources: GroundingSource[];
  activeFilter: string;
  savedAt: string;
}

function loadSavedSearch(): SavedSearch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSearch) : null;
  } catch {
    return null;
  }
}

function saveSearch(data: SavedSearch) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage can fail in private browsing / storage-full situations.
    // Losing the "resume search" convenience isn't worth surfacing an error for.
  }
}

const CATEGORY_DEFINITIONS = [
  {
    id: "Housing",
    icon: Home,
    title: "Housing & Utilities",
    desc: "Rental assistance, utility bill relief, PadSplit, extended stay hotels, and shelter.",
    badge: "Rental Aid, Utilities & PadSplit"
  },
  {
    id: "Food",
    icon: Utensils,
    title: "Food Support & Savings",
    desc: "Food pantries, SNAP assistance, and end-of-day discounted food surplus.",
    badge: "Pantries & End-of-Day Discounts"
  },
  {
    id: "Jobs",
    icon: Briefcase,
    title: "Jobs & Resume Help",
    desc: "Free resume writing & review, career centers, job placement, and hiring.",
    badge: "Resume Help & Employment"
  },
  {
    id: "UpSkill",
    icon: GraduationCap,
    title: "UpSkill & Trade Grants",
    desc: "Free training courses, trade apprenticeships, and education grants.",
    badge: "Free Courses & Trade Grants"
  },
  {
    id: "HomeRepair",
    icon: Wrench,
    title: "Home Repair & Accessibility",
    desc: "Free or low-cost home repair, weatherization, and accessibility modification programs, especially for seniors and people with disabilities.",
    badge: "Repair & Accessibility Grants"
  },
  {
    id: "Seniors",
    icon: Users,
    title: "Senior Resources",
    desc: "Senior centers, meal delivery, transportation assistance, and Medicare/benefits counseling for older adults.",
    badge: "Senior Support Services"
  },
  {
    id: "Veterans",
    icon: Award,
    title: "Veteran Resources",
    desc: "VA benefits navigation, veteran housing programs, employment help, and local veteran service organizations.",
    badge: "VA & Veteran Support"
  },
  {
    id: "Animals",
    icon: PawPrint,
    title: "Pet & Animal Resources",
    desc: "Low-cost or free veterinary care, pet food pantries, and spay/neuter assistance programs.",
    badge: "Pet Food & Vet Care"
  },
  {
    id: "Business",
    icon: Rocket,
    title: "Start a Business",
    desc: "Free SBA and SCORE mentorship, Small Business Development Centers, and legitimate microloan programs.",
    badge: "SBA, SCORE & Free Mentorship"
  },
  {
    id: "Volunteer",
    icon: HeartHandshake,
    title: "I Want to Help",
    desc: "Volunteer opportunities in your community to give back.",
    badge: "Free Volunteer Opportunities"
  }
];

type CategoryDef = (typeof CATEGORY_DEFINITIONS)[number];

function CategoryCard({ cat, isSelected, onToggle }: { cat: CategoryDef; isSelected: boolean; onToggle: () => void }) {
  const IconComp = cat.icon;
  return (
    <button
      id={`need-${cat.id}`}
      type="button"
      onClick={onToggle}
      className={`w-full p-6 rounded-3xl border-2 text-left flex flex-col justify-between transition-all relative overflow-hidden group ${
        isSelected
          ? "border-brand-olive bg-white shadow-md shadow-brand-olive/10 ring-2 ring-brand-olive/20"
          : "border-brand-ink/10 bg-white hover:border-brand-olive/30 hover:shadow-xs"
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 rounded-2xl ${isSelected ? "bg-brand-olive text-white" : "bg-brand-cream text-brand-olive group-hover:bg-brand-olive/10"}`}>
            <IconComp size={22} />
          </div>
          {isSelected && (
            <CheckCircle2 size={20} className="text-brand-olive" />
          )}
        </div>

        <div className="text-xl font-serif font-medium text-brand-ink mb-1">
          {cat.title}
        </div>
        <p className="text-xs text-brand-ink/65 leading-relaxed mb-4">
          {cat.desc}
        </p>
      </div>

      <div className="mt-2 pt-3 border-t border-brand-cream flex items-center gap-1.5 text-[11px] font-semibold text-brand-olive">
        <Tag size={12} />
        <span>{cat.badge}</span>
      </div>
    </button>
  );
}

type ReportReason = "Wrong info" | "No longer operating" | "Feels like a scam" | "Other";

export default function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [county, setCounty] = useState("");
  const [state, setState] = useState("");
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>([]);
  const [results, setResults] = useState<ResourceItem[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [loadingMoreCategory, setLoadingMoreCategory] = useState<string | null>(null);

  // Distinct from "no results found": this is set only when the search
  // itself failed (network issue, rate limit, backend error), so the UI
  // never shows an empty-state message that implies "there's nothing here"
  // when the real story is "we couldn't check."
  const [searchError, setSearchError] = useState<string | null>(null);
  const [categoryLoadError, setCategoryLoadError] = useState<string | null>(null);

  const [savedSearch, setSavedSearch] = useState<SavedSearch | null>(null);

  // "Report an issue" flow, keyed by `${name}-${website}` per card.
  const [reportingKey, setReportingKey] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("Wrong info");
  const [reportDetails, setReportDetails] = useState("");
  const [reportStatus, setReportStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    setSavedSearch(loadSavedSearch());
  }, []);

  const handleStart = () => setStep("location");

  const handleResumeSearch = () => {
    if (!savedSearch) return;
    setCounty(savedSearch.county);
    setState(savedSearch.state);
    setSelectedNeeds(savedSearch.selectedNeeds);
    setResults(savedSearch.results);
    setSources(savedSearch.sources);
    setActiveFilter(savedSearch.activeFilter);
    setStep("results");
  };

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (county.trim() && state.trim()) setStep("needs");
  };

  const handleNeedsSubmit = async () => {
    if (selectedNeeds.length === 0) return;
    setSearchError(null);
    setStep("searching");
    try {
      const response = await findLocalResources(county, state, selectedNeeds as ResourceCategory[]);
      setResults(response.results);
      setSources(response.sources);
      const filter = selectedNeeds.length === 1 ? selectedNeeds[0] : "All";
      setActiveFilter(filter);
      setStep("results");
      saveSearch({
        county,
        state,
        selectedNeeds,
        results: response.results,
        sources: response.sources,
        activeFilter: filter,
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStep("needs");
    }
  };

  const handleExploreMoreCategory = async (catId: string) => {
    setLoadingMoreCategory(catId);
    setCategoryLoadError(null);
    try {
      const response = await findLocalResources(county, state, [catId] as ResourceCategory[]);

      setResults(prev => {
        const existingKeys = new Set(prev.map(r => `${r.name}-${r.website}`));
        const filteredNew = response.results.filter(r => !existingKeys.has(`${r.name}-${r.website}`));
        return [...prev, ...filteredNew];
      });
      setSources(prev => {
        const existingUrls = new Set(prev.map(s => s.url));
        return [...prev, ...response.sources.filter(s => !existingUrls.has(s.url))];
      });

      setSelectedNeeds(prev => prev.includes(catId) ? prev : [...prev, catId]);
      setActiveFilter(catId);
    } catch (err) {
      setCategoryLoadError(err instanceof Error ? err.message : "Couldn't load that category. Please try again.");
    } finally {
      setLoadingMoreCategory(null);
    }
  };

  const handleSubmitReport = async (resource: ResourceItem) => {
    setReportStatus("sending");
    try {
      await reportResourceIssue({
        name: resource.name,
        website: resource.website,
        county,
        state,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setReportStatus("sent");
    } catch {
      setReportStatus("error");
    }
  };

  const openReportForm = (key: string) => {
    setReportingKey(key);
    setReportReason("Wrong info");
    setReportDetails("");
    setReportStatus("idle");
  };

  const toggleNeed = (needId: string) => {
    setSelectedNeeds(prev => 
      prev.includes(needId) ? prev.filter(n => n !== needId) : [...prev, needId]
    );
  };

  const selectAllNeeds = () => {
    setSelectedNeeds(CATEGORY_DEFINITIONS.map(c => c.id));
  };

  const reset = () => {
    setStep("welcome");
    setCounty("");
    setState("");
    setSelectedNeeds([]);
    setResults([]);
    setSources([]);
    setActiveFilter("All");
    setLoadingMoreCategory(null);
    setSearchError(null);
    setCategoryLoadError(null);
    setSavedSearch(loadSavedSearch());
  };

  const filteredResults = activeFilter === "All" 
    ? results 
    : results.filter(r => r.category === activeFilter);

  const unselectedCategories = CATEGORY_DEFINITIONS.filter(c => !selectedNeeds.includes(c.id));
  const hasVolunteerCategory = selectedNeeds.includes("Volunteer") || results.some(r => r.category === "Volunteer");

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 md:p-12 max-w-5xl mx-auto">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-8 md:mb-12">
        <div className="flex items-center gap-2.5" id="header-logo">
          <div className="p-2 bg-brand-olive text-white rounded-xl shadow-xs">
            <Heart size={20} />
          </div>
          <div>
            <span className="text-2xl font-serif font-semibold tracking-tight text-brand-olive block leading-none">
              Community Bridge
            </span>
            <span className="text-[10px] uppercase tracking-widest text-brand-ink/40 font-semibold block mt-1">
              AI-Assisted Local Search
            </span>
          </div>
        </div>

        {step !== "welcome" && (
          <button 
            id="back-btn"
            onClick={() => {
              if (step === "location") setStep("welcome");
              if (step === "needs") setStep("location");
              if (step === "results") setStep("needs");
            }}
            className="flex items-center gap-1.5 text-sm text-brand-olive font-medium px-4 py-2 rounded-full border border-brand-olive/20 hover:bg-brand-olive/5 transition-all"
          >
            <ChevronLeft size={16} />
            Back
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="w-full flex-1 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {/* STEP 1: WELCOME */}
          {step === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-8 py-6"
              id="step-welcome"
            >
              <div className="inline-flex items-center gap-2 bg-brand-olive/10 text-brand-olive px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider">
                <Sparkles size={14} /> Here when you need a hand
              </div>

              <h1 className="text-4xl sm:text-6xl md:text-7xl font-light text-brand-ink leading-[1.15]">
                Support for the <span className="italic font-serif text-brand-olive">next chapter</span> of your journey.
              </h1>

              <p className="text-base sm:text-lg text-brand-ink/75 max-w-2xl mx-auto leading-relaxed">
                Whether you are working, between jobs, caring for family, or looking to lend a hand, we search the web for local housing, food, job, senior, veteran, pet, and small business resources, plus free volunteer opportunities. Always confirm details before visiting or applying.
              </p>

              {/* Highlight Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto text-left pt-4">
                <div className="bg-white p-4 rounded-2xl border border-brand-ink/5 shadow-xs space-y-1">
                  <div className="text-brand-olive font-semibold text-xs uppercase tracking-wider flex items-center gap-1">
                    <Home size={13} /> Housing & Utility Relief
                  </div>
                  <p className="text-xs text-brand-ink/60">Rental aid, utility help, PadSplit & hotels.</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-brand-ink/5 shadow-xs space-y-1">
                  <div className="text-brand-olive font-semibold text-xs uppercase tracking-wider flex items-center gap-1">
                    <ShoppingBag size={13} /> Food & Savings
                  </div>
                  <p className="text-xs text-brand-ink/60">Pantries & end-of-day food discounts.</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-brand-ink/5 shadow-xs space-y-1">
                  <div className="text-brand-olive font-semibold text-xs uppercase tracking-wider flex items-center gap-1">
                    <FileText size={13} /> Jobs & Resume Help
                  </div>
                  <p className="text-xs text-brand-ink/60">Free resume reviews & job centers.</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-brand-ink/5 shadow-xs space-y-1">
                  <div className="text-brand-olive font-semibold text-xs uppercase tracking-wider flex items-center gap-1">
                    <HeartHandshake size={13} /> Volunteer
                  </div>
                  <p className="text-xs text-brand-ink/60">Give back with zero-fee opportunities.</p>
                </div>
              </div>

              <p className="text-xs text-brand-ink/45 max-w-md mx-auto -mt-1">
                Plus home repair, senior, veteran, pet, and small business resources.
              </p>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  id="start-btn"
                  onClick={handleStart}
                  className="inline-flex items-center gap-3 bg-brand-olive text-white px-9 py-4 rounded-full text-lg font-medium hover:scale-105 active:scale-95 transition-all shadow-lg shadow-brand-olive/20"
                >
                  Find Local Resources <ArrowRight size={20} />
                </button>
                {savedSearch && (
                  <button
                    id="resume-search-btn"
                    onClick={handleResumeSearch}
                    className="inline-flex items-center gap-2 text-brand-olive text-sm font-medium px-5 py-3 rounded-full border border-brand-olive/25 hover:bg-brand-olive/5 transition-all"
                  >
                    <History size={16} /> Resume search for {savedSearch.county} County, {savedSearch.state}
                  </button>
                )}
              </div>

              <p className="text-[11px] text-brand-ink/45 max-w-md mx-auto pt-2">
                In an emergency, call <span className="font-semibold">911</span>. For non-emergency help finding local services, you can also call <span className="font-semibold">211</span> any time.
              </p>
            </motion.div>
          )}

          {/* STEP 2: LOCATION */}
          {step === "location" && (
            <motion.div
              key="location"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8 max-w-xl mx-auto w-full py-4"
              id="step-location"
            >
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-widest text-brand-olive">Step 1 of 2</div>
                <h2 className="text-3xl sm:text-4xl font-serif">Where are you located?</h2>
                <p className="text-brand-ink/60 text-sm sm:text-base">
                  Tell us your county and state so we can share community programs available near you.
                </p>
              </div>

              <form onSubmit={handleLocationSubmit} className="space-y-6 bg-white p-6 sm:p-8 rounded-3xl border border-brand-ink/5 shadow-xs">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-brand-ink/60">County</label>
                    <input
                      id="county-input"
                      type="text"
                      required
                      maxLength={60}
                      pattern="[A-Za-z\u00C0-\u024F' .-]{2,60}"
                      title="Letters, spaces, hyphens, and apostrophes only"
                      placeholder="e.g. Cook or Maricopa"
                      value={county}
                      onChange={(e) => setCounty(e.target.value)}
                      className="w-full bg-brand-cream/50 border border-brand-ink/10 rounded-xl py-3.5 px-4 text-lg text-brand-ink focus:border-brand-olive focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-brand-ink/60">State</label>
                    <select
                      id="state-input"
                      required
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full bg-brand-cream/50 border border-brand-ink/10 rounded-xl py-3.5 px-4 text-lg text-brand-ink focus:border-brand-olive focus:bg-white outline-none transition-all appearance-none"
                    >
                      <option value="" disabled>Select your state</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  id="location-next-btn"
                  type="submit"
                  className="w-full bg-brand-olive text-white py-4 rounded-xl font-medium flex justify-center items-center gap-2 hover:bg-brand-olive/90 active:scale-[0.99] transition-all shadow-md shadow-brand-olive/15"
                >
                  Continue <ArrowRight size={18} />
                </button>
              </form>
            </motion.div>
          )}

          {/* STEP 3: NEEDS SELECTION */}
          {step === "needs" && (
            <motion.div
              key="needs"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8 py-4"
              id="step-needs"
            >
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-widest text-brand-olive">Step 2 of 2</div>
                  <h2 className="text-3xl sm:text-4xl font-serif">What can we help you find?</h2>
                  <p className="text-brand-ink/60 text-sm sm:text-base">
                    Select a category to explore resources in <span className="font-semibold text-brand-ink">{county} County, {state}</span>. You can always check other lists later.
                  </p>
                </div>
                <button
                  id="select-all-btn"
                  onClick={selectAllNeeds}
                  className="text-xs font-semibold text-brand-olive uppercase tracking-wider hover:underline self-start sm:self-auto"
                >
                  Select All
                </button>
              </div>

              {/* Grid of categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {CATEGORY_DEFINITIONS.filter((cat) => cat.id !== "Volunteer").map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    cat={cat}
                    isSelected={selectedNeeds.includes(cat.id)}
                    onToggle={() => toggleNeed(cat.id)}
                  />
                ))}
              </div>

              {/* Bridge divider, then "I Want to Help" centered on its own below the rest */}
              <div className="relative flex items-center justify-center py-2" aria-hidden="true">
                <div className="w-full border-t border-brand-olive/15" />
                <span className="absolute bg-brand-cream px-4 text-[11px] uppercase tracking-widest text-brand-ink/40 font-semibold">
                  or lend a hand
                </span>
              </div>

              <div className="max-w-sm mx-auto w-full">
                {CATEGORY_DEFINITIONS.filter((cat) => cat.id === "Volunteer").map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    cat={cat}
                    isSelected={selectedNeeds.includes(cat.id)}
                    onToggle={() => toggleNeed(cat.id)}
                  />
                ))}
              </div>

              {/* Gentle Banner for Volunteer */}
              {selectedNeeds.includes("Volunteer") && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-xs sm:text-sm">
                  <ShieldCheck size={20} className="text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Free Volunteer Opportunities</span>
                    All volunteer activities on Community Bridge are free to participate in. You will never be asked for membership fees or deposits to lend a helping hand.
                  </div>
                </div>
              )}

              {searchError && (
                <div className="bg-red-600/5 border border-red-600/20 rounded-2xl p-4 flex items-start gap-3 text-red-900 text-sm" id="search-error-banner">
                  <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">We couldn't complete that search</span>
                    {searchError}
                  </div>
                </div>
              )}

              <button
                id="search-btn"
                onClick={handleNeedsSubmit}
                disabled={selectedNeeds.length === 0}
                className="w-full bg-brand-olive text-white py-4 rounded-xl font-medium flex justify-center items-center gap-2 hover:bg-brand-olive/90 active:scale-[0.99] transition-all disabled:opacity-30 disabled:cursor-not-allowed mt-6 shadow-xl shadow-brand-olive/20 text-lg"
              >
                View Resources ({selectedNeeds.length} selected)
              </button>
            </motion.div>
          )}

          {/* STEP 4: SEARCHING */}
          {step === "searching" && (
            <motion.div
              key="searching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-8 py-20 max-w-md mx-auto"
              id="step-searching"
            >
              <div className="relative inline-block">
                <div className="w-20 h-20 rounded-full border-4 border-brand-olive/20 border-t-brand-olive animate-spin mx-auto" />
                <Heart size={24} className="text-brand-olive absolute inset-0 m-auto animate-pulse" />
              </div>

              <div className="space-y-3">
                <h2 className="text-3xl font-serif font-light italic text-brand-ink">Finding local resources for you...</h2>
                <p className="text-brand-ink/60 text-sm leading-relaxed">
                  Searching for options in <span className="font-semibold text-brand-ink">{county} County, {state}</span> for <span className="font-semibold text-brand-olive">{selectedNeeds.map(id => CATEGORY_DEFINITIONS.find(c => c.id === id)?.title).join(", ")}</span>.
                </p>
              </div>
            </motion.div>
          )}

          {/* STEP 5: RESULTS */}
          {step === "results" && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 py-4"
              id="step-results"
            >
              {/* Top Bar */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-brand-ink/10 pb-6">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-brand-olive flex items-center gap-1">
                    <MapPin size={14} /> {county} County, {state}
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-serif">
                    {selectedNeeds.length === 1 
                      ? `${CATEGORY_DEFINITIONS.find(c => c.id === selectedNeeds[0])?.title} Resources`
                      : "Community Resources"}
                  </h2>
                  <p className="text-brand-ink/60 text-sm">
                    Showing {filteredResults.length} helpful resource{filteredResults.length === 1 ? "" : "s"} available in your area.
                  </p>
                </div>

                <button 
                  id="reset-btn"
                  onClick={reset}
                  className="bg-white border border-brand-ink/10 px-5 py-2.5 rounded-full text-sm font-medium text-brand-olive hover:border-brand-olive transition-colors flex items-center gap-2 self-start md:self-auto"
                >
                  <Search size={14} /> Start Over
                </button>
              </div>

              {/* Filter Tabs */}
              {selectedNeeds.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none" id="filter-tabs">
                  <button
                    id="filter-All"
                    onClick={() => setActiveFilter("All")}
                    className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                      activeFilter === "All"
                        ? "bg-brand-olive text-white shadow-xs"
                        : "bg-white text-brand-ink/60 hover:text-brand-ink border border-brand-ink/5"
                    }`}
                  >
                    All Selected ({results.length})
                  </button>
                  {CATEGORY_DEFINITIONS.filter(c => selectedNeeds.includes(c.id)).map((cat) => (
                    <button
                      key={cat.id}
                      id={`filter-${cat.id}`}
                      onClick={() => setActiveFilter(cat.id)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                        activeFilter === cat.id
                          ? "bg-brand-olive text-white shadow-xs"
                          : "bg-white text-brand-ink/60 hover:text-brand-ink border border-brand-ink/5"
                      }`}
                    >
                      {cat.title} ({results.filter(r => r.category === cat.id).length})
                    </button>
                  ))}
                </div>
              )}

              {/* Always-visible crisis line: this population is more likely than most
                  to be in an acute situation, so this stays visible regardless of filter. */}
              <div className="bg-red-700/5 border border-red-700/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-red-950" id="crisis-banner">
                <PhoneCall size={20} className="text-red-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-red-900 block mb-0.5">Need help right now?</span>
                  If this is an emergency, call <span className="font-semibold">911</span>. For urgent but non-emergency help (eviction, shelter, safety), call <span className="font-semibold">211</span> to be connected with someone in {county} County, {state} right away.
                </div>
              </div>

              {categoryLoadError && (
                <div className="bg-red-600/5 border border-red-600/20 rounded-2xl p-4 flex items-start gap-3 text-red-900 text-xs sm:text-sm" id="category-error-banner">
                  <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                  <div>{categoryLoadError}</div>
                </div>
              )}

              {sources.length > 0 && (
                <details className="bg-white border border-brand-ink/10 rounded-2xl p-4 sm:p-5 text-xs sm:text-sm text-brand-ink/70" id="sources-panel">
                  <summary className="cursor-pointer font-semibold text-brand-ink/80 flex items-center gap-2">
                    <Link2 size={16} className="text-brand-olive" /> Sources checked for this search ({sources.length})
                  </summary>
                  <p className="mt-3 mb-2 text-brand-ink/55">
                    These results were cross-referenced against the following pages. Results aren't independently verified, always confirm current details directly with the organization.
                  </p>
                  <ul className="space-y-1 mt-2">
                    {sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand-olive hover:underline break-all">
                          {s.title || s.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Supportive Tips & Guidance Banners */}
              {(activeFilter === "Housing" || (activeFilter === "All" && selectedNeeds.includes("Housing"))) && (
                <div className="bg-blue-800/5 border border-blue-800/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-blue-950">
                  <Home size={20} className="text-blue-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-blue-900 block mb-0.5">Rental, Utility & Housing Support</span>
                    If you need assistance with rent or utility bills, local community action agencies and housing authorities offer emergency grant relief. For flexible rooming without long leases, options like <strong className="font-semibold">PadSplit</strong> or <strong className="font-semibold">Extended Stay Hotels</strong> are also available.
                  </div>
                </div>
              )}

              {(activeFilter === "Jobs" || (activeFilter === "All" && selectedNeeds.includes("Jobs"))) && (
                <div className="bg-amber-800/5 border border-amber-800/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-amber-950">
                  <FileText size={20} className="text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-900 block mb-0.5">Resume & Career Guidance</span>
                    Looking to polish your resume or transition into a new role? Local American Job Centers and community libraries offer free 1-on-1 resume reviews, cover letter assistance, and interview workshops.
                  </div>
                </div>
              )}

              {(activeFilter === "Food" || (activeFilter === "All" && selectedNeeds.includes("Food"))) && (
                <div className="bg-emerald-800/5 border border-emerald-800/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-emerald-950">
                  <ShoppingBag size={20} className="text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-emerald-900 block mb-0.5">End-of-Day Surplus Food & Grocery Savings</span>
                    Looking for fresh grocery savings? Check apps like <strong className="font-semibold">Too Good To Go</strong> or <strong className="font-semibold">Flashfood</strong>, or visit local bakeries and grocery stores near closing time for fresh surplus meals at deep discounts.
                  </div>
                </div>
              )}

              {(activeFilter === "UpSkill" || (activeFilter === "All" && selectedNeeds.includes("UpSkill"))) && (
                <div className="bg-purple-800/5 border border-purple-800/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-purple-950">
                  <GraduationCap size={20} className="text-purple-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-purple-900 block mb-0.5">Free Trade Courses & Education Grants</span>
                    Not sure what field to pursue yet? The <strong className="font-semibold">O*NET Interest Profiler</strong> and <strong className="font-semibold">CareerOneStop's Skills Matcher</strong> (both free, run by the U.S. Department of Labor) can help narrow that down before you commit to a program. Once you have a direction, ask your local workforce center about <strong className="font-semibold">WIOA grants</strong> or <strong className="font-semibold">Pell Grants</strong>, many trade certificates (HVAC, CDL, Healthcare) can be 100% tuition-funded.
                  </div>
                </div>
              )}

              {hasVolunteerCategory && (activeFilter === "Volunteer" || activeFilter === "All") && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-amber-950">
                  <ShieldCheck size={20} className="text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-900 block mb-0.5">Free Volunteer Opportunities</span>
                    Giving back is a wonderful way to build connections. All volunteer positions listed here are completely free to join.
                  </div>
                </div>
              )}

              {(activeFilter === "HomeRepair" || (activeFilter === "All" && selectedNeeds.includes("HomeRepair"))) && (
                <div className="bg-orange-800/5 border border-orange-800/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-orange-950">
                  <Wrench size={20} className="text-orange-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-orange-900 block mb-0.5">Home Repair & Accessibility Grants</span>
                    Many counties offer free weatherization, ramp installation, or minor repair programs, often through Area Agencies on Aging or USDA rural repair grants. Be cautious of any contractor demanding full payment upfront, a well-known scam pattern that specifically targets seniors.
                  </div>
                </div>
              )}

              {(activeFilter === "Seniors" || (activeFilter === "All" && selectedNeeds.includes("Seniors"))) && (
                <div className="bg-sky-800/5 border border-sky-800/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-sky-950">
                  <Users size={20} className="text-sky-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-sky-900 block mb-0.5">Senior Support Services</span>
                    Local Area Agencies on Aging are a great first call, they can connect you to meal delivery, transportation, and free Medicare counseling (SHIP counselors) all in one place.
                  </div>
                </div>
              )}

              {(activeFilter === "Veterans" || (activeFilter === "All" && selectedNeeds.includes("Veterans"))) && (
                <div className="bg-stone-700/5 border border-stone-700/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-stone-950">
                  <Award size={20} className="text-stone-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-stone-900 block mb-0.5">VA & Veteran Support</span>
                    Your local Veteran Service Organization (VSO), such as the VFW or American Legion, can help navigate VA benefits claims at no cost, this is often faster than going through the VA alone.
                  </div>
                </div>
              )}

              {(activeFilter === "Animals" || (activeFilter === "All" && selectedNeeds.includes("Animals"))) && (
                <div className="bg-teal-800/5 border border-teal-800/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-teal-950">
                  <PawPrint size={20} className="text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-teal-900 block mb-0.5">Pet Food & Vet Care</span>
                    Local humane societies often run low-cost vaccine and spay/neuter clinics, and many food banks now have a pet food pantry section too, worth asking even if it's not listed outright.
                  </div>
                </div>
              )}

              {(activeFilter === "Business" || (activeFilter === "All" && selectedNeeds.includes("Business"))) && (
                <div className="bg-indigo-800/5 border border-indigo-800/15 p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-indigo-950">
                  <Rocket size={20} className="text-indigo-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-indigo-900 block mb-0.5">SBA, SCORE & Free Mentorship</span>
                    <strong className="font-semibold">SCORE</strong> pairs you with a free, experienced business mentor, genuinely one of the best-kept secrets for new entrepreneurs. Your local Small Business Development Center (SBDC) offers free consulting too. Be wary of anything asking you to pay upfront for a "business opportunity," a real mentor or SBA program never charges you to get started.
                  </div>
                </div>
              )}

              {/* Results Grid */}
              {filteredResults.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl border border-brand-ink/5 text-center space-y-4">
                  <Info size={40} className="text-brand-olive/40 mx-auto" />
                  <p className="text-xl font-serif italic text-brand-ink">No resources found under this category.</p>
                  <p className="text-brand-ink/60 text-sm max-w-md mx-auto">
                    Try exploring one of the other lists below for {county} County.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="results-grid">
                  {filteredResults.map((resource, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="bg-white p-7 rounded-[28px] border border-brand-ink/5 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col justify-between h-full"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-3 py-1 bg-brand-cream text-brand-olive text-[11px] font-bold uppercase tracking-wider rounded-full">
                              {resource.category}
                            </span>
                            {resource.tag && (
                              <span className="px-2.5 py-1 bg-brand-olive/10 text-brand-olive text-[10px] font-semibold rounded-full flex items-center gap-1">
                                <Tag size={10} /> {resource.tag}
                              </span>
                            )}
                            {resource.isVolunteer && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                                Volunteer
                              </span>
                            )}
                          </div>

                          <a 
                            href={resource.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-full border border-brand-olive/20 text-brand-olive hover:bg-brand-olive hover:text-white transition-colors shrink-0"
                            title="Visit Official Website"
                          >
                            <ExternalLink size={16} />
                          </a>
                        </div>

                        <h3 className="text-2xl font-serif font-medium text-brand-ink mb-3 group-hover:text-brand-olive transition-colors">
                          {resource.name}
                        </h3>

                        <p className="text-brand-ink/70 text-sm leading-relaxed mb-6">
                          {resource.description}
                        </p>
                      </div>

                      <div className="space-y-2.5 pt-5 border-t border-brand-cream mt-auto">
                        {resource.phone && (
                          <div className="flex items-center gap-2.5 text-xs text-brand-ink/75 font-medium">
                            <Phone size={14} className="text-brand-olive shrink-0" />
                            <span>{resource.phone}</span>
                          </div>
                        )}
                        {resource.address && (
                          <div className="flex items-start gap-2.5 text-xs text-brand-ink/75">
                            <MapPin size={14} className="text-brand-olive shrink-0 mt-0.5" />
                            <span>{resource.address}</span>
                          </div>
                        )}
                      </div>

                      {(() => {
                        const reportKey = `${resource.name}-${resource.website}`;
                        const isReporting = reportingKey === reportKey;
                        return (
                          <div className="pt-4 mt-3 border-t border-brand-cream" id={`report-${i}`}>
                            {!isReporting && (
                              <button
                                type="button"
                                onClick={() => openReportForm(reportKey)}
                                className="text-[11px] text-brand-ink/40 hover:text-red-600 flex items-center gap-1 transition-colors"
                              >
                                <Flag size={12} /> Report an issue with this listing
                              </button>
                            )}

                            {isReporting && reportStatus === "sent" && (
                              <p className="text-[11px] text-brand-olive font-medium flex items-center gap-1.5">
                                <CheckCircle2 size={13} /> Thanks, we've flagged this for review.
                              </p>
                            )}

                            {isReporting && reportStatus !== "sent" && (
                              <div className="space-y-2.5">
                                <label className="text-[10px] font-semibold uppercase tracking-wider text-brand-ink/50 block">
                                  What's wrong?
                                </label>
                                <select
                                  value={reportReason}
                                  onChange={(e) => setReportReason(e.target.value as ReportReason)}
                                  className="w-full text-xs bg-brand-cream/50 border border-brand-ink/10 rounded-lg py-2 px-2.5 text-brand-ink outline-none focus:border-brand-olive"
                                >
                                  <option>Wrong info</option>
                                  <option>No longer operating</option>
                                  <option>Feels like a scam</option>
                                  <option>Other</option>
                                </select>
                                <textarea
                                  value={reportDetails}
                                  onChange={(e) => setReportDetails(e.target.value)}
                                  placeholder="Optional details"
                                  maxLength={1000}
                                  rows={2}
                                  className="w-full text-xs bg-brand-cream/50 border border-brand-ink/10 rounded-lg py-2 px-2.5 text-brand-ink outline-none focus:border-brand-olive resize-none"
                                />
                                {reportStatus === "error" && (
                                  <p className="text-[11px] text-red-600">Couldn't send that, please try again.</p>
                                )}
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={reportStatus === "sending"}
                                    onClick={() => handleSubmitReport(resource)}
                                    className="text-[11px] font-semibold text-white bg-brand-olive px-3 py-1.5 rounded-full disabled:opacity-50"
                                  >
                                    {reportStatus === "sending" ? "Sending..." : "Submit report"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReportingKey(null)}
                                    className="text-[11px] font-medium text-brand-ink/50 px-3 py-1.5"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </motion.div>
                  ))}
                </div>
              )}

              {/* FURTHER EXPLORE OTHER LISTS SECTION */}
              <div className="pt-10 border-t border-brand-ink/10 space-y-6" id="explore-more-section">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-brand-olive flex items-center gap-1.5">
                    <Sparkles size={14} /> Explore Further
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif text-brand-ink">
                    Explore other helpful categories in {county} County
                  </h3>
                  <p className="text-brand-ink/60 text-sm">
                    Click any category below to load additional resources whenever you are ready.
                  </p>
                </div>

                {unselectedCategories.length === 0 ? (
                  <div className="bg-brand-olive/5 p-6 rounded-2xl border border-brand-olive/10 text-center">
                    <p className="text-sm font-medium text-brand-olive">
                      You've loaded all available resource categories for {county} County, {state}!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {unselectedCategories.map((cat) => {
                      const IconComponent = cat.icon;
                      const isLoadingThis = loadingMoreCategory === cat.id;

                      return (
                        <div
                          key={cat.id}
                          className="bg-white p-6 rounded-3xl border border-brand-ink/10 shadow-xs flex flex-col justify-between hover:border-brand-olive/40 transition-all group"
                        >
                          <div className="space-y-3 mb-6">
                            <div className="flex items-center justify-between">
                              <div className="p-3 bg-brand-cream text-brand-olive rounded-2xl group-hover:bg-brand-olive group-hover:text-white transition-colors">
                                <IconComponent size={20} />
                              </div>
                              <span className="text-[10px] uppercase font-bold text-brand-olive bg-brand-olive/10 px-2.5 py-1 rounded-full">
                                {cat.badge}
                              </span>
                            </div>
                            <h4 className="text-xl font-serif font-medium text-brand-ink">
                              {cat.title}
                            </h4>
                            <p className="text-xs text-brand-ink/65 leading-relaxed">
                              {cat.desc}
                            </p>
                          </div>

                          <button
                            id={`explore-more-${cat.id}`}
                            onClick={() => handleExploreMoreCategory(cat.id)}
                            disabled={loadingMoreCategory !== null}
                            className="w-full bg-brand-cream text-brand-olive hover:bg-brand-olive hover:text-white py-3 px-4 rounded-xl font-medium text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                          >
                            {isLoadingThis ? (
                              <>
                                <Loader2 size={14} className="animate-spin" /> Finding resources...
                              </>
                            ) : (
                              <>
                                <Plus size={14} /> View {cat.title}
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Verification Notice */}
              <div className="bg-brand-olive/5 p-6 rounded-3xl border border-brand-olive/10 text-center space-y-1 mt-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-olive">A Note on These Results</p>
                <p className="text-xs text-brand-ink/65 italic max-w-2xl mx-auto">
                  These results are found by AI search and are not independently verified by a person. Always confirm operating hours, eligibility requirements, and current availability directly with the organization before visiting or applying. See something wrong? Use "Report an issue" on that listing.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="w-full pt-10 border-t border-brand-olive/10 mt-12 flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] tracking-widest uppercase text-brand-ink/40 font-semibold">
        <p>© 2026 Community Bridge • AI-Assisted Local Search</p>
        <p className="flex items-center gap-3">
          <span>Housing & Utility Aid</span> • <span>End-of-Day Food</span> • <span>Resume Help</span> • <span>Volunteer</span>
        </p>
        <a
          href="https://mimsai.co"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-olive hover:underline normal-case tracking-normal font-medium"
        >
          Built by Mims AI
        </a>
      </footer>
    </div>
  );
}
