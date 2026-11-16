// Types for encounters.mjs (used by the app's tests).

import type { LocationEntry } from './wiki.mjs';

export function eventNpcCategories(bossCategories?: readonly string[]): string[];
export function isEventPage(pageCategories?: readonly string[]): boolean;
export function eventOnlyReason(
  bossCategories: readonly string[],
  locations: readonly LocationEntry[],
  linkedCategories: Record<string, readonly string[]>,
): string | null;
