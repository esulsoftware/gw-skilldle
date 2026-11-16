import { useMemo, useState } from 'react';
import {
  readLibraryView,
  readShowNonElite,
  saveLibraryView,
  saveShowNonElite,
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

type SkillLibraryProps = {
  /**
   * True in Skilldle NM: the library offers the "Show non-elite skills"
   * checkbox and, while it is unchecked, lists elite skills only.
   */
  nmMode?: boolean;
};

export default function SkillLibrary({ nmMode = false }: SkillLibraryProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedLibraryFilter, setSelectedLibraryFilter] =
    useState<LibraryFilter>('Warrior');
  const [view, setView] = useState<LibraryView>(readLibraryView);
  // Kept while in HM (where it is ignored), so returning to NM restores it.
  const [showNonElite, setShowNonElite] = useState(readShowNonElite);

  const eliteOnly = nmMode && !showNonElite;

  const librarySkills = useMemo(() => {
    const matchingSkills = (
      selectedLibraryFilter === 'PvE'
        ? skills.filter(isRankBasedPveSkill)
        : skills.filter(
            (skill) => professionName(skill) === selectedLibraryFilter,
          )
    ).filter((skill) => !eliteOnly || skill.elite);

    return [...matchingSkills].sort((first, second) =>
      first.name.localeCompare(second.name, undefined, {
        sensitivity: 'base',
      }),
    );
  }, [eliteOnly, selectedLibraryFilter]);

  function changeView(nextView: LibraryView) {
    setView(nextView);
    saveLibraryView(nextView);
  }

  function changeShowNonElite(nextShowNonElite: boolean) {
    setShowNonElite(nextShowNonElite);
    saveShowNonElite(nextShowNonElite);
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
              {librarySkills.length} {eliteOnly ? 'elite ' : ''}
              {selectedLibraryFilter} skills
            </p>

            {nmMode && (
              <label className="non-elite-toggle">
                <input
                  type="checkbox"
                  checked={showNonElite}
                  onChange={(event) =>
                    changeShowNonElite(event.target.checked)
                  }
                />
                Show non-elite skills
              </label>
            )}

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

          {librarySkills.length === 0 ? (
            <p className="library-empty">
              No elite {selectedLibraryFilter} skills. Check “Show non-elite
              skills” to browse the rest of this category.
            </p>
          ) : view === 'grid' ? (
            // Keyed by the visible list, so a filter or elite-only change
            // starts with fresh details and a valid keyboard Tab stop.
            <SkillGrid
              key={`${selectedLibraryFilter}:${eliteOnly ? 'elite' : 'all'}`}
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
