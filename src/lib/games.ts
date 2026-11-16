/**
 * The games this app hosts. Skilldle is the default view; a landing page
 * could later be added as another value here.
 */
export type Game = 'skilldle' | 'buildle';

export const DEFAULT_GAME: Game = 'skilldle';

export const GAME_OPTIONS: { value: Game; label: string }[] = [
  { value: 'skilldle', label: 'Skilldle' },
  { value: 'buildle', label: 'Buildle' },
];

/**
 * Preview gate, kept while Buildle is tested: it appears in development
 * builds, or in a build made with VITE_ENABLE_BUILDLE=true (e.g. a Vercel
 * preview). The final release removes this gate so production always shows
 * the switcher.
 */
export const buildleEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_BUILDLE === 'true';

/**
 * Loads Buildle (its component, boss catalog, and Daily schedule) as a
 * separate chunk, the first time it is opened, so Skilldle's initial load
 * does not include it.
 */
export const loadBuildle = () =>
  buildleEnabled
    ? import('../components/BuildleGame')
    : Promise.reject(new Error('Buildle is not enabled in this build.'));
