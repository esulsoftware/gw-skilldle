// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SkillCombobox from './SkillCombobox';
import { skills, type Skill } from '../lib/skills';

const byName = (name: string) => skills.find((skill) => skill.name === name)!;

function Harness({
  pool,
  onSubmit,
}: {
  pool: readonly Skill[];
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <label htmlFor="guess">Your guess</label>
      <SkillCombobox
        inputId="guess"
        skills={pool}
        value={value}
        onChange={setValue}
        placeholder="Type a skill"
      />
      <button type="submit">Guess</button>
    </form>
  );
}

function setup(pool: readonly Skill[] = skills) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<Harness pool={pool} onSubmit={onSubmit} />);
  const input = screen.getByRole('combobox', { name: 'Your guess' });
  return { user, onSubmit, input: input as HTMLInputElement };
}

function options() {
  return screen.queryAllByRole('option');
}

function highlighted() {
  return options().filter(
    (option) => option.getAttribute('aria-selected') === 'true',
  );
}

afterEach(() => {
  cleanup();
});

describe('opening and highlighting', () => {
  it('opens on typing without highlighting anything', async () => {
    const { user, input } = setup();
    expect(input.getAttribute('aria-expanded')).toBe('false');

    await user.type(input, 'sand');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(
      screen.getByRole('listbox').id,
    );
    expect(options().length).toBeGreaterThan(0);
    expect(highlighted()).toHaveLength(0);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('does not open on focus alone', async () => {
    const { user, input } = setup();
    await user.click(input);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('arrow keys move the highlight and announce it via aria-activedescendant', async () => {
    const { user, input } = setup();
    await user.type(input, 'sand');

    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toEqual([options()[0]]);
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0].id);

    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toEqual([options()[1]]);

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(highlighted()).toHaveLength(0);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('ArrowDown on an empty input browses the whole pool', async () => {
    const pool = skills.slice(0, 120);
    const { user, input } = setup(pool);
    await user.click(input);
    await user.keyboard('{ArrowDown}');

    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(options()).toHaveLength(50);
    expect(
      screen.getByRole('status').textContent,
    ).toBe('Showing 50 of 120 matches. Keep typing to narrow the list.');
  });
});

describe('choosing without submitting', () => {
  it('Enter on a highlighted suggestion fills the exact name and does not submit', async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, 'rodgorts');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(input.value).toBe("Rodgort's Invocation");
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);

    // A separate Enter submits.
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith("Rodgort's Invocation");
  });

  it('Enter with no highlighted suggestion submits what was typed', async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, 'sandstorm{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('sandstorm');
  });

  it('mouse click fills the input, keeps focus, and does not submit', async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, 'sand');
    const option = screen.getByRole('option', { name: 'Sand Shards' });

    // Pressing on the list must not move focus out of the input.
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.pointerDown(option, { pointerType: 'mouse', pointerId: 1 });
    fireEvent.click(option);

    expect(input.value).toBe('Sand Shards');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it('a tap selects, but a scroll gesture does not', async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, 'sand');
    const touch = { pointerType: 'touch', pointerId: 4 };

    const scrolled = screen.getByRole('option', { name: 'Sandstorm' });
    fireEvent.pointerDown(scrolled, { ...touch, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(scrolled, { ...touch, clientX: 10, clientY: 60 });
    fireEvent.click(scrolled);
    expect(input.value).toBe('sand');

    fireEvent.pointerDown(scrolled, touch);
    fireEvent.pointerCancel(scrolled, touch);
    fireEvent.click(scrolled);
    expect(input.value).toBe('sand');

    const tapped = screen.getByRole('option', { name: 'Quicksand' });
    fireEvent.pointerDown(tapped, { ...touch, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(tapped, touch);
    fireEvent.click(tapped);
    expect(input.value).toBe('Quicksand');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a suggestion with a missing icon can still be chosen', async () => {
    const { user, input } = setup();
    await user.type(input, 'sand shards');
    const option = screen.getByRole('option', { name: 'Sand Shards' });
    fireEvent.error(option.querySelector('img')!);

    fireEvent.click(option);
    expect(input.value).toBe('Sand Shards');
  });

  it('ignores Enter while an IME is composing', async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, 'sand');
    await user.keyboard('{ArrowDown}');

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(input.value).toBe('sand');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('closing', () => {
  it('Escape closes and keeps the typed text', async () => {
    const { user, input } = setup();
    await user.type(input, 'sand');
    await user.keyboard('{ArrowDown}{Escape}');

    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('sand');
    expect(document.activeElement).toBe(input);
  });

  it('Tab closes without choosing and moves focus normally', async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, 'sand');
    await user.keyboard('{ArrowDown}');
    await user.tab();

    expect(input.value).toBe('sand');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Guess' }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('status and accessibility', () => {
  it('shows "No matching skills" with no list', async () => {
    const { user, input } = setup();
    await user.type(input, 'zzzzqqq');

    expect(screen.getByRole('status').textContent).toBe('No matching skills');
    expect(options()).toHaveLength(0);
  });

  it('limits to 50 suggestions with a narrowing hint', async () => {
    const { user, input } = setup();
    await user.type(input, 'a');
    expect(options()).toHaveLength(50);
    expect(screen.getByRole('status').textContent).toMatch(
      /^Showing 50 of \d+ matches\. Keep typing to narrow the list\.$/,
    );
  });

  it('names each option by its skill name only (icons are hidden)', async () => {
    const { user, input } = setup([byName('Sandstorm'), byName('Quicksand')]);
    await user.type(input, 'sand');

    const option = screen.getByRole('option', { name: 'Sandstorm' });
    // alt="" gives the icon no accessible role or name.
    expect(within(option).queryByRole('img')).toBeNull();
    const icon = option.querySelector('img')!;
    expect(icon.getAttribute('alt')).toBe('');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });
});
