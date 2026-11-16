import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  allegianceAttributeName,
  campaignName,
  dailyDateKey,
  professionName,
  skills,
  typeName,
  type Skill,
} from './lib/skills';
import {
  dailyAnswer,
  dailyStorageKey,
  guessPool,
  isAllowedGuess,
  modeLabel,
  randomAnswer,
  type Difficulty,
  type PlayMode,
} from './lib/modes';
import {
  energyCost,
  gradeGuess,
  resultArrow,
  type ArrowKind,
  type GradedGuess,
  type Result,
} from './lib/compare';
import { skillIconPath, wikiUrl } from './lib/skillLinks';
import SkillLibrary from './components/SkillLibrary';
import './App.css';

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'nm', label: 'NM' },
  { value: 'hm', label: 'HM' },
];

const PLAY_MODE_OPTIONS: { value: PlayMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'infinite', label: 'Infinite' },
];

type DailyProgress = {
  guessedSkillIds: number[];
  gaveUp: boolean;
};

type Round = {
  /** The UTC date a Daily round belongs to; null for Infinite rounds. */
  puzzleDate: Date | null;
  answer: Skill;
  guesses: GradedGuess[];
  gaveUp: boolean;
};

function formatNumber(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value}${suffix}`;
}

function formatEnergy(skill: Skill): string {
  return String(energyCost(skill));
}

function ResultArrow({
  result,
  kind = 'numeric',
}: {
  result: Result;
  kind?: ArrowKind;
}) {
  const arrow = resultArrow(result, kind);

  if (!arrow) {
    return null;
  }

  return <span aria-label={arrow.label}>{arrow.glyph}</span>;
}

function restoreDailyProgress(
  skillById: Map<number, Skill>,
  difficulty: Difficulty,
  puzzleDate: Date,
): DailyProgress {
  try {
    const savedProgress = window.localStorage.getItem(
      dailyStorageKey(difficulty, puzzleDate),
    );

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
        .filter((id) => skillById.has(id))
        .filter((id) => isAllowedGuess(difficulty, skillById.get(id)!)),
      gaveUp: progress.gaveUp === true,
    };
  } catch {
    return { guessedSkillIds: [], gaveUp: false };
  }
}

function newInfiniteRound(difficulty: Difficulty): Round {
  return {
    puzzleDate: null,
    answer: randomAnswer(difficulty),
    guesses: [],
    gaveUp: false,
  };
}

/** The round to show for a mode: saved Daily progress, or a new Infinite round. */
function loadRound(
  skillById: Map<number, Skill>,
  difficulty: Difficulty,
  playMode: PlayMode,
): Round {
  if (playMode === 'infinite') {
    return newInfiniteRound(difficulty);
  }

  // Fix the date once, so the answer, displayed date and storage key all
  // refer to the same puzzle even if the page stays open past midnight UTC.
  const puzzleDate = new Date();
  const answer = dailyAnswer(difficulty, puzzleDate);
  const progress = restoreDailyProgress(skillById, difficulty, puzzleDate);

  return {
    puzzleDate,
    answer,
    guesses: progress.guessedSkillIds.map((id) =>
      gradeGuess(skillById.get(id)!, answer),
    ),
    gaveUp: progress.gaveUp,
  };
}

export default function App() {
  const boardRef = useRef<HTMLElement>(null);

  const skillById = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill])),
    [],
  );

  const initialRound = useMemo(
    () => loadRound(skillById, 'hm', 'daily'),
    [skillById],
  );

  // The page always opens on HM Daily.
  const [difficulty, setDifficulty] = useState<Difficulty>('hm');
  const [playMode, setPlayMode] = useState<PlayMode>('daily');
  const [puzzleDate, setPuzzleDate] = useState<Date | null>(
    initialRound.puzzleDate,
  );
  const [answer, setAnswer] = useState<Skill>(initialRound.answer);
  const [guesses, setGuesses] = useState<GradedGuess[]>(initialRound.guesses);
  const [gaveUp, setGaveUp] = useState(initialRound.gaveUp);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');

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

  const guessedSkillIdSet = useMemo(
    () => new Set(guesses.map((guess) => guess.skill.id)),
    [guesses],
  );

  const availableSkills = useMemo(
    () =>
      guessPool(difficulty).filter((skill) => !guessedSkillIdSet.has(skill.id)),
    [difficulty, guessedSkillIdSet],
  );

  const won = guesses.some((guess) => guess.skill.id === answer.id);
  const gameOver = won || gaveUp;
  const isNm = difficulty === 'nm';
  const isDaily = playMode === 'daily';

  useEffect(() => {
    if (playMode !== 'daily' || puzzleDate === null) {
      return;
    }

    const progress: DailyProgress = {
      guessedSkillIds: guesses.map((guess) => guess.skill.id),
      gaveUp,
    };

    try {
      window.localStorage.setItem(
        dailyStorageKey(difficulty, puzzleDate),
        JSON.stringify(progress),
      );
    } catch {
      // The game still works if browser storage is unavailable.
    }
  }, [difficulty, gaveUp, guesses, playMode, puzzleDate]);

  function showRound(round: Round) {
    setPuzzleDate(round.puzzleDate);
    setAnswer(round.answer);
    setGuesses(round.guesses);
    setGaveUp(round.gaveUp);
    setInput('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetRound() {
    showRound(newInfiniteRound(difficulty));
  }

  function changeMode(nextDifficulty: Difficulty, nextPlayMode: PlayMode) {
    if (nextDifficulty === difficulty && nextPlayMode === playMode) {
      return;
    }

    setDifficulty(nextDifficulty);
    setPlayMode(nextPlayMode);
    // Daily progress is restored; an Infinite round always starts fresh.
    showRound(loadRound(skillById, nextDifficulty, nextPlayMode));
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

    if (!isAllowedGuess(difficulty, selectedSkill)) {
      setMessage('Skilldle NM only accepts elite skills.');
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
    // Restarts the puzzle this round was loaded for.
    const date = puzzleDate ?? new Date();

    try {
      window.localStorage.removeItem(dailyStorageKey(difficulty, date));
    } catch {
      // The game still works if browser storage is unavailable.
    }

    showRound({
      puzzleDate: date,
      answer: dailyAnswer(difficulty, date),
      guesses: [],
      gaveUp: false,
    });
  }

  return (
    <main className="app">
      <header className="page-header">
        <h1>GW Skilldle</h1>

        <p className="fan-project-notice">
          Unofficial, non-commercial Guild Wars fan project. Not affiliated
          with, endorsed by, sponsored by, or approved by ArenaNet or NCSOFT.
        </p>

        <p>
          Guess {isDaily ? 'today’s' : isNm ? 'an' : 'a'}
          {isNm ? ' elite' : ''} Guild Wars skill.
        </p>

        <div className="mode-selectors">
          <div className="mode-selector">
            <span id="difficulty-label" className="mode-selector-label">
              Difficulty
            </span>
            <div
              className="mode-switcher"
              role="group"
              aria-labelledby="difficulty-label"
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    difficulty === option.value
                      ? 'mode-button active'
                      : 'mode-button'
                  }
                  aria-pressed={difficulty === option.value}
                  onClick={() => changeMode(option.value, playMode)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mode-selector">
            <span id="play-mode-label" className="mode-selector-label">
              Play mode
            </span>
            <div
              className="mode-switcher"
              role="group"
              aria-labelledby="play-mode-label"
            >
              {PLAY_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    playMode === option.value
                      ? 'mode-button active'
                      : 'mode-button'
                  }
                  aria-pressed={playMode === option.value}
                  onClick={() => changeMode(difficulty, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="daily-date" aria-live="polite">
          <strong className="active-mode">
            {modeLabel(difficulty, playMode)}
          </strong>
          {' · '}
          {isDaily
            ? `Daily puzzle: ${dailyDateKey(puzzleDate ?? undefined)}`
            : `Unlimited random ${isNm ? 'elite ' : ''}skills.`}
        </p>
      </header>

      <section className="legend" aria-label="Feedback legend">
        <span className="legend-item correct">Exact match</span>
        <span className="legend-item partial">Related match</span>
        <span className="legend-item higher">Answer is higher ↑ / later →</span>
        <span className="legend-item lower">Answer is lower ↓ / earlier ←</span>
        <span className="legend-item none">No match</span>
      </section>

      <section className="rules" aria-label="Rules and notes">
        <details>
          <summary>Rules &amp; Notes</summary>
          <ul>
            <li>
              Difficulty: HM uses every skill. NM uses elite skills only — the
              answer is always elite, only elite skills can be guessed, and the
              Elite column is hidden.
            </li>
            <li>
              Daily has one puzzle per UTC day for each difficulty, and your
              progress is saved separately for Daily HM and Daily NM in this
              browser. Infinite rounds are not saved: switching difficulty,
              switching to Daily, or reloading the page starts a new Infinite
              round when you return.
            </li>
            <li>
              Profession is yellow when both professions use the same armor class:
              Warrior and Paragon; Ranger, Assassin, and Dervish; or Monk,
              Mesmer, Necromancer, Elementalist, and Ritualist.
            </li>
            <li>
              Type is yellow when both skills belong to the same broad family but
              are different subtypes. Spell-family skills, melee attack skills,
              ranged attack skills, and rituals (Nature, Binding, and Ebon
              Vanguard) each form a related group.
            </li>
            <li>
              Campaign arrows compare release order (Core, Prophecies, Factions,
              Nightfall, Eye of the North): → means the answer is from a later
              campaign; ← means it is from an earlier campaign.
            </li>
            <li>
              Energy, Cast, and Recharge arrows compare values: ↑ means the
              answer’s value is higher; ↓ means it is lower. Skills with no
              energy cost count as 0 Energy.
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

      <section
        ref={boardRef}
        className={isNm ? 'board board-nm' : 'board'}
        aria-label="Guesses"
      >
        <div className="board-row board-header">
          <div>Skill</div>
          <div>Profession</div>
          <div>Attribute / Rank</div>
          <div>Type</div>
          <div>Campaign</div>
          {!isNm && <div>Elite</div>}
          <div>Energy</div>
          <div>Cast</div>
          <div>Recharge</div>
        </div>

        {guesses.map((guess, guessIndex) => (
          <div className="board-row" key={guess.skill.id}>
            <div className="skill-name">
              {/* Number from the original guess order, so it stays correct
                  if rows are ever displayed in a different order. */}
              <span
                className="guess-number"
                aria-label={`Guess ${guessIndex + 1}`}
              >
                #{guessIndex + 1}
              </span>
              <img
                className="guess-skill-icon"
                src={skillIconPath(guess.skill)}
                alt=""
                aria-hidden="true"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <a
                className="wiki-skill-name"
                href={wikiUrl(guess.skill)}
                target="_blank"
                rel="noreferrer"
              >
                {guess.skill.name}
              </a>
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
              <ResultArrow result={guess.results.campaign} kind="campaign" />
            </div>

            {!isNm && (
              <div className={`tile ${guess.results.elite}`}>
                {guess.skill.elite ? 'Yes' : 'No'}
              </div>
            )}

            <div className={`tile ${guess.results.energy}`}>
              {formatEnergy(guess.skill)}
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
              placeholder={
                isNm
                  ? 'Start typing an elite Guild Wars skill...'
                  : 'Start typing a Guild Wars skill...'
              }
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
              The skill was{' '}
              <strong>
                <a
                  className="wiki-skill-name"
                  href={wikiUrl(answer)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {answer.name}
                </a>
              </strong>
              .
            </p>
          </div>

          <p className="answer-description">{answer.description}</p>

          {isDaily ? (
            <button type="button" onClick={resetDailyProgress}>
              Restart today’s puzzle
            </button>
          ) : (
            <button type="button" onClick={resetRound}>
              {isNm ? 'Next random elite skill' : 'Next random skill'}
            </button>
          )}
        </section>
      )}

      <SkillLibrary />

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
