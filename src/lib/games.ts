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
 * Loads Buildle (its component, boss catalog, and Daily schedule) as a
 * separate chunk, the first time it is opened, so Skilldle's initial load
 * does not include it.
 */
export const loadBuildle = () => import('../components/BuildleGame');
