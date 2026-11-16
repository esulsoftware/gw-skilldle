// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuildleGame from './BuildleGame';

// Fixture catalog, schedule, and withdrawals built from real skills, so
// rounds are predictable.
const fixture = vi.hoisted(() => {
  const variant = (id: string, skillIds: number[]) => ({
    id,
    skillIds,
    encounter: {
      campaign: 'Prophecies',
      locations: ['Fixture Fields'],
      details: ['only during Fixture Quest'],
    },
    sources: [
      { site: 'Guild Wars Wiki', url: `https://wiki.example/${id}`, revisionId: 1 },
      { site: 'GuildWiki', url: `https://guildwiki.example/${id}`, revisionId: 2 },
    ],
    checkedOn: '2026-11-16',
    excludedTargets: [],
    notes: [],
  });

  return {
    catalog: {
      schemaVersion: 3,
      revision: 1,
      description: 'fixture',
      attribution: 'Fixture attribution.',
      bosses: [
        {
          id: 'grawl-fixture',
          name: 'Grawl Fixture',
          // Chilblains, Life Siphon, Plague Signet (elite), Signet of Agony, Troll Unguent
          variants: [variant('grawl-fixture', [144, 109, 132, 145, 446])],
        },
        {
          id: 'twin-fixture',
          name: 'Twin Fixture',
          // Glimmering Mark (elite), Migraine (elite), Conjure Lightning, Whirlwind
          variants: [variant('twin-fixture', [227, 53, 221, 163])],
        },
      ],
    },
    schedule: {
      schemaVersion: 1,
      description: 'fixture',
      versions: [
        {
          version: 1,
          catalogRevision: 1,
          startsOn: '2026-11-16',
          seed: 'fixture',
          hm: ['grawl-fixture:144', 'twin-fixture:221'],
          nm: ['grawl-fixture:132', 'twin-fixture:227'],
        },
      ],
    },
    withdrawals: {
      description: 'fixture',
      withdrawals: [] as {
        catalogRevision: number;
        puzzleKey: string;
        withdrawnOn: string;
        reason: string;
        correction: string;
      }[],
    },
  };
});

vi.mock('../data/buildle/catalog-r1.json', () => ({ default: fixture.catalog }));
vi.mock('../data/buildle/schedule.json', () => ({ default: fixture.schedule }));
vi.mock('../data/buildle/withdrawals.json', () => ({ default: fixture.withdrawals }));

