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
