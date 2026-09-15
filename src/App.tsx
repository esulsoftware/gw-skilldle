import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  allegianceAttributeName,
  campaignName,
  dailyDateKey,
  dailySkill,
  isPveSkill,
  isRankBasedPveSkill,
  professionName,
  randomSkill,
  skills,
  typeName,
  type Skill,
} from './lib/skills';
import './App.css';

const DAILY_STORAGE_PREFIX = 'gw-skilldle-daily-v3';
const LIBRARY_FILTERS = [
  'Warrior',
  'Ranger',
  'Monk',
  'Necromancer',
  'Mesmer',
  'Elementalist',
  'Assassin',
  'Ritualist',
  'Paragon',
  'Dervish',
  'PvE',
] as const;

type GameMode = 'daily' | 'practice';
type Result = 'correct' | 'partial' | 'higher' | 'lower' | 'none';

type GradedGuess = {
  skill: Skill;
  results: {
    profession: Result;
    attribute: Result;
    type: Result;
    campaign: Result;
    elite: Result;
    energy: Result;
    activation: Result;
    recharge: Result;
  };
};

type DailyProgress = {
  guessedSkillIds: number[];
  gaveUp: boolean;
};

function answerForMode(mode: GameMode): Skill {
  return mode === 'daily' ? dailySkill() : randomSkill();
}

function dailyStorageKey(): string {
  return `${DAILY_STORAGE_PREFIX}:${dailyDateKey()}`;
}

function compareBoolean(guess: boolean, answer: boolean): Result {
  return guess === answer ? 'correct' : 'none';
}

function compareNumber(
  guess: number | null,
  answer: number | null,
): Result {
  if (guess === null && answer === null) {
    return 'correct';
  }

  if (guess === null || answer === null) {
    return 'none';
  }

  if (guess === answer) {
    return 'correct';
  }

  return guess < answer ? 'higher' : 'lower';
}

function professionArmorClass(profession: string): string | null {
  if (['Warrior', 'Paragon'].includes(profession)) {
    return 'heavy';
  }

  if (['Ranger', 'Assassin', 'Dervish'].includes(profession)) {
    return 'medium';
  }

  if (
    ['Monk', 'Mesmer', 'Necromancer', 'Elementalist', 'Ritualist'].includes(
      profession,
    )
  ) {
    return 'light';
  }

  return null;
}

function compareProfession(guess: string, answer: string): Result {
  if (guess === answer) {
    return 'correct';
  }

  const guessArmorClass = professionArmorClass(guess);
  const answerArmorClass = professionArmorClass(answer);

  if (guessArmorClass && guessArmorClass === answerArmorClass) {
    return 'partial';
  }

  return 'none';
}

function typeFamily(type: string): string | null {
  const normalizedType = type.trim().toLocaleLowerCase();

  if (
    [
      'spell',
      'enchantment spell',
      'flash enchantment spell',
      'hex spell',
      'item spell',
      'ward spell',
      'weapon spell',
      'well spell',
    ].includes(normalizedType)
  ) {
    return 'spell';
  }

  if (
    [
      'melee attack',
      'axe attack',
      'hammer attack',
      'sword attack',
      'dagger attack',
      'lead attack',
      'off-hand attack',
      'dual attack',
      'scythe attack',
      'pet attack',
    ].includes(normalizedType)
  ) {
    return 'melee-attack';
  }

  if (['ranged attack', 'bow attack', 'spear attack'].includes(normalizedType)) {
    return 'ranged-attack';
  }

  return null;
}

function compareType(guess: string, answer: string): Result {
  if (guess === answer) {
    return 'correct';
  }

  const guessFamily = typeFamily(guess);
  const answerFamily = typeFamily(answer);

  if (guessFamily && guessFamily === answerFamily) {
    return 'partial';
  }

  return 'none';
}

function compareCampaign(guess: Skill, answer: Skill): Result {
  if (guess.campaign === answer.campaign) {
    return 'correct';
  }

  return guess.campaign < answer.campaign ? 'higher' : 'lower';
}

function compareAttributeOrRank(guess: Skill, answer: Skill): Result {
  const guessLabel = allegianceAttributeName(guess);
  const answerLabel = allegianceAttributeName(answer);

  if (guessLabel === answerLabel) {
    return 'correct';
  }

  const guessIsRankSkill = isRankBasedPveSkill(guess);
  const answerIsRankSkill = isRankBasedPveSkill(answer);

  if (guessIsRankSkill && answerIsRankSkill) {
    return 'partial';
  }

  return 'none';
}