const TODAY = new Date('2026-11-16T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
  window.localStorage.clear();
  fixture.withdrawals.withdrawals.length = 0;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type User = ReturnType<typeof userEvent.setup>;

function renderGame(random = 0) {
  const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(random);
  const user = userEvent.setup();
  render(<BuildleGame />);
  return { user, random: randomSpy };
}

/** Unmounts and renders again, as a page refresh would (storage is kept). */
function refresh() {
  cleanup();
  const user = userEvent.setup();
  render(<BuildleGame />);
  return user;
}

/**
 * The Buildle game area. Spoiler checks look here: the Skill Library below it
 * lists every skill (including the answer) without singling any out.
 */
const gameHtml = () => document.querySelector('.buildle-game')!.innerHTML;
const bar = () => screen.getByRole('list', { name: 'Boss skill bar' });
const slotTexts = () => within(bar()).getAllByRole('listitem').map((li) => li.textContent);
const guessInput = () => screen.getByLabelText('Your guess') as HTMLInputElement;
const activeMode = () => document.querySelector('.buildle-active-mode')?.textContent;
const incorrectGuesses = () => {
  const region = screen.queryByRole('region', { name: 'Incorrect guesses' });
  return region ? within(region).getAllByRole('listitem') : [];
};

async function guess(user: User, name: string) {
  fireEvent.change(guessInput(), { target: { value: name } });
  await user.click(screen.getByRole('button', { name: 'Guess' }));
}

async function giveUp(user: User) {
  await user.click(screen.getByRole('button', { name: 'Give up / show answer' }));
  await user.click(screen.getByRole('button', { name: 'Yes, show the answer' }));
}

const mode = (user: User, name: 'NM' | 'HM' | 'Daily' | 'Infinite') =>
  user.click(screen.getByRole('button', { name }));

/** Wrong answers for the HM Daily (Grawl Fixture, hiding Chilblains). */
const WRONG = ['Life Siphon', 'Fireball', 'Meteor', 'Healing Breeze', 'Smite', 'Ether Feast'];

/** Text that identifies the boss or its encounter, hidden until the round ends. */
const SPOILERS = ['Grawl Fixture', 'Fixture Fields', 'Fixture Quest', 'wiki.example', 'guildwiki.example'];

describe('Buildle round (HM Daily by default)', () => {
  it('opens on HM Daily for today’s UTC date', () => {
    renderGame();
    expect(activeMode()).toBe('Daily HM');
    expect(screen.getByText(/Daily puzzle: 2026-11-16/)).toBeTruthy();
  });

  it('shows eight slots: four skills, one missing skill, three unused slots', () => {
    renderGame();
    expect(slotTexts()).toEqual([
      'Life Siphon',
      'Plague Signet',
      'Signet of Agony',
      'Troll Unguent',
      '?Missing skill',
      '✕Unused slot',
      '✕Unused slot',
      '✕Unused slot',
    ]);
  });

  it('gives the missing and unused slots distinct treatments and no icon', () => {
    renderGame();
    const items = within(bar()).getAllByRole('listitem');
    expect(items[4].className).toContain('missing');
    expect(items[5].className).toContain('unused');
    expect(items[4].querySelector('img')).toBeNull();
    expect(items[5].querySelector('img')).toBeNull();
    expect(within(items[5]).queryByRole('link')).toBeNull();
  });

  it('shows no hidden skill, boss, location, condition, or boss source before the end', () => {
    renderGame();
    const html = gameHtml();
    expect(html).not.toContain('Chilblains');
    expect(html).not.toContain('/skill-icons/144.png');
    for (const spoiler of SPOILERS) {
      expect(html).not.toContain(spoiler);
    }
    expect(screen.getByRole('link', { name: 'Life Siphon' })).toBeTruthy();
    expect(screen.getByText('Skill details')).toBeTruthy();
  });

  it('keeps one fixed target for the whole round', async () => {
    const { user, random } = renderGame();
    const before = slotTexts();
    random.mockReturnValue(0.99);

    await guess(user, 'Life Siphon');
    await guess(user, 'Fireball');
    await user.click(screen.getByText('Skill details'));

    expect(slotTexts()).toEqual(before);
    await guess(user, 'Chilblains');
    expect(screen.getByRole('heading', { name: 'Solved!' })).toBeTruthy();
  });

  it('a correct guess wins and reveals the skill, boss, encounter, and sources', async () => {
    const { user } = renderGame();
    await guess(user, 'Chilblains');

    expect(screen.getByRole('heading', { name: 'Solved!' })).toBeTruthy();
    expect(slotTexts()[4]).toBe('Missing skill: Chilblains');
    expect(within(bar()).getAllByRole('listitem')[4].className).toContain('answer solved');
    expect(screen.getByText(/Fixture Fields · only during Fixture Quest/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Guild Wars Wiki' }).getAttribute('href')).toBe(
      'https://wiki.example/grawl-fixture',
    );
    expect(screen.getByRole('link', { name: 'GuildWiki' })).toBeTruthy();
    expect(screen.queryByLabelText('Your guess')).toBeNull();
  });

  it('an incorrect guess is marked and recorded; a visible skill does not win', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');

    expect(screen.getByText('Incorrect: Life Siphon is not the missing skill.')).toBeTruthy();
    expect(incorrectGuesses()).toHaveLength(1);
    expect(incorrectGuesses()[0].textContent).toContain('Incorrect');
    expect(screen.queryByRole('heading', { name: 'Solved!' })).toBeNull();
  });

  it('invalid and duplicate guesses show a message and are not counted', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');

    await guess(user, 'Not a real skill');
    expect(screen.getByText('Choose a valid skill from the suggestions.')).toBeTruthy();
    await guess(user, 'Life Siphon');
    expect(screen.getByText('You already guessed that skill.')).toBeTruthy();

    expect(incorrectGuesses()).toHaveLength(1);
    expect(screen.getByText(/\(1\/5\)/)).toBeTruthy();
  });

  it("HM suggestions and validation use Skilldle's pool only", async () => {
    const { user } = renderGame();
    await user.type(guessInput(), 'call of haste');

    const list = document.getElementById('buildle-skill-input-suggestions')!;
    const names = within(list).queryAllByRole('option').map((o) => o.textContent);
    expect(names).toContain('Call of Haste');
    expect(names.some((name) => name?.includes('(PvP)'))).toBe(false);

    for (const outside of ['Snowball', 'Call of Haste (PvP)', 'Stun Immunity']) {
      await guess(user, outside);
      expect(screen.getByText('Choose a valid skill from the suggestions.')).toBeTruthy();
    }
    expect(incorrectGuesses()).toHaveLength(0);
  });
});

