import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  HINT_AFTER_INCORRECT,
  buildSlots,
  buildleAttribution,
  buildleBosses,
  checkGuess,
  hintAvailable,
  puzzleCatalog,
  randomPuzzle,
  skillFor,
  type BuildlePuzzle,
} from '../lib/buildle';
import {
  loadDaily,
  saveDaily,
  type DailyPuzzle,
  type DailyStatus,
  type Withdrawal,
} from '../lib/buildleDaily';
import { skillStatLine } from '../lib/libraryFilters';
import { guessPool, type Difficulty, type PlayMode } from '../lib/modes';
import { skillIconPath, wikiUrl } from '../lib/skillLinks';
import SkillCombobox from './SkillCombobox';
import SkillLibrary from './SkillLibrary';
import { scrollToElement } from '../lib/scrolling';

type RoundKey = `${PlayMode}-${Difficulty}`;

type Round = {
  /** Changes with every new round, so stale suggestions reset. */
  id: number;
  playMode: PlayMode;
  difficulty: Difficulty;
  /** Daily: the puzzle's UTC date, fixed when the round is loaded. */
  date: string | null;
  puzzle: BuildlePuzzle | DailyPuzzle | null;
  /** Daily only: set when the schedule has not started yet. */
  startsOn: string | null;
  /** Accepted guesses, in order (invalid and duplicate ones are never added). */
  guessIds: number[];
  hintRevealed: boolean;
  status: DailyStatus;
  withdrawal: Withdrawal | null;
  input: string;
};

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'nm', label: 'NM' },
  { value: 'hm', label: 'HM' },
];

const PLAY_MODE_OPTIONS: { value: PlayMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'infinite', label: 'Infinite' },
];

let nextRoundId = 1;

function dailyRound(difficulty: Difficulty): Round {
  const daily = loadDaily(difficulty, new Date());
  const base = {
    id: nextRoundId++,
    playMode: 'daily' as const,
    difficulty,
    date: daily.date,
    input: '',
  };

  if (daily.kind === 'not-started') {
    return {
      ...base,
      puzzle: null,
      startsOn: daily.startsOn,
      guessIds: [],
      hintRevealed: false,
      status: 'playing',
      withdrawal: null,
    };
  }

  return {
    ...base,
    puzzle: daily.puzzle,
    startsOn: null,
    guessIds: daily.guessIds,
    hintRevealed: daily.hintRevealed,
    status: daily.status,
    withdrawal: daily.withdrawal,
  };
}

function infiniteRound(difficulty: Difficulty, previous?: BuildlePuzzle | null): Round {
  const { puzzles } = puzzleCatalog(buildleBosses, difficulty);
  return {
    id: nextRoundId++,
    playMode: 'infinite',
    difficulty,
    date: null,
    puzzle: randomPuzzle(puzzles, Math.random, previous ?? undefined),
    startsOn: null,
    guessIds: [],
    hintRevealed: false,
    status: 'playing',
    withdrawal: null,
    input: '',
  };
}

function createRound(playMode: PlayMode, difficulty: Difficulty): Round {
  return playMode === 'daily' ? dailyRound(difficulty) : infiniteRound(difficulty);
}

/**
 * Buildle: name the one skill missing from a boss's skill bar. Its state and
 * storage are separate from Skilldle's, and it is kept while the other game
 * is shown. Each play mode and difficulty keeps its own round for the
 * session; Daily rounds are also saved in this browser.
 */
type BuildleGameProps = {
  /**
   * False while Skilldle is shown. Buildle stays mounted (keeping its state);
   * its Skill Library then drops its grid, like Skilldle's does.
   */
  active?: boolean;
};

