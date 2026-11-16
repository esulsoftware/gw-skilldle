// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import SkillLibrary from './SkillLibrary';

// With the real data every category has at least one elite. To exercise the
// empty state, this file removes the three rank-based PvE elites.
vi.mock('../lib/skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/skills')>();
  return {
    ...actual,
    skills: actual.skills.filter(
      (skill) => !(skill.elite && actual.isRankBasedPveSkill(skill)),
    ),
  };
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it.each(['List', 'Grid'] as const)(
  'shows an empty-state message when a category has no elites (%s)',
  async (view) => {
    const user = userEvent.setup();
    render(<SkillLibrary nmMode />);
    await user.click(screen.getByRole('button', { name: 'Browse skills' }));
    await user.click(screen.getByRole('button', { name: view }));
    await user.click(screen.getByRole('button', { name: 'PvE' }));

    expect(screen.getByText(/No elite PvE skills/)).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();

    await user.click(
      screen.getByRole('checkbox', { name: 'Show non-elite skills' }),
    );
    expect(screen.queryByText(/No elite PvE skills/)).toBeNull();
  },
);
