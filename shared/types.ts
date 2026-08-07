export type ResourceCategory = "Housing" | "Food" | "Jobs" | "UpSkill" | "Volunteer" | "HomeRepair" | "Seniors" | "Veterans" | "Animals" | "Business" | "Other";

export interface ResourceItem {
  name: string;
  category: ResourceCategory;
  description: string;
  website: string;
  phone?: string;
  address?: string;
  tag?: string;
  isVolunteer?: boolean;
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface FindResourcesRequest {
  county: string;
  state: string;
  needs: ResourceCategory[];
}

export interface FindResourcesResponse {
  results: ResourceItem[];
  sources: GroundingSource[];
  // "cache" means we served a previously fetched result instead of calling the model again.
  servedFrom: "cache" | "live";
  fetchedAt: string;
}

export interface ReportIssueRequest {
  name: string;
  website: string;
  county: string;
  state: string;
  reason: string;
  details?: string;
}
