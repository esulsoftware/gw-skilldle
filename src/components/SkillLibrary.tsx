import { useId, useMemo, useState } from 'react';
import {
  ALL,
  LIBRARY_TABS,
  allAttributesLabel,
  attributeFilterLabel,
  attributeOptions,
  matchesAttribute,
  matchesType,
  skillStatLine,
  sortFields,
  sortSkills,
  tabPool,
  typeOptions,
  type LibraryTab,
  type SortDirection,
  type SortKey,
} from '../lib/libraryFilters';
import {
  readLibraryView,
  readShowNonElite,
  saveLibraryView,
  saveShowNonElite,
  type LibraryView,
} from '../lib/libraryView';
import { skillIconPath, wikiUrl } from '../lib/skillLinks';
import { isPveSkill, skills } from '../lib/skills';
import SkillGrid from './SkillGrid';

type SkillLibraryProps = {
  /**
   * True in Skilldle NM: the library offers the "Show non-elite skills"
   * checkbox and, while it is unchecked, lists elite skills only.
   */
  nmMode?: boolean;
  /**
   * False while another game is shown. The library stays mounted (keeping its
   * tab, filters, and sort) but drops the grid, whose open popups listen on
   * the whole document for Escape, scrolling, and outside taps.
   */
  active?: boolean;
};

