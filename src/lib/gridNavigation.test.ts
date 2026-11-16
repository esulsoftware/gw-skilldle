import { describe, expect, it } from 'vitest';
import { columnsForWidth, isGridKey, nextGridIndex } from './gridNavigation';

describe('columnsForWidth', () => {
  it('targets 10 columns in a wide container and fewer when narrow', () => {
    expect(columnsForWidth(1100)).toBe(10);
    expect(columnsForWidth(720)).toBe(10);
    expect(columnsForWidth(719)).toBe(8);
    expect(columnsForWidth(560)).toBe(8);
    expect(columnsForWidth(559)).toBe(6);
    expect(columnsForWidth(400)).toBe(6);
    expect(columnsForWidth(399)).toBe(5);
    expect(columnsForWidth(288)).toBe(5);
  });
});

describe('isGridKey', () => {
  it('accepts navigation keys only', () => {
    expect(isGridKey('ArrowDown')).toBe(true);
    expect(isGridKey('Home')).toBe(true);
    expect(isGridKey('Enter')).toBe(false);
    expect(isGridKey('Tab')).toBe(false);
  });
});

describe('nextGridIndex', () => {
  // 23 items in rows of 10: rows are 0-9, 10-19, and a short row 20-22.
  const total = 23;
  const cols = 10;

  it('moves left and right, continuing across rows', () => {
    expect(nextGridIndex(4, 'ArrowRight', total, cols)).toBe(5);
    expect(nextGridIndex(9, 'ArrowRight', total, cols)).toBe(10);
    expect(nextGridIndex(10, 'ArrowLeft', total, cols)).toBe(9);
  });

  it('stops at the first and last items', () => {
    expect(nextGridIndex(0, 'ArrowLeft', total, cols)).toBe(0);
    expect(nextGridIndex(22, 'ArrowRight', total, cols)).toBe(22);
  });

  it('moves up and down one row in the same column', () => {
    expect(nextGridIndex(3, 'ArrowDown', total, cols)).toBe(13);
    expect(nextGridIndex(13, 'ArrowUp', total, cols)).toBe(3);
    expect(nextGridIndex(3, 'ArrowUp', total, cols)).toBe(3);
  });

  it('moves down into a short last row, landing on its last item', () => {
    expect(nextGridIndex(12, 'ArrowDown', total, cols)).toBe(22);
    expect(nextGridIndex(18, 'ArrowDown', total, cols)).toBe(22);
    expect(nextGridIndex(21, 'ArrowDown', total, cols)).toBe(21);
  });

  it('moves up out of a short last row', () => {
    expect(nextGridIndex(22, 'ArrowUp', total, cols)).toBe(12);
  });

  it('Home/End move to the ends of the current row', () => {
    expect(nextGridIndex(14, 'Home', total, cols)).toBe(10);
    expect(nextGridIndex(14, 'End', total, cols)).toBe(19);
    expect(nextGridIndex(21, 'Home', total, cols)).toBe(20);
    expect(nextGridIndex(20, 'End', total, cols)).toBe(22);
  });

  it('uses whatever column count is currently rendered', () => {
    expect(nextGridIndex(2, 'ArrowDown', total, 5)).toBe(7);
    expect(nextGridIndex(2, 'ArrowDown', total, 6)).toBe(8);
    expect(nextGridIndex(7, 'End', total, 6)).toBe(11);
  });

  it('copes with out-of-range input and empty grids', () => {
    expect(nextGridIndex(99, 'ArrowLeft', total, cols)).toBe(21);
    expect(nextGridIndex(0, 'ArrowDown', 0, cols)).toBe(0);
    expect(nextGridIndex(0, 'ArrowDown', 3, 0)).toBe(1);
  });
});
