import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  normalizeForSearch,
  searchSkills,
  suggestionStatus,
} from '../lib/skillSearch';
import { skillIconPath } from '../lib/skillLinks';
import type { Skill } from '../lib/skills';

/** A finger that moves farther than this (px) is scrolling, not tapping. */
const TAP_MOVE_TOLERANCE = 10;

type PointerTracking = {
  skillId: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type SkillComboboxProps = {
  inputId: string;
  /** The skills that may be suggested: eligible for the mode, not yet guessed. */
  skills: readonly Skill[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

/**
 * A text input with an icon suggestion list, following the W3C ARIA
 * combobox pattern (list autocomplete, no automatic selection). Choosing a
 * suggestion fills the input with the skill's exact name; it never submits.
 */
export default function SkillCombobox({
  inputId,
  skills,
  value,
  onChange,
  placeholder,
}: SkillComboboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pointer = useRef<PointerTracking | null>(null);

  const [open, setOpen] = useState(false);
  // True when the list was opened with an arrow key on an empty input.
  const [browseAll, setBrowseAll] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  const listId = `${inputId}-suggestions`;
  const optionId = (skill: Skill) => `${inputId}-option-${skill.id}`;

  const results = useMemo(() => searchSkills(skills, value), [skills, value]);
  const { matches } = results;
  const hasQuery = normalizeForSearch(value) !== '';
  const expanded = open && (hasQuery || browseAll);
  const activeIndex =
    activeId === null
      ? -1
      : matches.findIndex((skill) => skill.id === activeId);
  const activeSkill = activeIndex >= 0 ? matches[activeIndex] : undefined;
  const status = suggestionStatus(results);

  // Keep the highlighted option visible by scrolling only the list itself,
  // never the page.
  useLayoutEffect(() => {
    const list = listRef.current;

    if (!expanded || !list || !activeSkill) {
      return;
    }

    const option = document.getElementById(optionId(activeSkill));

    if (!option) {
      return;
    }

    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;

    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  });

  function close() {
    setOpen(false);
    setBrowseAll(false);
    setActiveId(null);
  }

  function select(skill: Skill) {
    onChange(skill.name);
    close();
    inputRef.current?.focus();
  }

  function openWithHighlight(position: 'first' | 'last') {
    setOpen(true);
    setBrowseAll(!hasQuery);
    const target = position === 'first' ? matches[0] : matches.at(-1);
    setActiveId(target?.id ?? null);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    // Leave keys alone while an IME is composing text.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();

        if (!expanded) {
          openWithHighlight('first');
          return;
        }

        const next = Math.min(activeIndex + 1, matches.length - 1);
        setActiveId(matches[next]?.id ?? null);
        return;
      }

      case 'ArrowUp': {
        event.preventDefault();

        if (!expanded) {
          openWithHighlight('last');
          return;
        }

        // Moving up from the first option returns to plain typing.
        setActiveId(activeIndex > 0 ? matches[activeIndex - 1].id : null);
        return;
      }

      case 'Enter':
        if (expanded && activeSkill) {
          // Choose the suggestion without submitting the form.
          event.preventDefault();
          select(activeSkill);
          return;
        }

        // No highlighted suggestion: let the form submit what was typed.
        close();
        return;

      case 'Escape':
        if (expanded) {
          event.preventDefault();
          close();
        }
        return;

      case 'Tab':
        close();
        return;
    }
  }

  function handleOptionPointerDown(
    event: ReactPointerEvent<HTMLLIElement>,
    skill: Skill,
  ) {
    pointer.current = {
      skillId: skill.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  function handleOptionPointerMove(event: ReactPointerEvent<HTMLLIElement>) {
    const tracking = pointer.current;

    if (!tracking || tracking.pointerId !== event.pointerId) {
      return;
    }

    if (
      Math.hypot(
        event.clientX - tracking.startX,
        event.clientY - tracking.startY,
      ) > TAP_MOVE_TOLERANCE
    ) {
      tracking.moved = true;
    }
  }

  function handleOptionClick(skill: Skill) {
    const tracking = pointer.current;
    pointer.current = null;

    // A scroll that ended on an option is not a choice.
    if (tracking && (tracking.moved || tracking.skillId !== skill.id)) {
      return;
    }

    select(skill);
  }

  return (
    <div className="combobox">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={
          expanded && activeSkill ? optionId(activeSkill) : undefined
        }
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setBrowseAll(false);
          // Typing never highlights a suggestion by itself.
          setActiveId(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={close}
      />

      <div
        className="combobox-popup"
        hidden={!expanded}
        // Keep focus in the input while clicking or tapping the list.
        onMouseDown={(event) => event.preventDefault()}
      >
        <ul
          ref={listRef}
          id={listId}
          className="combobox-list"
          role="listbox"
          aria-label="Skill suggestions"
          hidden={matches.length === 0}
        >
          {expanded &&
            matches.map((skill) => (
              <li
                key={skill.id}
                id={optionId(skill)}
                className={
                  skill.id === activeSkill?.id
                    ? 'combobox-option active'
                    : 'combobox-option'
                }
                role="option"
                aria-selected={skill.id === activeSkill?.id}
                onPointerDown={(event) => handleOptionPointerDown(event, skill)}
                onPointerMove={handleOptionPointerMove}
                onPointerCancel={() => {
                  if (pointer.current) {
                    pointer.current.moved = true;
                  }
                }}
                onClick={() => handleOptionClick(skill)}
              >
                <img
                  className="combobox-icon"
                  src={skillIconPath(skill)}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  draggable={false}
                  onError={(event) => {
                    event.currentTarget.style.visibility = 'hidden';
                  }}
                />
                <span className="combobox-name">{skill.name}</span>
              </li>
            ))}
        </ul>

        {/* Visible copy; screen readers get the live status below instead. */}
        <p className="combobox-status" aria-hidden="true">
          {status}
        </p>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {expanded ? status : ''}
      </p>
    </div>
  );
}
