export type LibraryView = 'list' | 'grid';

export const LIBRARY_VIEW_STORAGE_KEY = 'gw-skilldle-library-view';

/** Saved List/Grid preference; List when missing, invalid, or unavailable. */
export function readLibraryView(): LibraryView {
  try {
    const saved = window.localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY);
    return saved === 'grid' || saved === 'list' ? saved : 'list';
  } catch {
    return 'list';
  }
}

export function saveLibraryView(view: LibraryView): void {
  try {
    window.localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, view);
  } catch {
    // The library still works if browser storage is unavailable.
  }
}

/** NM-only library preference; separate from the List/Grid preference. */
export const NM_SHOW_NON_ELITE_STORAGE_KEY =
  'gw-skilldle-library-nm-show-non-elite';

/** Saved "Show non-elite skills" choice; unchecked when missing or invalid. */
export function readShowNonElite(): boolean {
  try {
    return (
      window.localStorage.getItem(NM_SHOW_NON_ELITE_STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

export function saveShowNonElite(showNonElite: boolean): void {
  try {
    window.localStorage.setItem(
      NM_SHOW_NON_ELITE_STORAGE_KEY,
      String(showNonElite),
    );
  } catch {
    // The library still works if browser storage is unavailable.
  }
}
