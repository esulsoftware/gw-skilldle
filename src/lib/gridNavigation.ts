/**
 * Column count for the Skill Library icon grid, based on the width of the
 * grid's own container (not the viewport). Targets roughly 10 icons per row
 * on wide screens and fewer on narrow ones; cells shrink to fit, so the grid
 * never overflows horizontally.
 */
export function columnsForWidth(containerWidth: number): number {
  if (containerWidth >= 720) {
    return 10;
  }

  if (containerWidth >= 560) {
    return 8;
  }

  if (containerWidth >= 400) {
    return 6;
  }

  return 5;
}

export type GridKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End';

export function isGridKey(key: string): key is GridKey {
  return [
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ].includes(key);
}

/**
 * Where keyboard focus moves within a grid of `total` items laid out in rows
 * of `columns`. The last row may be short.
 *
 * - Left/Right move one item, continuing onto the previous/next row, and stop
 *   at the first/last item.
 * - Up/Down move one row in the same column. Moving down into a short last
 *   row whose column is empty lands on the last item.
 * - Home/End move to the first/last item of the current row.
 */
export function nextGridIndex(
  current: number,
  key: GridKey,
  total: number,
  columns: number,
): number {
  if (total <= 0) {
    return 0;
  }

  const last = total - 1;
  const index = Math.min(Math.max(current, 0), last);
  const cols = Math.max(1, Math.floor(columns));
  const rowStart = index - (index % cols);

  switch (key) {
    case 'ArrowLeft':
      return Math.max(index - 1, 0);
    case 'ArrowRight':
      return Math.min(index + 1, last);
    case 'ArrowUp':
      return index - cols >= 0 ? index - cols : index;
    case 'ArrowDown': {
      const nextRowStart = rowStart + cols;

      if (nextRowStart > last) {
        return index;
      }

      return Math.min(index + cols, last);
    }
    case 'Home':
      return rowStart;
    case 'End':
      return Math.min(rowStart + cols - 1, last);
  }
}