describe('give up', () => {
  it('asks for confirmation, and "Keep playing" leaves the round untouched', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');

    await user.click(screen.getByRole('button', { name: 'Give up / show answer' }));
    expect(screen.getByText(/Give up and show the answer\? This ends the round/)).toBeTruthy();
    expect(gameHtml()).not.toContain('Chilblains');

    await user.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(guessInput()).toBeTruthy();
    expect(incorrectGuesses()).toHaveLength(1);
    expect(gameHtml()).not.toContain('Chilblains');
  });

  it('confirming reveals the answer, boss, and sources as given up, not solved', async () => {
    const { user } = renderGame();
    await giveUp(user);

    expect(screen.getByRole('heading', { name: 'You gave up.' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Solved!' })).toBeNull();
    expect(slotTexts()[4]).toBe('Missing skill: Chilblains');
    expect(within(bar()).getAllByRole('listitem')[4].className).toContain('answer gave-up');
    expect(screen.getAllByText('Grawl Fixture').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Guild Wars Wiki' })).toBeTruthy();
    expect(screen.queryByLabelText('Your guess')).toBeNull();
  });

  it('a given-up Daily stays given up after a refresh and cannot restart', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    await giveUp(user);

    refresh();
    expect(screen.getByRole('heading', { name: 'You gave up.' })).toBeTruthy();
    expect(screen.queryByLabelText('Your guess')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Give up / show answer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next puzzle' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Play Infinite' })).toBeTruthy();
    expect(incorrectGuesses()).toHaveLength(1);
  });

  it('Daily offers "Play Infinite"; Infinite offers "Next puzzle" with a new round', async () => {
    const { user } = renderGame();
    await giveUp(user);
    await user.click(screen.getByRole('button', { name: 'Play Infinite' }));
    expect(activeMode()).toBe('Infinite HM');
    expect(guessInput()).toBeTruthy();

    await giveUp(user);
    const ended = slotTexts();
    await user.click(screen.getByRole('button', { name: 'Next puzzle' }));
    expect(guessInput()).toBeTruthy();
    expect(slotTexts()).not.toEqual(ended);
  });
});

