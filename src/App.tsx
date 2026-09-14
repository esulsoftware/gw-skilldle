import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  attributeName,
  campaignName,
  dailyDateKey,
  dailySkill,
  professionName,
  randomSkill,
  skills,
  typeName,
  type Skill,
} from './lib/skills';
import './App.css';

const MAX_GUESSES = 6;
const DAILY_STORAGE_PREFIX = 'gw-skilldle-daily-v1';
const PROFESSION_FILTERS = [
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
] as const;

type GameMode = 'daily' | 'practice';
type Result = 'correct' | 'higher' | 'lower' | 'none';

type GradedGuess = {
  skill: Skill;
  results: {
    profession: Result;
    attribute: Result;
    type: Result;
    campaign: Result;
    elite: Result;
    energy: Result;
    adrenaline: Result;
    activation: Result;
    recharge: Result;
  };
};

function answerForMode(mode: GameMode): Skill {
  return mode === 'daily' ? dailySkill() : randomSkill();
}

function dailyStorageKey(): string {
  return `${DAILY_STORAGE_PREFIX}:${dailyDateKey()}`;
}

function compareText(guess: string, answer: string): Result {
  return guess === answer ? 'correct' : 'none';
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

function gradeGuess(guess: Skill, answer: Skill): GradedGuess {
  return {
    skill: guess,
    results: {
      profession: compareText(
        professionName(guess),
        professionName(answer),
      ),
      attribute: compareText(attributeName(guess), attributeName(answer)),
      type: compareText(typeName(guess), typeName(answer)),
      campaign: compareText(campaignName(guess), campaignName(answer)),
      elite: compareBoolean(guess.elite, answer.elite),
      energy: compareNumber(guess.energy, answer.energy),
      adrenaline: compareNumber(guess.adrenaline, answer.adrenaline),
      activation: compareNumber(guess.activation, answer.activation),
      recharge: compareNumber(guess.recharge, answer.recharge),
    },
  };
}

function formatNumber(value: number | null, suffix = '') {
  return value === null ? '—' : `${value}${suffix}`;
}

function skillIconPath(skill: Skill): string {
  return `/skill-icons/${skill.id}.png`;
}

function ResultArrow({ result }: { result: Result }) {
  if (result === 'higher') {
    return <span aria-label="The answer is higher">↑</span>;
  }

  if (result === 'lower') {
    return <span aria-label="The answer is lower">↓</span>;
  }

  return null;
}

function restoreDailyGuesses(
  skillById: Map<number, Skill>,
): GradedGuess[] {
  try {
    const savedProgress = window.localStorage.getItem(dailyStorageKey());

    if (!savedProgress) {
      return [];
    }

    const savedSkillIds: unknown = JSON.parse(savedProgress);

    if (!Array.isArray(savedSkillIds)) {
      return [];
    }

    return savedSkillIds
      .filter((id): id is number => typeof id === 'number')
      .map((id) => skillById.get(id))
      .filter((skill): skill is Skill => skill !== undefined)
      .slice(0, MAX_GUESSES)
      .map((skill) => gradeGuess(skill, dailySkill()));
  } catch {
    return [];
  }
}

export default function App() {
  const skillById = useMemo(() => {
    return new Map(skills.map((skill) => [skill.id, skill]));
  }, []);

  const [mode, setMode] = useState<GameMode>('daily');
  const [answer, setAnswer] = useState<Skill>(() => dailySkill());
  const [guesses, setGuesses] = useState<GradedGuess[]>(() =>
    restoreDailyGuesses(skillById),
  );
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedProfession, setSelectedProfession] = useState<
    (typeof PROFESSION_FILTERS)[number]
  >('Warrior');

  const skillByNormalizedName = useMemo(() => {
    return new Map(
      skills.map((skill) => [skill.name.trim().toLocaleLowerCase(), skill]),
    );
  }, []);

    const librarySkills = useMemo(() => {
  return [...skills]
    .filter((skill) => professionName(skill) === selectedProfession)
    .sort((first, second) =>
      first.name.localeCompare(second.name, undefined, {
        sensitivity: 'base',
      }),
    );
}, [selectedProfession]);

  const won = guesses.some((guess) => guess.skill.id === answer.id);
  const lost = guesses.length >= MAX_GUESSES && !won;
  const gameOver = won || lost;

  useEffect(() => {
  if (mode !== 'daily') {
    return;
  }

  const guessedSkillIds = guesses.map((guess) => guess.skill.id);

  try {
    window.localStorage.setItem(
      dailyStorageKey(),
      JSON.stringify(guessedSkillIds),
    );
  } catch {
    // The game still works if browser storage is unavailable.
  }
}, [guesses, mode]);

  function resetRound(nextMode = mode) {
    setAnswer(answerForMode(nextMode));
    setGuesses([]);
    setInput('');
    setMessage('');
  }

  function changeMode(nextMode: GameMode) {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setInput('');
    setMessage('');

    if (nextMode === 'daily') {
      const savedProgress = window.localStorage.getItem(dailyStorageKey());

      if (!savedProgress) {
        setAnswer(dailySkill());
        setGuesses([]);
        return;
      }

      try {
        const savedSkillIds: unknown = JSON.parse(savedProgress);

        if (!Array.isArray(savedSkillIds)) {
          setAnswer(dailySkill());
          setGuesses([]);
          return;
        }

        const restoredGuesses = savedSkillIds
          .filter((id): id is number => typeof id === 'number')
          .map((id) => skillById.get(id))
          .filter((skill): skill is Skill => skill !== undefined)
          .slice(0, MAX_GUESSES)
          .map((skill) => gradeGuess(skill, dailySkill()));

        setAnswer(dailySkill());
        setGuesses(restoredGuesses);
      } catch {
        setAnswer(dailySkill());
        setGuesses([]);
      }

      return;
    }

    setAnswer(randomSkill());
    setGuesses([]);
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

    if (guesses.some((guess) => guess.skill.id === selectedSkill.id)) {
      setMessage('You already guessed that skill.');
      return;
    }

    setGuesses((currentGuesses) => [
      ...currentGuesses,
      gradeGuess(selectedSkill, answer),
    ]);

    setInput('');
    setMessage('');
  }

  function resetDailyProgress() {
    window.localStorage.removeItem(dailyStorageKey());
    setAnswer(dailySkill());
    setGuesses([]);
    setInput('');
    setMessage('');
  }

  return (
    <main className="app">
      <header className="page-header">
        <h1>GW Skilldle</h1>

        <p>
          Guess {mode === 'daily' ? 'today’s' : 'a'} Guild Wars skill in{' '}
          {MAX_GUESSES} attempts.
        </p>

        <div className="mode-switcher" aria-label="Game mode">
          <button
            type="button"
            className={
              mode === 'daily' ? 'mode-button active' : 'mode-button'
            }
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
          <p className="daily-date">
            Practice mode: unlimited random skills.
          </p>
        )}
      </header>

      <section className="legend" aria-label="Feedback legend">
        <span className="legend-item correct">Exact match</span>
        <span className="legend-item higher">Answer is higher ↑</span>
        <span className="legend-item lower">Answer is lower ↓</span>
        <span className="legend-item none">No match</span>
      </section>

      <section className="board" aria-label="Guesses">
        <div className="board-row board-header">
          <div>Skill</div>
          <div>Profession</div>
          <div>Attribute</div>
          <div>Type</div>
          <div>Campaign</div>
          <div>Elite</div>
          <div>Energy</div>
          <div>Adren.</div>
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
              {attributeName(guess.skill)}
            </div>

            <div className={`tile ${guess.results.type}`}>
              {typeName(guess.skill)}
            </div>

            <div className={`tile ${guess.results.campaign}`}>
              {campaignName(guess.skill)}
            </div>

            <div className={`tile ${guess.results.elite}`}>
              {guess.skill.elite ? 'Yes' : 'No'}
            </div>

            <div className={`tile ${guess.results.energy}`}>
              {formatNumber(guess.skill.energy)}
              <ResultArrow result={guess.results.energy} />
            </div>

            <div className={`tile ${guess.results.adrenaline}`}>
              {formatNumber(guess.skill.adrenaline)}
              <ResultArrow result={guess.results.adrenaline} />
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

        {Array.from({ length: MAX_GUESSES - guesses.length }).map((_, index) => (
          <div className="board-row empty-row" key={`empty-${index}`}>
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
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
              {skills.map((skill) => (
                <option key={skill.id} value={skill.name} />
              ))}
            </datalist>

            <button type="submit">Guess</button>
          </div>

          {message && <p className="message">{message}</p>}
        </form>
      )}

      {gameOver && (
        <section className={`game-over ${won ? 'won' : 'lost'}`}>
          <h2>{won ? 'Solved!' : 'Out of guesses'}</h2>

          <p>
            The skill was <strong>{answer.name}</strong>.
          </p>

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
              {PROFESSION_FILTERS.map((profession) => (
                <button
                  key={profession}
                  type="button"
                  className={
                    selectedProfession === profession
                      ? 'profession-button active'
                      : 'profession-button'
                  }
                  onClick={() => setSelectedProfession(profession)}
                >
                  {profession}
                </button>
              ))}
            </div>

            <p className="library-count">
              {librarySkills.length} {selectedProfession} skills
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
                      //  onError={(event) => {
                      //   event.currentTarget.style.display = 'none';
                      // }} 
                    />

                    <div className="library-skill-name">
                      {skill.name}

                      {skill.elite && (
                        <span className="elite-tag">Elite</span>
                      )}
                    </div>
                  </div>

                  <div className="library-skill-meta">
                    <span>{attributeName(skill)}</span>
                    <span>{typeName(skill)}</span>
                    <span>{campaignName(skill)}</span>
                    <span>Energy: {formatNumber(skill.energy)}</span>
                    <span>Adren.: {formatNumber(skill.adrenaline)}</span>
                    <span>
                      Cast: {formatNumber(skill.activation, 's')}
                    </span>
                    <span>
                      Recharge: {formatNumber(skill.recharge, 's')}
                    </span>
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
    </main>
  );
}