function gradeGuess(guess: Skill, answer: Skill): GradedGuess {
  return {
    skill: guess,
    results: {
      profession: compareProfession(
        professionName(guess),
        professionName(answer),
      ),
      attribute: compareAttributeOrRank(guess, answer),
      type: compareType(typeName(guess), typeName(answer)),
      campaign: compareCampaign(guess, answer),
      elite: compareBoolean(guess.elite, answer.elite),
      energy: compareNumber(guess.energy, answer.energy),
      activation: compareNumber(guess.activation, answer.activation),
      recharge: compareNumber(guess.recharge, answer.recharge),
    },
  };
}

function formatNumber(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value}${suffix}`;
}

function formatEnergy(value: number | null): string {
  return value === null ? '0' : String(value);
}

function skillIconPath(skill: Skill): string {
  return `/skill-icons/${skill.id}.png`;
}

function wikiUrl(skill: Skill): string {
  return `https://wiki.guildwars.com/wiki/${encodeURIComponent(skill.name)}`;
}

function ResultArrow({ result }: { result: Result }) {
  if (result === 'higher') {
    return <span aria-label="The answer is from a later campaign">↑</span>;
  }

  if (result === 'lower') {
    return <span aria-label="The answer is from an earlier campaign">↓</span>;
  }

  return null;
}

function restoreDailyProgress(skillById: Map<number, Skill>): DailyProgress {
  try {
    const savedProgress = window.localStorage.getItem(dailyStorageKey());

    if (!savedProgress) {
      return { guessedSkillIds: [], gaveUp: false };
    }

    const parsedProgress: unknown = JSON.parse(savedProgress);

    if (
      typeof parsedProgress !== 'object' ||
      parsedProgress === null ||
      Array.isArray(parsedProgress)
    ) {
      return { guessedSkillIds: [], gaveUp: false };
    }

    const progress = parsedProgress as Partial<DailyProgress>;

    if (!Array.isArray(progress.guessedSkillIds)) {
      return { guessedSkillIds: [], gaveUp: false };
    }

    return {
      guessedSkillIds: progress.guessedSkillIds
        .filter((id): id is number => typeof id === 'number')
        .filter((id) => skillById.has(id)),
      gaveUp: progress.gaveUp === true,
    };
  } catch {
    return { guessedSkillIds: [], gaveUp: false };
  }
}

