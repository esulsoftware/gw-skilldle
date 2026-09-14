import { useMemo, useState } from 'react';
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

function ResultArrow({ result }: { result: Result }) {
  if (result === 'higher') {
    return <span aria-label="The answer is higher">↑</span>;
  }

  if (result === 'lower') {
    return <span aria-label="The answer is lower">↓</span>;
  }

  return null;
}

export default function App() {
  const [mode, setMode] = useState<GameMode>('daily');
  const [answer, setAnswer] = useState<Skill>(() => answerForMode('daily'));
  const [guesses, setGuesses] = useState<GradedGuess[]>([]);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');

  const skillByNormalizedName = useMemo(() => {
    return new Map(
      skills.map((skill) => [skill.name.trim().toLocaleLowerCase(), skill]),
    );
  }, []);

  const won = guesses.some((guess) => guess.skill.id === answer.id);
  const lost = guesses.length >= MAX_GUESSES && !won;
  const gameOver = won || lost;

  function resetRound(nextMode = mode) {
    setAnswer(answerForMode(nextMode));
    setGuesses([]);
    setInput('');
    setMessage('');
  }

  function changeMode(nextMode: GameMode) {
    setMode(nextMode);
    resetRound(nextMode);
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
            <div className="skill-name">{guess.skill.name}</div>

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

          <button type="button" onClick={() => resetRound()}>
            {mode === 'daily' ? 'Restart today’s puzzle' : 'Next random skill'}
          </button>
        </section>
      )}
    </main>
  );
}