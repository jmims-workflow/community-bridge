// Shared between the frontend (state dropdown) and the backend (input validation).
// Keeping this in one place means the two can never drift out of sync.

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  "Puerto Rico", "Guam", "American Samoa", "U.S. Virgin Islands",
  "Northern Mariana Islands",
] as const;

export type USState = (typeof US_STATES)[number];

export function isValidUSState(value: string): value is USState {
  return (US_STATES as readonly string[]).includes(value);
}

// Loose but strict-enough county validation: letters, spaces, periods,
// apostrophes, and hyphens only, reasonable length. Blocks anything
// resembling an attempt to inject extra instructions into the prompt.
const COUNTY_PATTERN = /^[A-Za-z\u00C0-\u024F' .-]{2,60}$/;

export function isValidCountyName(value: string): boolean {
  return COUNTY_PATTERN.test(value.trim());
}