export default function App() {
  const boardRef = useRef<HTMLElement>(null);

  const skillById = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill])),
    [],
  );

  const initialDailyProgress = useMemo(
    () => restoreDailyProgress(skillById),
    [skillById],
  );

  const [mode, setMode] = useState<GameMode>('daily');
  const [answer, setAnswer] = useState<Skill>(() => dailySkill());
  const [guesses, setGuesses] = useState<GradedGuess[]>(() =>
    initialDailyProgress.guessedSkillIds.map((id) =>
      gradeGuess(skillById.get(id)!, dailySkill()),
    ),
  );
  const [gaveUp, setGaveUp] = useState(initialDailyProgress.gaveUp);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedLibraryFilter, setSelectedLibraryFilter] = useState<
    (typeof LIBRARY_FILTERS)[number]
  >('Warrior');

  const skillByNormalizedName = useMemo(
    () =>
      new Map(
        skills.map((skill) => [
          skill.name.trim().toLocaleLowerCase(),
          skill,
        ]),
      ),
    [],
  );

  const librarySkills = useMemo(() => {
  const matchingSkills =
    selectedLibraryFilter === 'PvE'
      ? skills.filter(isRankBasedPveSkill)
      : skills.filter(
          (skill) => professionName(skill) === selectedLibraryFilter,
        );

  return [...matchingSkills].sort((first, second) =>
    first.name.localeCompare(second.name, undefined, {
      sensitivity: 'base',
    }),
  );
}, [selectedLibraryFilter]);

  const guessedSkillIdSet = useMemo(
    () => new Set(guesses.map((guess) => guess.skill.id)),
    [guesses],
  );

  const availableSkills = useMemo(
    () => skills.filter((skill) => !guessedSkillIdSet.has(skill.id)),
    [guessedSkillIdSet],
  );

  const won = guesses.some((guess) => guess.skill.id === answer.id);
  const gameOver = won || gaveUp;

  useEffect(() => {
    if (mode !== 'daily') {
      return;
    }

    const progress: DailyProgress = {
      guessedSkillIds: guesses.map((guess) => guess.skill.id),
      gaveUp,
    };

    try {
      window.localStorage.setItem(dailyStorageKey(), JSON.stringify(progress));
    } catch {
      // The game still works if browser storage is unavailable.
    }
  }, [gaveUp, guesses, mode]);

  function resetRound(nextMode = mode) {
    setAnswer(answerForMode(nextMode));
    setGuesses([]);
    setGaveUp(false);
    setInput('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changeMode(nextMode: GameMode) {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setInput('');
    setMessage('');

    if (nextMode === 'daily') {
      const dailyProgress = restoreDailyProgress(skillById);
      const dailyAnswer = dailySkill();

      setAnswer(dailyAnswer);
      setGuesses(
        dailyProgress.guessedSkillIds.map((id) =>
          gradeGuess(skillById.get(id)!, dailyAnswer),
        ),
      );
      setGaveUp(dailyProgress.gaveUp);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setAnswer(randomSkill());
    setGuesses([]);
    setGaveUp(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function giveUp() {
    setGaveUp(true);
    setInput('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submitGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (gameOver) {
      return;
    }

    const normalizedInput = input.trim().toLocaleLowerCase();
    const selectedSkill = skillByNormalizedName.get(normalizedInput);

    if (!selectedSkill) {
      setMessage('Choose a valid skill from the suggestions.');
      return;
    }

    if (guessedSkillIdSet.has(selectedSkill.id)) {
      setMessage('You already guessed that skill.');
      return;
    }

    setGuesses((currentGuesses) => [
      ...currentGuesses,
      gradeGuess(selectedSkill, answer),
    ]);
    setInput('');
    setMessage('');

    const boardIsAboveViewport =
      boardRef.current !== null &&
      boardRef.current.getBoundingClientRect().top < 0;

    if (boardIsAboveViewport) {
      window.requestAnimationFrame(() => {
        boardRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }

  function resetDailyProgress() {
    window.localStorage.removeItem(dailyStorageKey());
    setAnswer(dailySkill());
    setGuesses([]);
    setGaveUp(false);
    setInput('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className="app">
      <header className="page-header">
        <h1>GW Skilldle</h1>

        <p className="fan-project-notice">
          Unofficial, non-commercial Guild Wars fan project. Not affiliated
          with, endorsed by, sponsored by, or approved by ArenaNet or NCSOFT.
        </p>

        <p>Guess {mode === 'daily' ? 'today’s' : 'a'} Guild Wars skill.</p>

        <div className="mode-switcher" aria-label="Game mode">
          <button
            type="button"
            className={mode === 'daily' ? 'mode-button active' : 'mode-button'}
            onClick={() => changeMode('daily')}
          >
            Daily
          </button>

          <button
            type="button"
            className={
              mode === 'practice' ? 'mode-button active' : 'mode-button'
            }
            onClick={() => changeMode('practice')}
          >
            Practice
          </button>
        </div>

        {mode === 'daily' && (
          <p className="daily-date">Daily puzzle: {dailyDateKey()}</p>
        )}

        {mode === 'practice' && (
          <p className="daily-date">Practice mode: unlimited random skills.</p>
        )}
      </header>

      <section className="legend" aria-label="Feedback legend">
        <span className="legend-item correct">Exact match</span>
        <span className="legend-item partial">Related match</span>
        <span className="legend-item higher">Answer is higher / later ↑</span>
        <span className="legend-item lower">Answer is lower / earlier ↓</span>
        <span className="legend-item none">No match</span>
      </section>

      <section className="rules" aria-label="Rules and notes">
        <details>
          <summary>Rules &amp; Notes</summary>
          <ul>
            <li>
              Profession is yellow when both professions use the same armor class:
              Warrior and Paragon; Ranger, Assassin, and Dervish; or Monk,
              Mesmer, Necromancer, Elementalist, and Ritualist.
            </li>
            <li>
              Type is yellow when both skills belong to the same broad family but
              are different subtypes. Spell-family skills, melee attack skills, and
              ranged attack skills each form a related group.
            </li>
            <li>
              Campaign arrows compare release order: up means the answer is from a
              later campaign; down means it is from an earlier campaign.
            </li>
            <li>
              Rank-based PvE skills display their associated rank. Different ranks
              are yellow-related; the same rank is an exact green match.
            </li>
            <li>
              PvE labels identify PvE-only skills. Profession-specific PvE skills
              continue to use their normal profession and attribute.
            </li>
          </ul>
        </details>
      </section>

      <section ref={boardRef} className="board" aria-label="Guesses">
        <div className="board-row board-header">
          <div>Skill</div>
          <div>Profession</div>
          <div>Attribute / Rank</div>
          <div>Type</div>
          <div>Campaign</div>
          <div>Elite</div>
          <div>Energy</div>
          <div>Cast</div>
          <div>Recharge</div>
        </div>

        {guesses.map((guess) => (
          <div className="board-row" key={guess.skill.id}>
            <div className="skill-name">
              <img
                className="guess-skill-icon"
                src={skillIconPath(guess.skill)}
                alt=""
                aria-hidden="true"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <span>{guess.skill.name}</span>
            </div>

            <div className={`tile ${guess.results.profession}`}>
              {professionName(guess.skill)}
            </div>

            <div className={`tile ${guess.results.attribute}`}>
              {allegianceAttributeName(guess.skill)}
            </div>

            <div className={`tile ${guess.results.type}`}>
              {typeName(guess.skill)}
            </div>

            <div className={`tile ${guess.results.campaign}`}>
              {campaignName(guess.skill)}
              <ResultArrow result={guess.results.campaign} />
            </div>

            <div className={`tile ${guess.results.elite}`}>
              {guess.skill.elite ? 'Yes' : 'No'}
            </div>

            <div className={`tile ${guess.results.energy}`}>
              {formatEnergy(guess.skill.energy)}
              <ResultArrow result={guess.results.energy} />
            </div>

            <div className={`tile ${guess.results.activation}`}>
              {formatNumber(guess.skill.activation, 's')}
              <ResultArrow result={guess.results.activation} />
            </div>

            <div className={`tile ${guess.results.recharge}`}>
              {formatNumber(guess.skill.recharge, 's')}
              <ResultArrow result={guess.results.recharge} />
            </div>
          </div>
        ))}
      </section>

      {!gameOver && (
        <form className="guess-form" onSubmit={submitGuess}>
          <label htmlFor="skill-input">Your guess</label>

          <div className="guess-controls">
            <input
              id="skill-input"
              list="skill-options"
              autoComplete="off"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Start typing a Guild Wars skill..."
            />

            <datalist id="skill-options">
              {availableSkills.map((skill) => (
                <option key={skill.id} value={skill.name} />
              ))}
            </datalist>

            <button type="submit">Guess</button>
          </div>

          <button type="button" className="give-up-button" onClick={giveUp}>
            I have no idea — give me the answer, please
          </button>

          {message && <p className="message">{message}</p>}
        </form>
      )}

      {gameOver && (
        <section className={`game-over ${won ? 'won' : 'lost'}`}>
          <h2>{won ? 'Solved!' : 'The Mists have claimed another hero.'}</h2>

          <div className="revealed-answer">
            <img
              className="revealed-answer-icon"
              src={skillIconPath(answer)}
              alt=""
              aria-hidden="true"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
            <p>
              The skill was <strong>{answer.name}</strong>.
            </p>
          </div>

          <p className="answer-description">{answer.description}</p>

          {mode === 'daily' ? (
            <button type="button" onClick={resetDailyProgress}>
              Restart today’s puzzle
            </button>
          ) : (
            <button type="button" onClick={() => resetRound()}>
              Next random skill
            </button>
          )}
        </section>
      )}

      <section className="skill-library" aria-labelledby="skill-library-title">
        <div className="library-heading">
          <div>
            <h2 id="skill-library-title">Skill Library</h2>
            <p>Browse skills by profession without affecting your game.</p>
          </div>

          <button
            type="button"
            className="library-toggle"
            onClick={() => setLibraryOpen((isOpen) => !isOpen)}
            aria-expanded={libraryOpen}
            aria-controls="skill-library-content"
          >
            {libraryOpen ? 'Hide skills' : 'Browse skills'}
          </button>
        </div>

        {libraryOpen && (
          <div id="skill-library-content" className="library-content">
            <div
              className="profession-filters"
              aria-label="Filter skill library by profession"
            >
              {LIBRARY_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={
                    selectedLibraryFilter === filter
                      ? 'profession-button active'
                      : 'profession-button'
                  }
                  onClick={() => setSelectedLibraryFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>

            <p className="library-count">
              {librarySkills.length} {selectedLibraryFilter} skills
            </p>

            <ul className="skill-list">
              {librarySkills.map((skill) => (
                <li key={skill.id} className="skill-list-item">
                  <div className="library-skill-top">
                    <img
                      className="skill-icon"
                      src={skillIconPath(skill)}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />

                    <div className="library-skill-heading">
                      <a
                        className="library-skill-name wiki-skill-name"
                        href={wikiUrl(skill)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {skill.name}
                      </a>
                      {isPveSkill(skill) && <span className="pve-tag">PvE</span>}
                    </div>
                  </div>

                  {skill.description && (
                    <p className="library-skill-description">
                      {skill.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer className="site-footer">
        <p>
          GW Skilldle is an unofficial, non-commercial fan project. It is not
          affiliated with, endorsed by, sponsored by, or approved by ArenaNet
          LLC, NCSOFT Corporation, or their affiliates.
        </p>
        <p>
          Feedback, bug reports, or rights concerns:{' '}
          <a href="mailto:esulsoftware@gmail.com">esulsoftware@gmail.com</a>
        </p>
        <p>
          Guild Wars Games © ArenaNet LLC. All rights reserved.
          <br />
          NCSOFT, ArenaNet, Guild Wars, Guild Wars Factions, Guild Wars
          Nightfall, Guild Wars: Eye of the North, and all associated logos and
          designs are trademarks or registered trademarks of NCSOFT Corporation.
          All other trademarks are the property of their respective owners.
        </p>
      </footer>
    </main>
  );
}