export default function BuildleGame({ active = true }: BuildleGameProps) {
  // Like Skilldle, Buildle opens on HM Daily.
  const [difficulty, setDifficulty] = useState<Difficulty>('hm');
  const [playMode, setPlayMode] = useState<PlayMode>('daily');
  const [rounds, setRounds] = useState<Partial<Record<RoundKey, Round>>>(() => ({
    'daily-hm': dailyRound('hm'),
  }));
  const [message, setMessage] = useState('');
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);
  const barRef = useRef<HTMLOListElement>(null);
  // Bumped only by a confirmed give-up; the effect below then scrolls to the
  // revealed bar once it has rendered. Restored finished Dailies never scroll.
  const [answerScrollRequest, setAnswerScrollRequest] = useState(0);

  useEffect(() => {
    if (answerScrollRequest > 0) {
      scrollToElement(barRef.current);
    }
  }, [answerScrollRequest]);

  const roundKey: RoundKey = `${playMode}-${difficulty}`;
  const round = rounds[roundKey]!;
  const { puzzle, guessIds, hintRevealed, status } = round;
  const isNm = difficulty === 'nm';
  const isDaily = playMode === 'daily';
  const playing = status === 'playing' && puzzle !== null;
  const incorrectIds = guessIds.filter((id) => id !== puzzle?.targetId);
  const canRevealHint = playing && !hintRevealed && hintAvailable(incorrectIds.length);
  // Guess numbers come from the accepted-guess history itself: rejected
  // submissions are never in it, so they never take a number.
  const guessNumber = (id: number) => guessIds.indexOf(id) + 1;

  // Save Daily progress (puzzle as published, guesses, hint, status).
  useEffect(() => {
    if (round.playMode === 'daily' && round.puzzle && round.date && 'key' in round.puzzle) {
      saveDaily(round.difficulty, {
        kind: 'puzzle',
        date: round.date,
        puzzle: round.puzzle,
        guessIds: round.guessIds,
        hintRevealed: round.hintRevealed,
        status: round.status,
        withdrawal: round.withdrawal,
      });
    }
  }, [round]);

  const availableSkills = useMemo(() => {
    const guessed = new Set(guessIds);
    // Skilldle's own pool for this difficulty (NM: its elite subset).
    return guessPool(difficulty).filter((skill) => !guessed.has(skill.id));
  }, [difficulty, guessIds]);

  const slots = puzzle && status !== 'withdrawn' ? buildSlots(puzzle, status) : [];
  const shownSkills = slots.flatMap((slot) =>
    slot.kind === 'revealed' || slot.kind === 'answer' ? [slot.skill] : [],
  );

  function updateRound(change: Partial<Round>) {
    setRounds((current) => ({
      ...current,
      [roundKey]: { ...current[roundKey]!, ...change },
    }));
  }

  function changeMode(nextPlayMode: PlayMode, nextDifficulty: Difficulty) {
    if (nextPlayMode === playMode && nextDifficulty === difficulty) {
      return;
    }

    // Keep every mode/difficulty's round; create one only the first time.
    const nextKey: RoundKey = `${nextPlayMode}-${nextDifficulty}`;
    setRounds((current) =>
      current[nextKey]
        ? current
        : { ...current, [nextKey]: createRound(nextPlayMode, nextDifficulty) },
    );
    setPlayMode(nextPlayMode);
    setDifficulty(nextDifficulty);
    setMessage('');
    setConfirmingGiveUp(false);
  }

  function nextPuzzle() {
    setRounds((current) => ({
      ...current,
      [roundKey]: infiniteRound(difficulty, puzzle),
    }));
    setMessage('');
    setConfirmingGiveUp(false);
  }

  function submitGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!puzzle || !playing) {
      return;
    }

    const result = checkGuess(round.input, puzzle, difficulty, guessIds);

    switch (result.kind) {
      case 'invalid':
        setMessage('Choose a valid skill from the suggestions.');
        return;
      case 'duplicate':
        setMessage('You already guessed that skill.');
        return;
      case 'not-elite':
        setMessage('Buildle NM only accepts elite skills.');
        return;
      case 'correct':
        setMessage(`Correct! ${result.skill.name} is the missing skill.`);
        break;
      case 'incorrect':
        setMessage(`Incorrect: ${result.skill.name} is not the missing skill.`);
        break;
    }

    updateRound({
      guessIds: [...guessIds, result.skill.id],
      status: result.kind === 'correct' ? 'solved' : 'playing',
      input: '',
    });
    setConfirmingGiveUp(false);
    returnToBar();
  }

  /**
   * As Skilldle does after an accepted guess: if the skill bar has scrolled
   * above the viewport, bring it back so the result is visible. Rejected
   * submissions never get here, so they never move the page.
   */
  function returnToBar() {
    const barIsAboveViewport =
      barRef.current !== null && barRef.current.getBoundingClientRect().top < 0;

    if (!barIsAboveViewport) {
      return;
    }

    window.requestAnimationFrame(() => scrollToElement(barRef.current));
  }

  /** "Yes, show the answer": ends the round as given up, then shows the answer. */
  function giveUp() {
    updateRound({ status: 'gave-up', input: '' });
    setMessage('');
    setConfirmingGiveUp(false);

    // Only the active game scrolls (an inactive one cannot be clicked anyway).
    if (active) {
      setAnswerScrollRequest((count) => count + 1);
    }
  }

  const modeLabel = `${isDaily ? 'Daily' : 'Infinite'} ${difficulty.toUpperCase()}`;

  return (
    <>
    <section className="buildle-game" aria-labelledby="buildle-title">
      <h2 id="buildle-title">Buildle</h2>
      <p className="buildle-intro">
        Name the one skill missing from a Guild Wars boss’s skill bar.
      </p>

      <div className="mode-selectors">
        <div className="mode-selector">
          <span id="buildle-difficulty-label" className="mode-selector-label">
            Difficulty
          </span>
          <div className="mode-switcher" role="group" aria-labelledby="buildle-difficulty-label">
            {DIFFICULTY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={difficulty === option.value ? 'mode-button active' : 'mode-button'}
                aria-pressed={difficulty === option.value}
                onClick={() => changeMode(playMode, option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mode-selector">
          <span id="buildle-play-mode-label" className="mode-selector-label">
            Play mode
          </span>
          <div className="mode-switcher" role="group" aria-labelledby="buildle-play-mode-label">
            {PLAY_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={playMode === option.value ? 'mode-button active' : 'mode-button'}
                aria-pressed={playMode === option.value}
                onClick={() => changeMode(option.value, difficulty)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="daily-date buildle-mode-line" aria-live="polite">
        <strong className="buildle-active-mode">{modeLabel}</strong>
        {' · '}
        {isDaily ? `Daily puzzle: ${round.date}` : 'Unlimited random puzzles.'}
      </p>

      <p className="buildle-mode-note">
        {isNm
          ? 'NM: the missing skill is an elite, and only elite skills can be guessed.'
          : 'HM: the missing skill can be any skill in the bar, elite or not.'}
      </p>

      {status === 'withdrawn' && puzzle && round.withdrawal ? (
        <section className="buildle-withdrawn" aria-labelledby="buildle-withdrawn-title">
          <h3 id="buildle-withdrawn-title">This Daily puzzle was withdrawn</h3>
          <p>
            Its source data was corrected after it was published, so it no longer has a
            verified answer and does not count as solved or given up.
          </p>
          <p>
            <strong>What was wrong:</strong> {round.withdrawal.reason}
          </p>
          <p>
            <strong>Correction:</strong> {round.withdrawal.correction}
          </p>
          <p className="buildle-withdrawn-original">
            As originally published, the intended answer was{' '}
            {skillFor(puzzle.targetId).name}, from {puzzle.boss.name}’s skill list. That list
            has since been corrected, so this is not presented as verified.
          </p>
          <button type="button" onClick={() => changeMode('infinite', difficulty)}>
            Play Infinite
          </button>
        </section>
      ) : !puzzle ? (
        <div className="buildle-empty">
          {isDaily && round.startsOn ? (
            <p>Buildle Daily starts on {round.startsOn}.</p>
          ) : (
            <p>No {isNm ? 'NM' : 'HM'} puzzles are available.</p>
          )}
          {isDaily && (
            <button type="button" onClick={() => changeMode('infinite', difficulty)}>
              Play Infinite
            </button>
          )}
        </div>
      ) : (
        <>
          <ol ref={barRef} className="buildle-bar" aria-label="Boss skill bar">
            {slots.map((slot, index) => (
              <li
                key={index}
                className={`buildle-slot ${slot.kind}${
                  slot.kind === 'answer' ? ` ${slot.status}` : ''
                }`}
              >
                {slot.kind === 'missing' && (
                  <>
                    <span className="buildle-slot-mark" aria-hidden="true">?</span>
                    <span className="buildle-slot-label">Missing skill</span>
                  </>
                )}

                {slot.kind === 'unused' && (
                  <>
                    <span className="buildle-slot-mark" aria-hidden="true">✕</span>
                    <span className="visually-hidden">Unused slot</span>
                  </>
                )}

                {(slot.kind === 'revealed' || slot.kind === 'answer') && (
                  <>
                    <img
                      className="buildle-slot-icon"
                      src={skillIconPath(slot.skill)}
                      alt=""
                      aria-hidden="true"
                    />
                    <a
                      className="buildle-slot-name wiki-skill-name"
                      href={wikiUrl(slot.skill)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {slot.kind === 'answer' && (
                        <span className="visually-hidden">Missing skill: </span>
                      )}
                      {slot.skill.name}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>

          <details className="buildle-details">
            <summary>Skill details</summary>
            <ul>
              {shownSkills.map((skill) => (
                <li key={skill.id}>
                  <strong>{skill.name}</strong>
                  <p className="library-skill-stats">{skillStatLine(skill)}</p>
                  {skill.description && <p>{skill.description}</p>}
                </li>
              ))}
            </ul>
          </details>

          {playing && (
            <div className="buildle-hint">
              {hintRevealed ? (
                <p>
                  Boss: <strong>{puzzle.boss.name}</strong>
                </p>
              ) : canRevealHint ? (
                <button type="button" onClick={() => updateRound({ hintRevealed: true })}>
                  Reveal boss name
                </button>
              ) : (
                <p className="buildle-hint-note">
                  Boss-name hint available after {HINT_AFTER_INCORRECT} incorrect guesses (
                  {incorrectIds.length}/{HINT_AFTER_INCORRECT}).
                </p>
              )}
            </div>
          )}

          {!playing && (
            <section
              className={`game-over ${status === 'solved' ? 'won' : 'lost'}`}
              aria-labelledby="buildle-result-title"
            >
              <h3 id="buildle-result-title">
                {status === 'solved' ? 'Solved!' : 'You gave up.'}
              </h3>
              {status === 'solved' && (
                <p className="buildle-solved-count">
                  Solved in {guessIds.length} {guessIds.length === 1 ? 'guess' : 'guesses'}.
                </p>
              )}
              <p>
                The missing skill was <strong>{skillFor(puzzle.targetId).name}</strong>, from{' '}
                <strong>{puzzle.boss.name}</strong>’s skill bar.
              </p>
              <p className="buildle-encounter">
                {[
                  puzzle.variant.encounter.campaign,
                  puzzle.variant.encounter.locations.join(', '),
                  ...puzzle.variant.encounter.details,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="buildle-sources">
                Sources:{' '}
                {puzzle.variant.sources.map((source, index) => (
                  <span key={source.url}>
                    {index > 0 && ' · '}
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.site}
                    </a>
                  </span>
                ))}
              </p>
              {isDaily ? (
                <>
                  <p>Today’s {difficulty.toUpperCase()} Daily is complete. A new one arrives at midnight UTC.</p>
                  <button type="button" onClick={() => changeMode('infinite', difficulty)}>
                    Play Infinite
                  </button>
                </>
              ) : (
                <button type="button" onClick={nextPuzzle}>
                  Next puzzle
                </button>
              )}
            </section>
          )}
        </>
      )}

      {status === 'withdrawn' && guessIds.length > 0 && (
        // Kept, but not marked right or wrong: the data they were judged
        // against has been corrected.
        <section className="buildle-guesses" aria-labelledby="buildle-guesses-title">
          <h3 id="buildle-guesses-title">Your guesses</h3>
          <ol>
            {guessIds.map((id) => {
              const skill = skillFor(id);
              return (
                <li key={id} className="buildle-guess">
                  <GuessNumber value={guessNumber(id)} />
                  <img className="skill-icon" src={skillIconPath(skill)} alt="" aria-hidden="true" />
                  <span>{skill.name}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {status !== 'withdrawn' && incorrectIds.length > 0 && (
        <section className="buildle-guesses" aria-labelledby="buildle-guesses-title">
          <h3 id="buildle-guesses-title">Incorrect guesses</h3>
          <ol>
            {incorrectIds.map((id) => {
              const skill = skillFor(id);
              return (
                <li key={id} className="buildle-guess incorrect">
                  <GuessNumber value={guessNumber(id)} />
                  <img className="skill-icon" src={skillIconPath(skill)} alt="" aria-hidden="true" />
                  <span>{skill.name}</span>
                  <span className="buildle-guess-result">✗ Incorrect</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <p className="buildle-attribution">{buildleAttribution}</p>
    </section>

    {/* Pinned guess area, the same element and styles as Skilldle's: it
        follows the game in the page and sticks to the top while scrolling.
        It only exists while a round is being played. */}
    {playing && (
      <form className="guess-form" onSubmit={submitGuess}>
        <label htmlFor="buildle-skill-input">Your guess</label>

        <div className="guess-controls">
          <SkillCombobox
            key={`${roundKey}-${round.id}`}
            inputId="buildle-skill-input"
            skills={availableSkills}
            value={round.input}
            onChange={(input) => updateRound({ input })}
            placeholder={
              isNm
                ? 'Start typing an elite Guild Wars skill...'
                : 'Start typing a Guild Wars skill...'
            }
          />

          <button type="submit">Guess</button>
        </div>

        {confirmingGiveUp ? (
          <div className="buildle-confirm" role="group" aria-labelledby="buildle-confirm-text">
            <p id="buildle-confirm-text">
              Give up and show the answer? This ends the round
              {isDaily ? ' and today’s Daily cannot be replayed' : ''}.
            </p>
            <button type="button" onClick={giveUp}>
              Yes, show the answer
            </button>
            <button type="button" onClick={() => setConfirmingGiveUp(false)}>
              Keep playing
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="give-up-button"
            onClick={() => setConfirmingGiveUp(true)}
          >
            Give up / show answer
          </button>
        )}

        <p className="message" aria-live="polite">
          {message}
        </p>
      </form>
    )}

    {/* The shared Skill Library, below the game as in Skilldle. Browsing
        only: it follows Buildle's difficulty (NM: elite-only by default) but
        never changes the puzzle, guesses, suggestions, hint, or saved
        progress. */}
    <SkillLibrary nmMode={isNm} active={active} />
    </>
  );
}

/** "#3", read as "Guess 3:". */
function GuessNumber({ value }: { value: number }) {
  return (
    <span className="buildle-guess-number">
      <span aria-hidden="true">#{value}</span>
      <span className="visually-hidden">Guess {value}: </span>
    </span>
  );
}