export default function SkillLibrary({
  nmMode = false,
  active = true,
}: SkillLibraryProps) {
  // Unique per instance: Skilldle and Buildle each mount a library.
  const idBase = useId();
  const titleId = `${idBase}-title`;
  const contentId = `${idBase}-content`;
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [selectedLibraryFilter, setSelectedLibraryFilter] =
    useState<LibraryTab>('Warrior');
  const [view, setView] = useState<LibraryView>(readLibraryView);
  // Kept while in HM (where it is ignored), so returning to NM restores it.
  const [showNonElite, setShowNonElite] = useState(readShowNonElite);

  // Optional filters and sorting: in-session only.
  const [attributeFilter, setAttributeFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const eliteOnly = nmMode && !showNonElite;
  const tab = selectedLibraryFilter;

  // Menu choices come from the tab's eligible pool before optional filters,
  // so changing one filter never removes the other's options.
  const pool = useMemo(() => tabPool(skills, tab, eliteOnly), [tab, eliteOnly]);
  const attributeChoices = useMemo(() => attributeOptions(pool), [pool]);
  const typeChoices = useMemo(() => typeOptions(pool), [pool]);
  const fields = sortFields(tab, eliteOnly);

  // When the eligible pool changes (tab, NM mode, or the non-elite checkbox),
  // reset only the selections it made unavailable.
  const eligibilityKey = `${tab}|${eliteOnly}`;
  const [seenEligibilityKey, setSeenEligibilityKey] = useState(eligibilityKey);

  if (seenEligibilityKey !== eligibilityKey) {
    setSeenEligibilityKey(eligibilityKey);

    if (
      attributeFilter !== ALL &&
      !attributeChoices.some((option) => option.value === attributeFilter)
    ) {
      setAttributeFilter(ALL);
    }

    if (
      typeFilter !== ALL &&
      !typeChoices.some((section) =>
        section.options.some((option) => option.value === typeFilter),
      )
    ) {
      setTypeFilter(ALL);
    }

    if (!fields.some((field) => field.key === sortKey)) {
      setSortKey('name');
      setSortDirection('asc');
    }
  }

  const visibleSkills = useMemo(
    () =>
      sortSkills(
        pool.filter(
          (skill) =>
            matchesAttribute(skill, attributeFilter) &&
            matchesType(skill, typeFilter),
        ),
        sortKey,
        sortDirection,
      ),
    [attributeFilter, pool, sortDirection, sortKey, typeFilter],
  );

  const filtersActive = attributeFilter !== ALL || typeFilter !== ALL;
  const isDefault =
    !filtersActive && sortKey === 'name' && sortDirection === 'asc';
  const activeField =
    fields.find((field) => field.key === sortKey) ?? fields[0];
  const poolLabel = `${eliteOnly ? 'elite ' : ''}${tab} skills`;
  const countText = filtersActive
    ? `${visibleSkills.length} of ${pool.length} ${poolLabel}`
    : `${pool.length} ${poolLabel}`;

  function changeTab(nextTab: LibraryTab) {
    setSelectedLibraryFilter(nextTab);
    // Attributes differ per tab; type and sort carry over when still valid.
    setAttributeFilter(ALL);
  }

  function changeView(nextView: LibraryView) {
    setView(nextView);
    saveLibraryView(nextView);
  }

  function changeShowNonElite(nextShowNonElite: boolean) {
    setShowNonElite(nextShowNonElite);
    saveShowNonElite(nextShowNonElite);
  }

  function resetFiltersAndSort() {
    setAttributeFilter(ALL);
    setTypeFilter(ALL);
    setSortKey('name');
    setSortDirection('asc');
  }

  return (
    <section className="skill-library" aria-labelledby={titleId}>
      <div className="library-heading">
        <div>
          <h2 id={titleId}>Skill Library</h2>
          <p>Browse skills by profession without affecting your game.</p>
        </div>

        <button
          type="button"
          className="library-toggle"
          onClick={() => setLibraryOpen((isOpen) => !isOpen)}
          aria-expanded={libraryOpen}
          aria-controls={contentId}
        >
          {libraryOpen ? 'Hide skills' : 'Browse skills'}
        </button>
      </div>

      {libraryOpen && (
        <div id={contentId} className="library-content">
          <div
            className="profession-filters"
            aria-label="Filter skill library by profession"
          >
            {LIBRARY_TABS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={
                  selectedLibraryFilter === filter
                    ? 'profession-button active'
                    : 'profession-button'
                }
                onClick={() => changeTab(filter)}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="library-controls">
            <label className="library-control">
              <span>{attributeFilterLabel(tab)}</span>
              <select
                value={attributeFilter}
                onChange={(event) => setAttributeFilter(event.target.value)}
              >
                <option value={ALL}>{allAttributesLabel(tab)}</option>
                {attributeChoices.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="library-control">
              <span>Type</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value={ALL}>All types</option>
                {typeChoices.map((section) => (
                  <optgroup key={section.label} label={section.label}>
                    {section.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="library-control">
              <span>Sort by</span>
              <select
                value={activeField.key}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                {fields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="library-control">
              <span>Order</span>
              <select
                value={sortDirection}
                onChange={(event) =>
                  setSortDirection(event.target.value as SortDirection)
                }
              >
                <option value="asc">{activeField.ascLabel}</option>
                <option value="desc">{activeField.descLabel}</option>
              </select>
            </label>

            <button
              type="button"
              className="library-reset"
              onClick={resetFiltersAndSort}
              disabled={isDefault}
            >
              Reset filters &amp; sort
            </button>
          </div>

          <div className="library-toolbar">
            <p className="library-count" aria-live="polite">
              {countText}
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

          {pool.length === 0 ? (
            <p className="library-empty">
              No elite {tab} skills. Check “Show non-elite skills” to browse
              the rest of this category.
            </p>
          ) : visibleSkills.length === 0 ? (
            <div className="library-empty">
              <p>No skills match these filters.</p>
              <button
                type="button"
                className="library-reset"
                onClick={resetFiltersAndSort}
              >
                Reset filters &amp; sort
              </button>
            </div>
          ) : view === 'grid' ? (
            !active ? null :
            // Keyed by everything that changes the visible icons or their
            // order, so details reset and the Tab stop stays valid.
            <SkillGrid
              key={[
                tab,
                eliteOnly,
                attributeFilter,
                typeFilter,
                sortKey,
                sortDirection,
              ].join('|')}
              skills={visibleSkills}
              label={`${tab} skills`}
            />
          ) : (
            <ul className="skill-list">
              {visibleSkills.map((skill) => (
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

                  <p className="library-skill-stats">{skillStatLine(skill)}</p>

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
