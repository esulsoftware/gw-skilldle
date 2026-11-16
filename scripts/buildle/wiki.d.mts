// Types for the parts of wiki.mjs used by the app's tests.

import type { DocumentedEntry } from './eligibility.mjs';

export type SkillList = {
  context: string[];
  entries: DocumentedEntry[];
  notes: string[];
};

export type LocationEntry = {
  location: string;
  links: string[];
  condition: string;
};

export function skillLists(body: string): SkillList[];
export function locationEntries(text: string): LocationEntry[];