describe('Daily persistence', () => {
  it('a refresh restores guesses, the hint count, and a revealed hint', async () => {
    const { user } = renderGame();
    for (const name of WRONG.slice(0, 5)) {
      await guess(user, name);
    }
    await user.click(screen.getByRole('button', { name: 'Reveal boss name' }));
    fireEvent.change(guessInput(), { target: { value: 'unsent' } });

    refresh();
    expect(slotTexts()[4]).toBe('?Missing skill');
    expect(incorrectGuesses()).toHaveLength(5);
    expect(screen.getByText('Grawl Fixture')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reveal boss name' })).toBeNull();
  });

  it('a solved Daily stays solved after a refresh', async () => {
    const { user } = renderGame();
    await guess(user, 'Chilblains');

    refresh();
    expect(screen.getByRole('heading', { name: 'Solved!' })).toBeTruthy();
    expect(screen.queryByLabelText('Your guess')).toBeNull();
  });

  it('saves only under Buildle keys, separately for NM and HM', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    await mode(user, 'NM');
    await guess(user, 'Migraine');

    const keys = Object.keys(window.localStorage).sort();
    expect(keys).toEqual([
      'gw-buildle-daily-v1:hm:2026-11-16',
      'gw-buildle-daily-v1:nm:2026-11-16',
    ]);
    expect(JSON.parse(window.localStorage.getItem(keys[0])!)).toMatchObject({
      guessIds: [109],
      status: 'playing',
      puzzle: { key: 'grawl-fixture:144', catalogRevision: 1, scheduleVersion: 1 },
    });
  });

  it('starts on the next puzzle after midnight UTC', () => {
    vi.setSystemTime(new Date('2026-11-17T00:00:01Z'));
    renderGame();
    expect(screen.getByText(/Daily puzzle: 2026-11-17/)).toBeTruthy();
    expect(slotTexts()).toContain('Glimmering Mark'); // twin-fixture:221 hides Conjure Lightning
    expect(slotTexts()).not.toContain('Conjure Lightning');
  });

  it('before the schedule starts, explains and offers Infinite', async () => {
    vi.setSystemTime(new Date('2026-11-15T23:00:00Z'));
    const { user } = renderGame();
    expect(screen.getByText('Buildle Daily starts on 2026-11-16.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Play Infinite' }));
    expect(guessInput()).toBeTruthy();
  });

  it('ignores a corrupt save and plays today’s puzzle fresh', () => {
    window.localStorage.setItem('gw-buildle-daily-v1:hm:2026-11-16', '{"version":1,"status":"won"');
    renderGame();
    expect(slotTexts()[4]).toBe('?Missing skill');
    expect(incorrectGuesses()).toHaveLength(0);
  });
});

