// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// Buildle is loaded on demand; here the loader can be made to fail.
const loader = vi.hoisted(() => ({ calls: 0, failNext: false }));

vi.mock('./lib/games', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/games')>();
  return {
    ...actual,
    buildleEnabled: true,
    loadBuildle: () => {
      loader.calls += 1;
      if (loader.failNext) {
        loader.failNext = false;
        return Promise.reject(new Error('network'));
      }
      return actual.loadBuildle();
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  window.localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  loader.calls = 0;
  loader.failNext = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const gameButton = (name: 'Skilldle' | 'Buildle') =>
  within(screen.getByRole('group', { name: 'Game' })).getByRole('button', { name });

describe('loading Buildle separately', () => {
  it('is not loaded until Buildle is first opened, and only once', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(loader.calls).toBe(0);

    await user.click(gameButton('Buildle'));
    expect(screen.getByRole('status', { name: '' }).textContent).toMatch(/Loading Buildle/);
    await screen.findByRole('heading', { name: 'Buildle' });

    await user.click(gameButton('Skilldle'));
    await user.click(gameButton('Buildle'));
    expect(loader.calls).toBe(1);
  });

  it('shows a usable error, retries, and keeps Skilldle’s state throughout', async () => {
    loader.failNext = true;
    const user = userEvent.setup();
    render(<App />);
    const skilldleInput = document.getElementById('skill-input') as HTMLInputElement;
    fireEvent.change(skilldleInput, { target: { value: 'Skilldle draft' } });

    await user.click(gameButton('Buildle'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/couldn’t be loaded/);

    await user.click(gameButton('Skilldle'));
    expect(skilldleInput.value).toBe('Skilldle draft');

    await user.click(gameButton('Buildle'));
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Buildle' });
    expect(loader.calls).toBe(2);

    await user.click(gameButton('Skilldle'));
    expect(skilldleInput.value).toBe('Skilldle draft');
  });
});
