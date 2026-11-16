// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// A production build without VITE_ENABLE_BUILDLE.
vi.mock('./lib/games', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/games')>()),
  buildleEnabled: false,
}));

afterEach(cleanup);

describe('game switcher when Buildle is not enabled', () => {
  it('shows Skilldle only, with no switcher and no Buildle view', () => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    render(<App />);

    expect(screen.queryByRole('group', { name: 'Game' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Buildle' })).toBeNull();
    expect(screen.queryByText(/Buildle/)).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Your guess' })).toBeTruthy();
  });
});