describe('withdrawn Daily', () => {
  const withdrawal = {
    catalogRevision: 1,
    puzzleKey: 'grawl-fixture:144',
    withdrawnOn: '2026-11-16',
    reason: 'The source listed a skill this boss does not use.',
    correction: 'Grawl Fixture uses Mark of Pain, not Chilblains.',
  };

  it('explains the correction, keeps guesses neutrally, and offers Infinite', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    fixture.withdrawals.withdrawals.push(withdrawal);

    const again = refresh();
    expect(screen.getByRole('heading', { name: 'This Daily puzzle was withdrawn' })).toBeTruthy();
    expect(screen.getByText(withdrawal.reason)).toBeTruthy();
    expect(screen.getByText(withdrawal.correction)).toBeTruthy();
    expect(screen.getByText(/As originally published, the intended answer was Chilblains/)).toBeTruthy();
    expect(screen.getByText(/not presented as verified/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Solved!' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'You gave up.' })).toBeNull();
    expect(screen.queryByLabelText('Your guess')).toBeNull();

    const kept = screen.getByRole('region', { name: 'Your guesses' });
    expect(within(kept).getAllByRole('listitem')[0].textContent).toBe('#1Guess 1: Life Siphon');

    await again.click(screen.getByRole('button', { name: 'Play Infinite' }));
    expect(activeMode()).toBe('Infinite HM');
  });

  it('is not silently replaced when unstarted', () => {
    fixture.withdrawals.withdrawals.push(withdrawal);
    renderGame();
    expect(screen.getByRole('heading', { name: 'This Daily puzzle was withdrawn' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Boss skill bar' })).toBeNull();
  });
});

describe('NM and HM', () => {
  it('NM hides an elite and accepts elite guesses only', async () => {
    const { user } = renderGame();
    await mode(user, 'NM');

    expect(slotTexts().slice(0, 4)).toEqual([
      'Chilblains', 'Life Siphon', 'Signet of Agony', 'Troll Unguent',
    ]);

    await guess(user, 'Life Siphon');
    expect(screen.getByText('Buildle NM only accepts elite skills.')).toBeTruthy();
    expect(incorrectGuesses()).toHaveLength(0);

    await guess(user, 'Migraine');
    expect(incorrectGuesses()).toHaveLength(1);
    await guess(user, 'Plague Signet');
    expect(screen.getByRole('heading', { name: 'Solved!' })).toBeTruthy();
  });

  it('NM suggestions offer elite skills only', async () => {
    const { user } = renderGame();
    await mode(user, 'NM');
    await user.type(guessInput(), 'signet of');

    const list = document.getElementById('buildle-skill-input-suggestions')!;
    const names = within(list).queryAllByRole('option').map((o) => o.textContent);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain('Signet of Agony');
  });

  it('NM with two elites hides one and shows the other (Infinite)', async () => {
    // Infinite NM catalog: [Plague Signet, Glimmering Mark, Migraine] → index 1.
    const { user } = renderGame(0.4);
    await mode(user, 'Infinite');
    await mode(user, 'NM');

    const texts = slotTexts();
    expect(texts.filter((t) => t === '?Missing skill')).toHaveLength(1);
    expect(texts).toContain('Migraine');
    expect(texts).not.toContain('Glimmering Mark');
  });

  it('HM can hide a non-elite or an elite skill (Infinite)', async () => {
    let { user } = renderGame(0);
    await mode(user, 'Infinite');
    expect(slotTexts()).not.toContain('Chilblains');
    cleanup();
    vi.restoreAllMocks();

    ({ user } = renderGame(0.3)); // index 2 of 9: Plague Signet (elite)
    await mode(user, 'Infinite');
    expect(slotTexts()).not.toContain('Plague Signet');
    expect(slotTexts()).toContain('Chilblains');
  });
});

describe('four independent rounds', () => {
  it('Daily/Infinite × NM/HM each keep their own round, guesses, and typed text', async () => {
    const { user, random } = renderGame(0);
    const record = async (name: string, draft: string) => {
      await guess(user, name);
      fireEvent.change(guessInput(), { target: { value: draft } });
      return { slots: slotTexts(), guesses: incorrectGuesses().map((li) => li.textContent) };
    };

    const dailyHm = await record('Life Siphon', 'daily hm draft');
    await mode(user, 'NM');
    const dailyNm = await record('Migraine', 'daily nm draft');
    await mode(user, 'Infinite');
    random.mockReturnValue(0.5);
    const infiniteNm = await record('Time Ward', 'infinite nm draft');
    await mode(user, 'HM');
    random.mockReturnValue(0.99);
    const infiniteHm = await record('Fireball', 'infinite hm draft');

    const expectRound = (state: typeof dailyHm, draft: string, label: string) => {
      expect(activeMode()).toBe(label);
      expect(slotTexts()).toEqual(state.slots);
      expect(incorrectGuesses().map((li) => li.textContent)).toEqual(state.guesses);
      expect(guessInput().value).toBe(draft);
    };

    await mode(user, 'Daily');
    expectRound(dailyHm, 'daily hm draft', 'Daily HM');
    await mode(user, 'NM');
    expectRound(dailyNm, 'daily nm draft', 'Daily NM');
    await mode(user, 'Infinite');
    expectRound(infiniteNm, 'infinite nm draft', 'Infinite NM');
    await mode(user, 'HM');
    expectRound(infiniteHm, 'infinite hm draft', 'Infinite HM');
  });

  it('Infinite rounds are not saved and do not touch the Daily', async () => {
    const { user } = renderGame();
    await mode(user, 'Infinite');
    await guess(user, 'Fireball');
    expect(Object.keys(window.localStorage)).toEqual(['gw-buildle-daily-v1:hm:2026-11-16']);
    expect(JSON.parse(window.localStorage.getItem('gw-buildle-daily-v1:hm:2026-11-16')!).guessIds).toEqual([]);
  });
});

describe('boss-name hint', () => {
  it('is unavailable before five incorrect guesses and never auto-reveals', async () => {
    const { user } = renderGame();
    for (const name of WRONG.slice(0, 4)) {
      await guess(user, name);
    }
    expect(screen.queryByRole('button', { name: 'Reveal boss name' })).toBeNull();

    await guess(user, WRONG[4]);
    expect(screen.getByRole('button', { name: 'Reveal boss name' })).toBeTruthy();
    expect(gameHtml()).not.toContain('Grawl Fixture');
  });

  it('reveals the boss name only, keeps the round and target, and stays visible', async () => {
    const { user } = renderGame();
    for (const name of WRONG.slice(0, 5)) {
      await guess(user, name);
    }
    const before = slotTexts();

    await user.click(screen.getByRole('button', { name: 'Reveal boss name' }));
    expect(screen.getByText('Grawl Fixture')).toBeTruthy();
    const html = gameHtml();
    for (const spoiler of SPOILERS.filter((s) => s !== 'Grawl Fixture')) {
      expect(html).not.toContain(spoiler);
    }
    expect(slotTexts()).toEqual(before);

    await guess(user, WRONG[5]);
    expect(screen.getByText('Grawl Fixture')).toBeTruthy();
    expect(incorrectGuesses()).toHaveLength(6);

    await guess(user, 'Chilblains');
    expect(screen.getByRole('heading', { name: 'Solved!' })).toBeTruthy();
  });
});

describe('guess numbering', () => {
  const numbers = () =>
    incorrectGuesses().map((li) => li.querySelector('.buildle-guess-number')!.textContent);

  it('numbers accepted guesses from 1; invalid, duplicate, and non-elite NM guesses take no number', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    await guess(user, 'Not a skill');
    await guess(user, 'Life Siphon');
    await guess(user, 'Fireball');

    expect(numbers()).toEqual(['#1Guess 1: ', '#2Guess 2: ']);
    expect(incorrectGuesses()[1].textContent).toContain('Fireball');

    await mode(user, 'NM');
    await guess(user, 'Life Siphon'); // non-elite: rejected in NM
    await guess(user, 'Migraine');
    expect(numbers()).toEqual(['#1Guess 1: ']);
    expect(incorrectGuesses()[0].textContent).toContain('Migraine');
  });

  it('the winning guess is the next number: "Solved in N guesses"', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    await guess(user, 'Not a skill');
    await guess(user, 'Fireball');
    await guess(user, 'Chilblains');
    expect(screen.getByText('Solved in 3 guesses.')).toBeTruthy();
  });

  it('uses the singular for a first-guess win', async () => {
    const { user } = renderGame();
    await guess(user, 'Chilblains');
    expect(screen.getByText('Solved in 1 guess.')).toBeTruthy();
  });

  it('giving up adds no guess and no solved count', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    await giveUp(user);
    expect(numbers()).toEqual(['#1Guess 1: ']);
    expect(screen.queryByText(/Solved in/)).toBeNull();
  });

  it('numbers survive a Daily reload and switching modes and difficulties', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    await guess(user, 'Fireball');

    const again = refresh();
    expect(numbers()).toEqual(['#1Guess 1: ', '#2Guess 2: ']);

    await mode(again, 'Infinite');
    await mode(again, 'NM');
    await mode(again, 'Daily');
    await mode(again, 'HM');
    expect(numbers()).toEqual(['#1Guess 1: ', '#2Guess 2: ']);
    await guess(again, 'Chilblains');
    expect(screen.getByText('Solved in 3 guesses.')).toBeTruthy();
  });

  it('a new Infinite round starts again at 1', async () => {
    const { user } = renderGame();
    await mode(user, 'Infinite');
    await guess(user, 'Fireball');
    await guess(user, 'Meteor');
    await giveUp(user);
    await user.click(screen.getByRole('button', { name: 'Next puzzle' }));

    expect(numbers()).toEqual([]);
    await guess(user, 'Smite');
    expect(numbers()).toEqual(['#1Guess 1: ']);
  });
});

