import { useState } from 'react';
import {
  attributeName,
  campaignName,
  professionName,
  randomSkill,
  skills,
  typeName,
} from './lib/skills';
import './App.css';

function displayCost(cost: number | null) {
  return cost === null ? '—' : cost;
}

function displayTime(time: number | null) {
  return time === null ? '—' : `${time}s`;
}

export default function App() {
  const [skill, setSkill] = useState(() => randomSkill());

  function chooseAnotherSkill() {
    setSkill(randomSkill());
  }

  return (
    <main className="app">
      <header>
        <h1>GW Skilldle</h1>
        <p>Guild Wars 1 skill guessing game</p>
      </header>

      <section className="card">
        <p className="count">
          Loaded {skills.length.toLocaleString()} skills
        </p>

        <h2>{skill.name}</h2>

        <p className="description">{skill.description}</p>

        <dl className="details">
          <div>
            <dt>Skill ID</dt>
            <dd>{skill.id}</dd>
          </div>

          <div>
            <dt>Profession</dt>
            <dd>{professionName(skill)}</dd>
          </div>

          <div>
            <dt>Attribute</dt>
            <dd>{attributeName(skill)}</dd>
          </div>

          <div>
            <dt>Type</dt>
            <dd>{typeName(skill)}</dd>
          </div>

          <div>
            <dt>Campaign</dt>
            <dd>{campaignName(skill)}</dd>
          </div>

          <div>
            <dt>Elite</dt>
            <dd>{skill.elite ? 'Yes' : 'No'}</dd>
          </div>

          <div>
            <dt>Energy</dt>
            <dd>{displayCost(skill.energy)}</dd>
          </div>

          <div>
            <dt>Adrenaline</dt>
            <dd>{displayCost(skill.adrenaline)}</dd>
          </div>

          <div>
            <dt>Activation</dt>
            <dd>{displayTime(skill.activation)}</dd>
          </div>

          <div>
            <dt>Recharge</dt>
            <dd>{displayTime(skill.recharge)}</dd>
          </div>
        </dl>

        <button type="button" onClick={chooseAnotherSkill}>
          Pick another skill
        </button>
      </section>
    </main>
  );
}