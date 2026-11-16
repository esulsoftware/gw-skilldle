import { useMemo, useState } from 'react';
import {
  readLibraryView,
  saveLibraryView,
  type LibraryView,
} from '../lib/libraryView';
import { skillIconPath, wikiUrl } from '../lib/skillLinks';
import {
  isPveSkill,
  isRankBasedPveSkill,
  professionName,
  skills,
} from '../lib/skills';
import SkillGrid from './SkillGrid';

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

type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

export default function SkillLibrary() {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedLibraryFilter, setSelectedLibraryFilter] =
    useState<LibraryFilter>('Warrior');
  const [view, setView] = useState<LibraryView>(readLibraryView);

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

  function changeView(nextView: LibraryView) {
    setView(nextView);
    saveLibraryView(nextView);
  }

  return (
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

          <div className="library-toolbar">
            <p className="library-count">
              {librarySkills.length} {selectedLibraryFilter} skills
            </p>

            <div className="view-toggle" role="group" aria-label="Library view">
              <button
                type="button"
                className={view === 'list' ? 'view-button active' : 'view-button'}
                aria-pressed={view === 'list'}
                onClick={() => changeView('list')}
              >
                List
              </button>
              <button
                type="button"
                className={view === 'grid' ? 'view-button active' : 'view-button'}
                aria-pressed={view === 'grid'}
                onClick={() => changeView('grid')}
              >
                Grid
              </button>
            </div>
          </div>

          {view === 'grid' ? (
            // Keyed by filter so a new filter starts with fresh focus/details.
            <SkillGrid
              key={selectedLibraryFilter}
              skills={librarySkills}
              label={`${selectedLibraryFilter} skills`}
            />
          ) : (
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
          )}
        </div>
      )}
    </section>
  );
}