describe('pinned guess area (same as Skilldle’s)', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    window.matchMedia = originalMatchMedia;
  });

  const form = () => document.querySelector('form.guess-form') as HTMLFormElement | null;

  /** Puts the skill bar above or inside the viewport, as scrolling would. */
  function barTop(top: number) {
    vi.spyOn(bar(), 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
  }

  function trackScrolling(reducedMotion = false) {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    window.matchMedia = vi.fn().mockReturnValue({ matches: reducedMotion }) as unknown as typeof window.matchMedia;
    return scrollIntoView;
  }

  it('uses Skilldle’s pinned form, after the game section, with the same controls', () => {
    renderGame();
    const section = document.querySelector('.buildle-game')!;
    const pinned = form()!;

    expect(pinned.className).toBe('guess-form');
    expect(section.contains(pinned)).toBe(false);
    expect(section.compareDocumentPosition(pinned) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const library = screen.getByRole('heading', { name: 'Skill Library' }).closest('section')!;
    expect(pinned.compareDocumentPosition(library) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const inForm = within(pinned);
    expect(inForm.getByLabelText('Your guess')).toBeTruthy();
    expect(inForm.getByRole('button', { name: 'Guess' })).toBeTruthy();
    expect(inForm.getByRole('button', { name: 'Give up / show answer' })).toBeTruthy();
    expect(pinned.querySelector('.message[aria-live="polite"]')).toBeTruthy();
    // The suggestions list lives inside the pinned form, as in Skilldle.
    expect(pinned.contains(document.getElementById('buildle-skill-input-suggestions'))).toBe(true);
  });

  it('keeps the guess confirmation and messages inside the pinned form', async () => {
    const { user } = renderGame();
    await guess(user, 'Not a skill');
    expect(within(form()!).getByText('Choose a valid skill from the suggestions.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Give up / show answer' }));
    expect(within(form()!).getByRole('button', { name: 'Keep playing' })).toBeTruthy();
  });

  it('leaves no pinned form once the round ends, and shows the result normally', async () => {
    const { user } = renderGame();
    await guess(user, 'Chilblains');
    expect(form()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Solved!' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play Infinite' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Play Infinite' }));
    expect(form()).not.toBeNull();
    await giveUp(user);
    expect(form()).toBeNull();
    expect(screen.getByRole('button', { name: 'Next puzzle' })).toBeTruthy();
  });

  it('shows no pinned form for a withdrawn or not-yet-started Daily', () => {
    fixture.withdrawals.withdrawals.push({
      catalogRevision: 1,
      puzzleKey: 'grawl-fixture:144',
      withdrawnOn: '2026-11-16',
      reason: 'r',
      correction: 'c',
    });
    renderGame();
    expect(form()).toBeNull();
    cleanup();

    fixture.withdrawals.withdrawals.length = 0;
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    renderGame();
    expect(form()).toBeNull();
  });

  it('after an accepted guess, scrolls the skill bar back into view if it is above the screen', async () => {
    const scrollIntoView = trackScrolling();
    const { user } = renderGame();
    barTop(-300);

    await guess(user, 'Life Siphon');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(scrollIntoView.mock.contexts[0]).toBe(bar());

    await guess(user, 'Chilblains'); // the winning guess returns to the bar too
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('does not move the page for invalid, duplicate, or rejected NM guesses', async () => {
    const scrollIntoView = trackScrolling();
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    barTop(-300);
    scrollIntoView.mockClear();

    await guess(user, 'Not a skill');
    await guess(user, 'Life Siphon');
    await mode(user, 'NM');
    barTop(-300);
    await guess(user, 'Life Siphon');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not scroll when the skill bar is already on screen', async () => {
    const scrollIntoView = trackScrolling();
    const { user } = renderGame();
    barTop(40);
    await guess(user, 'Life Siphon');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('jumps without animation when the player prefers reduced motion', async () => {
    const scrollIntoView = trackScrolling(true);
    const { user } = renderGame();
    barTop(-300);
    await guess(user, 'Life Siphon');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('scrolling the page keeps focus and typed text', async () => {
    const { user } = renderGame();
    await user.click(guessInput());
    await user.keyboard('Fire');
    fireEvent.scroll(window);
    expect(document.activeElement).toBe(guessInput());
    expect(guessInput().value).toBe('Fire');
  });
});

describe('give up returns to the revealed answer', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    window.matchMedia = originalMatchMedia;
  });

  /** Records each scroll with what the element showed at that moment. */
  function recordScrolls(reducedMotion = false) {
    const calls: { element: Element; text: string; options: unknown }[] = [];
    Element.prototype.scrollIntoView = function (this: Element, options?: unknown) {
      calls.push({ element: this, text: this.textContent ?? '', options });
    } as typeof Element.prototype.scrollIntoView;
    window.matchMedia = vi.fn().mockReturnValue({ matches: reducedMotion }) as unknown as typeof window.matchMedia;
    return calls;
  }

  it('opening the confirmation and "Keep playing" do not scroll or change the round', async () => {
    const calls = recordScrolls();
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    const before = slotTexts();

    await user.click(screen.getByRole('button', { name: 'Give up / show answer' }));
    await user.click(screen.getByRole('button', { name: 'Keep playing' }));

    expect(calls).toEqual([]);
    expect(slotTexts()).toEqual(before);
    expect(guessInput()).toBeTruthy();
  });

  it('"Yes, show the answer" scrolls to the skill bar after the answer is shown', async () => {
    const calls = recordScrolls();
    const { user } = renderGame();
    await giveUp(user);

    expect(calls).toHaveLength(1);
    expect(calls[0].element).toBe(bar());
    expect(calls[0].text).toContain('Missing skill: Chilblains'); // already rendered
    expect(calls[0].options).toEqual({ behavior: 'smooth', block: 'start' });
    expect(screen.getByRole('heading', { name: 'You gave up.' })).toBeTruthy();
    expect(document.querySelector('form.guess-form')).toBeNull(); // nothing pinned over it
  });

  it('scrolls immediately when reduced motion is preferred', async () => {
    const calls = recordScrolls(true);
    const { user } = renderGame();
    await giveUp(user);
    expect(calls[0].options).toEqual({ behavior: 'auto', block: 'start' });
  });

  it('a finished Daily restored on load does not scroll', async () => {
    const { user } = renderGame();
    await giveUp(user);

    const calls = recordScrolls();
    refresh();
    expect(screen.getByRole('heading', { name: 'You gave up.' })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('an inactive Buildle never initiates the scroll', async () => {
    const calls = recordScrolls();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const user = userEvent.setup();
    render(<BuildleGame active={false} />);
    await giveUp(user);
    expect(screen.getByRole('heading', { name: 'You gave up.' })).toBeTruthy();
    expect(calls).toEqual([]);
  });
});

describe('solve titles', () => {
  it('a first-guess solve shows "Champion of the Gods" in the solved banner', async () => {
    const { user } = renderGame();
    await guess(user, 'Chilblains');

    const banner = screen.getByRole('heading', { name: 'Solved!' }).closest('section')!;
    expect(banner.querySelector('.solve-title')?.textContent).toBe('Title: Champion of the Gods');
  });

  it('counts accepted guesses only: two wrong, one invalid, then a solve is "Flameseeker"', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    await guess(user, 'Not a skill');
    await guess(user, 'Fireball');
    await guess(user, 'Chilblains');

    expect(screen.getByText('Solved in 3 guesses.')).toBeTruthy();
    expect(document.querySelector('.solve-title')?.textContent).toBe('Title: Flameseeker');
  });

  it('the title is kept when a solved Daily is restored after a refresh', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    await guess(user, 'Chilblains');

    refresh();
    expect(document.querySelector('.solve-title')?.textContent).toBe('Title: Legend of the Mists');
  });

  it('giving up shows no title', async () => {
    const { user } = renderGame();
    await guess(user, 'Life Siphon');
    await giveUp(user);

    expect(screen.getByRole('heading', { name: 'You gave up.' })).toBeTruthy();
    expect(document.querySelector('.solve-title')).toBeNull();
  });
});
