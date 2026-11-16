import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { columnsForWidth, isGridKey, nextGridIndex } from '../lib/gridNavigation';
import { skillStatLine } from '../lib/libraryFilters';
import { skillIconPath, wikiUrl } from '../lib/skillLinks';
import { isPveSkill, type Skill } from '../lib/skills';

/** A finger that moves farther than this (px) is scrolling, not tapping. */
const TAP_MOVE_TOLERANCE = 10;
/** Delay before a hover popup closes, so the pointer can move onto it. */
const HOVER_CLOSE_DELAY_MS = 150;
const VIEWPORT_MARGIN = 8;

type HoverState = { index: number; source: 'pointer' | 'focus' };

type TouchTracking = {
  index: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** Was this icon's details panel already open when the finger went down? */
  panelWasOpen: boolean;
};

type SkillGridProps = {
  skills: Skill[];
  label: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    rows.push(items.slice(start, start + size));
  }

  return rows;
}

function descriptionId(skill: Skill): string {
  return `grid-skill-description-${skill.id}`;
}

export default function SkillGrid({ skills, label }: SkillGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const lastPointerType = useRef<string | null>(null);
  const touch = useRef<TouchTracking | null>(null);
  // After Escape (or closing the touch panel), keep this icon's popup closed
  // until the user moves on. A ref, because focus() runs handlers right away.
  const suppressedIndex = useRef<number | null>(null);

  const [columns, setColumns] = useState(10);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [touchIndex, setTouchIndex] = useState<number | null>(null);

  const lastIndex = skills.length - 1;
  const tabStopIndex = Math.min(activeIndex, Math.max(lastIndex, 0));
  const hoverSkill = hover ? skills[hover.index] : undefined;
  const touchSkill = touchIndex !== null ? skills[touchIndex] : undefined;

  // The rendered column count comes from the container's real width and is
  // the same value keyboard navigation uses.
  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const update = () => {
      const width = container.clientWidth || window.innerWidth;
      setColumns(columnsForWidth(width));
    };

    update();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(container);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  // Position the hover/focus popup next to its icon, kept inside the viewport.
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    const link = hover ? linkRefs.current[hover.index] : null;

    if (!tooltip || !link) {
      return;
    }

    const anchor = link.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(anchor.left + anchor.width / 2 - width / 2, maxLeft),
    );

    let top = anchor.bottom + 6;
    const fitsBelow = top + height <= window.innerHeight - VIEWPORT_MARGIN;
    const fitsAbove = anchor.top - 6 - height >= VIEWPORT_MARGIN;

    if (!fitsBelow && fitsAbove) {
      top = anchor.top - 6 - height;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.visibility = 'visible';
  }, [hover]);

  // A fixed-position hover popup would drift away from its icon on scroll.
  useEffect(() => {
    if (!hover) {
      return;
    }

    const close = () => setHover(null);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [hover]);

  // When the touch panel opens: move focus into it, and scroll the page if
  // the panel would cover the selected icon (only when there is room).
  useLayoutEffect(() => {
    if (touchIndex === null) {
      return;
    }

    const panel = panelRef.current;
    const link = linkRefs.current[touchIndex];

    panel?.focus({ preventScroll: true });

    if (!panel || !link) {
      return;
    }

    const panelTop = panel.getBoundingClientRect().top;
    const icon = link.getBoundingClientRect();
    const overlap = icon.bottom + VIEWPORT_MARGIN - panelTop;

    if (overlap > 0 && icon.top - overlap >= VIEWPORT_MARGIN) {
      window.scrollBy({ top: overlap });
    }
  }, [touchIndex]);

  // Tapping anywhere outside the panel (other than another icon) closes it.
  useEffect(() => {
    if (touchIndex === null) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (
        target &&
        (panelRef.current?.contains(target) ||
          containerRef.current?.contains(target))
      ) {
        return;
      }

      setTouchIndex(null);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () =>
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [touchIndex]);

  // Escape closes whichever popup is open.
  useEffect(() => {
    if (!hover && touchIndex === null) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (touchIndex !== null) {
        closeTouchPanel(true);
        return;
      }

      if (hover) {
        suppressedIndex.current = hover.index;
        setHover(null);
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  });

  function cancelHoverClose() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleHoverClose() {
    cancelHoverClose();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setHover((current) => (current?.source === 'pointer' ? null : current));
    }, HOVER_CLOSE_DELAY_MS);
  }

  function closeTouchPanel(restoreFocus: boolean) {
    const index = touchIndex;
    setTouchIndex(null);

    if (restoreFocus && index !== null) {
      // Returning focus must not immediately pop the hover/focus popup.
      suppressedIndex.current = index;
      lastPointerType.current = null;
      linkRefs.current[index]?.focus({ preventScroll: true });
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!isGridKey(event.key)) {
      return;
    }

    event.preventDefault();
    lastPointerType.current = null;

    const next = nextGridIndex(tabStopIndex, event.key, skills.length, columns);
    setActiveIndex(next);
    linkRefs.current[next]?.focus();
  }

  function handlePointerEnter(
    event: ReactPointerEvent<HTMLAnchorElement>,
    index: number,
  ) {
    if (event.pointerType !== 'mouse') {
      return;
    }

    cancelHoverClose();

    if (suppressedIndex.current !== index) {
      setHover({ index, source: 'pointer' });
    }
  }

  function handlePointerLeave(
    event: ReactPointerEvent<HTMLAnchorElement>,
    index: number,
  ) {
    if (event.pointerType !== 'mouse') {
      return;
    }

    if (suppressedIndex.current === index) {
      suppressedIndex.current = null;
    }

    scheduleHoverClose();
  }

  function handleFocus(index: number) {
    setActiveIndex(index);

    if (suppressedIndex.current !== null && suppressedIndex.current !== index) {
      suppressedIndex.current = null;
    }

    // A tap focuses the link too; touch uses the details panel instead.
    if (lastPointerType.current === 'touch' || suppressedIndex.current === index) {
      return;
    }

    setHover((current) =>
      current?.index === index && current.source === 'pointer'
        ? current
        : { index, source: 'focus' },
    );
  }

  function handleBlur(index: number) {
    setHover((current) =>
      current?.index === index && current.source === 'focus' ? null : current,
    );
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLAnchorElement>,
    index: number,
  ) {
    lastPointerType.current = event.pointerType;

    if (event.pointerType !== 'touch') {
      touch.current = null;
      return;
    }

    touch.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      panelWasOpen: touchIndex === index,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLAnchorElement>) {
    const tracking = touch.current;

    if (!tracking || tracking.pointerId !== event.pointerId) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - tracking.startX,
      event.clientY - tracking.startY,
    );

    if (distance > TAP_MOVE_TOLERANCE) {
      tracking.moved = true;
    }
  }

  function handlePointerCancel() {
    // The browser took over the gesture (usually to scroll the page).
    if (touch.current) {
      touch.current.moved = true;
    }
  }

  function handleClick(
    event: ReactMouseEvent<HTMLAnchorElement>,
    index: number,
  ) {
    const tracking = touch.current;
    // Keyboard activation (Enter) produces a click with detail 0.
    const fromTouch =
      lastPointerType.current === 'touch' && event.detail !== 0;

    touch.current = null;
    lastPointerType.current = null;

    if (!fromTouch) {
      // Mouse click or Enter: follow the link to the wiki (new tab).
      return;
    }

    const isTap = tracking !== null && tracking.index === index && !tracking.moved;

    if (isTap && tracking.panelWasOpen) {
      // Second tap on the icon whose details are showing: open the wiki.
      return;
    }

    // The first tap, or a gesture that turned into a scroll, never navigates.
    event.preventDefault();

    if (isTap) {
      cancelHoverClose();
      setHover(null);
      setActiveIndex(index);
      setTouchIndex(index);
    }
  }

  if (skills.length === 0) {
    return <p className="library-count">No skills to show.</p>;
  }

  const rows = chunk(skills, columns);

  return (
    <>
      <p id="skill-grid-instructions" className="visually-hidden">
        Use the arrow keys to move between skills. Press Enter to open the
        skill’s Guild Wars Wiki page.
      </p>

      <div
        ref={containerRef}
        className="skill-grid"
        role="grid"
        aria-label={label}
        aria-describedby="skill-grid-instructions"
        onKeyDown={handleKeyDown}
      >
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="skill-grid-row"
            role="row"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {row.map((skill, columnIndex) => {
              const index = rowIndex * columns + columnIndex;

              return (
                <div key={skill.id} className="skill-grid-cell" role="gridcell">
                  <a
                    ref={(element) => {
                      linkRefs.current[index] = element;
                    }}
                    className={
                      touchIndex === index
                        ? 'skill-grid-link selected'
                        : 'skill-grid-link'
                    }
                    href={wikiUrl(skill)}
                    target="_blank"
                    rel="noreferrer"
                    tabIndex={index === tabStopIndex ? 0 : -1}
                    aria-label={skill.name}
                    aria-describedby={descriptionId(skill)}
                    data-index={index}
                    onPointerEnter={(event) => handlePointerEnter(event, index)}
                    onPointerLeave={(event) => handlePointerLeave(event, index)}
                    onPointerDown={(event) => handlePointerDown(event, index)}
                    onPointerMove={handlePointerMove}
                    onPointerCancel={handlePointerCancel}
                    onFocus={() => handleFocus(index)}
                    onBlur={() => handleBlur(index)}
                    onClick={(event) => handleClick(event, index)}
                  >
                    <img
                      className="skill-grid-icon"
                      src={skillIconPath(skill)}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                  </a>
                  <span id={descriptionId(skill)} className="visually-hidden">
                    {isPveSkill(skill) ? 'PvE skill. ' : ''}
                    {`${skillStatLine(skill)}. `}
                    {skill.description}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {hoverSkill && touchIndex === null && (
        <div
          ref={tooltipRef}
          className="skill-grid-tooltip"
          // Screen readers already get the description via aria-describedby.
          aria-hidden="true"
          data-testid="skill-grid-tooltip"
          style={{ visibility: 'hidden' }}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') {
              cancelHoverClose();
            }
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') {
              scheduleHoverClose();
            }
          }}
        >
          <p className="skill-grid-popup-name">
            {hoverSkill.name}
            {isPveSkill(hoverSkill) && <span className="pve-tag">PvE</span>}
          </p>
          <p className="skill-grid-popup-stats">{skillStatLine(hoverSkill)}</p>
          {hoverSkill.description && (
            <p className="skill-grid-popup-description">
              {hoverSkill.description}
            </p>
          )}
        </div>
      )}

      {touchSkill && (
        <div
          ref={panelRef}
          className="skill-grid-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="skill-grid-panel-title"
          tabIndex={-1}
        >
          <div className="skill-grid-panel-header">
            <img
              className="skill-icon"
              src={skillIconPath(touchSkill)}
              alt=""
              aria-hidden="true"
            />
            <h3 id="skill-grid-panel-title" className="skill-grid-popup-name">
              {touchSkill.name}
              {isPveSkill(touchSkill) && <span className="pve-tag">PvE</span>}
            </h3>
            <button
              type="button"
              className="skill-grid-panel-close"
              aria-label="Close skill details"
              onClick={() => closeTouchPanel(true)}
            >
              ×
            </button>
          </div>

          <p className="skill-grid-popup-stats">{skillStatLine(touchSkill)}</p>

          {touchSkill.description && (
            <p className="skill-grid-popup-description skill-grid-panel-description">
              {touchSkill.description}
            </p>
          )}

          <a
            className="skill-grid-panel-wiki"
            href={wikiUrl(touchSkill)}
            target="_blank"
            rel="noreferrer"
          >
            Open on Guild Wars Wiki ↗
          </a>
        </div>
      )}
    </>
  );
}
