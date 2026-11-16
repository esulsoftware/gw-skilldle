// Shared helpers for the Buildle boss-data pipeline: wiki API access and
// wikitext parsing. Used by fetch-sources.mjs and build-dataset.mjs.

export const OFFICIAL = {
  site: 'Guild Wars Wiki',
  api: 'https://wiki.guildwars.com/api.php',
  base: 'https://wiki.guildwars.com/wiki/',
};

export const GUILDWIKI = {
  site: 'GuildWiki',
  api: 'https://guildwars.fandom.com/api.php',
  base: 'https://guildwars.fandom.com/wiki/',
};

export const PROFESSIONS = [
  'Warrior', 'Ranger', 'Monk', 'Necromancer', 'Mesmer',
  'Elementalist', 'Assassin', 'Ritualist', 'Paragon', 'Dervish',
];

const USER_AGENT = 'gw-skilldle-buildle-data/1.0 (non-commercial fan project)';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function wikiQuery(wiki, params) {
  const url = `${wiki.api}?${new URLSearchParams({
    ...params,
    format: 'json',
    formatversion: '2',
  })}`;

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

    if (response.ok) {
      return response.json();
    }

    if (attempt >= 3) {
      throw new Error(`${wiki.site}: HTTP ${response.status} for ${url}`);
    }

    await sleep(2000 * attempt);
  }
}

export function pageUrl(wiki, title) {
  return wiki.base + encodeURIComponent(title.replace(/ /g, '_'))
    .replace(/%2C/g, ',')
    .replace(/%27/g, "'")
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
}

// ---------------------------------------------------------------------------
// Wikitext parsing

const SKILL_TEMPLATE =
  /\{\{\s*(skill icon|monster skill icon|skill|monster skill)\s*\|([^}|]+)/gi;
const ELITE_MARK =
  /\(\s*(\[\[\s*(elite skill\|)?elite\s*\]\]|'*elite'*)\s*\)/gi;
// Prose such as "16 [[Curses]]" or "(20 Water Magic in [[Hard mode]])":
// attribute levels, which do not change which skills are used.
const ATTRIBUTE_PROSE =
  /^[\s('"]*(\d+([-–.]+\d+)?|\d+ or \d+)\s*(\[\[)?[A-Z][\w' ]+(\]\])?[^*]*$/i;
const INCOMPLETE = /\{\{\s*(stub|section[- ]stub|verify|incomplete|unverified|needs)/i;

/** The body of a level-2 section, or null. */
export function section(text, pattern) {
  const heading = new RegExp(`^==\\s*${pattern}\\s*==\\s*$`, 'im');
  const match = heading.exec(text);

  if (!match) {
    return null;
  }

  const rest = text.slice(match.index + match[0].length);
  const next = /^==[^=]/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/**
 * Splits a Skills section into its separate lists. Consecutive "*" lines form
 * one list; any heading, label, or other non-attribute text between lists is
 * recorded as the next list's context.
 */
export function skillLists(body) {
  const lists = [];
  let current = null;
  let context = [];

  for (const raw of body.split('\n')) {
    const line = raw.trim();

    if (line.startsWith('*')) {
      if (!current) {
        current = { context, lines: [] };
        lists.push(current);
        context = [];
      }
      current.lines.push(line);
    } else if (line) {
      if (!ATTRIBUTE_PROSE.test(line) && !line.startsWith('<!--')) {
        context.push(line);
      }
      current = null;
    }
  }

  return lists.map(({ context: labels, lines }) => {
    const entries = [];
    const notes = [];

    for (const line of lines) {
      for (const [, kind, name] of line.matchAll(SKILL_TEMPLATE)) {
        entries.push({ name: name.trim(), monsterTemplate: /monster/i.test(kind) });
      }

      const rest = line
        .replace(SKILL_TEMPLATE, '')
        .replace(/\}\}/g, '')
        .replace(ELITE_MARK, '')
        .replace(/<!--.*?-->/g, '')
        .replace(/[*\s]+/g, ' ')
        .trim();

      if (rest) {
        notes.push(rest);
      }
    }

    return { context: labels, entries, notes };
  });
}

export function isMarkedIncomplete(text) {
  return INCOMPLETE.test(text);
}

/** Skill names linked or templated in a section (for "notes mention skills"). */
export function linkedNames(body) {
  const names = new Set();

  for (const [, , name] of body.matchAll(SKILL_TEMPLATE)) {
    names.add(name.trim());
  }

  for (const [, name] of body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    names.add(name.trim());
  }

  return names;
}

export function infoboxField(text, field) {
  const match = new RegExp(`\\|\\s*${field}\\s*=\\s*([^\\n|]+)`, 'i').exec(text);
  return match ? match[1].trim() : null;
}

function plain(wikitext) {
  return wikitext
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Each documented location line in the Locations section, with every page it
 * links (the area itself and any quest/mission in its condition).
 */
export function locationEntries(text) {
  const body = section(text, 'Locations?') ?? '';
  const entries = [];

  for (const line of body.split('\n')) {
    const location = /\{\{\s*NPC location\s*\|([^}|]+)/i.exec(line);

    if (!location) {
      continue;
    }

    const links = new Set([location[1].trim()]);
    for (const [, title] of line.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
      links.add(title.trim());
    }
    // The text written beside the location, e.g. "(only during [[X]])" or
    // "(not during [[X]])".
    const condition = line.slice(location.index + location[0].length).replace(/^[^}]*\}\}/, '').trim();
    entries.push({ location: location[1].trim(), links: [...links], condition });
  }

  return entries;
}

/** Pages linked from the Locations section (areas, quests, missions). */
export function locationLinks(text) {
  const body = section(text, 'Locations?') ?? '';
  const titles = new Set();

  for (const [, title] of body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    titles.add(title.trim());
  }

  for (const [, title] of body.matchAll(/\{\{\s*NPC location\s*\|([^}|]+)/gi)) {
    titles.add(title.trim());
  }

  return titles;
}

/** Locations and any encounter conditions written beside them. */
export function encounter(text) {
  const body = section(text, 'Locations?') ?? '';
  const locations = [];
  const details = [];

  for (const line of body.split('\n')) {
    const location = /\{\{\s*NPC location\s*\|([^}|]+)/i.exec(line);

    if (!location) {
      continue;
    }

    locations.push(location[1].trim());
    const after = line.slice(location.index + location[0].length).replace(/^[^}]*\}\}/, '');
    const note = /\(([^)]*)\)/.exec(after);

    if (note) {
      details.push(plain(note[1]));
    }
  }

  return {
    campaign: infoboxField(text, 'campaign'),
    locations: [...new Set(locations)],
    details: [...new Set(details)],
  };
}
