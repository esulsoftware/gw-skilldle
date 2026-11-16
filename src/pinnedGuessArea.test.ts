/// <reference types="node" />
// jsdom does not apply CSS, so this checks the stylesheet itself: both games
// share one pinned guess-area rule, and nothing un-pins or clips it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src', 'App.css'), 'utf8').replace(/\r\n/g, '\n');

/** Every rule whose selector mentions the given class, with its body. */
function rulesFor(className: string) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim(), body }))
    .filter((rule) => rule.selector.includes(className));
}

describe('pinned guess area styles', () => {
  it('the shared .guess-form rule is sticky near the top, above page content', () => {
    const sticky = rulesFor('.guess-form').find((rule) => /position:\s*sticky/.test(rule.body));
    expect(sticky?.selector).toBe('.guess-form');
    expect(sticky?.body).toMatch(/top:\s*0\.75rem/);
    expect(sticky?.body).toMatch(/z-index:\s*10/);
  });

  it('no rule un-pins the guess area or clips its suggestions', () => {
    for (const rule of rulesFor('guess-form')) {
      expect(rule.body).not.toMatch(/position:\s*(static|relative|absolute|fixed)/);
      expect(rule.body).not.toMatch(/overflow(-[xy])?:\s*(hidden|clip|auto|scroll)/);
    }
    expect(css).not.toMatch(/buildle-form/);
  });
});
