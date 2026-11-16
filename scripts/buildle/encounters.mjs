// Buildle's encounter rule (eligibility requirement B), as pure functions.
//
// A boss is excluded as an event/festival-only encounter when the Guild Wars
// Wiki documents it that way:
//   - its page is in an event NPC category (e.g. "Wintersday NPCs",
//     "Canthan New Year NPCs"), or
//   - it has documented locations and EVERY one is tied to an event page
//     (e.g. "only during [[The Knights Who Say Nian]]", a Canthan New Year
//     quest).
// A boss that also appears outside the event stays eligible, and ordinary
// (non-event) quest bosses are unaffected. Names are never used to guess.

const EVENT_NPC_CATEGORY =
  /^(Wintersday|Halloween|Canthan New Year|Dragon Festival|Anniversary Celebration|Special event|Festival|Pantheon|Lunar)[\w ]* NPCs$/i;

const EVENT_PAGE_CATEGORY =
  /^(Festival Event quests|[\w ]+ festival quests|(Wintersday|Halloween|Canthan New Year|Dragon Festival|Anniversary Celebration|Special event)( \d{4})?( quests)?)$/i;

const NEGATED_CONDITION = /\b(not|except|outside|unless|never)\b/i;

export function eventNpcCategories(bossCategories = []) {
  return bossCategories.filter((category) => EVENT_NPC_CATEGORY.test(category));
}

export function isEventPage(pageCategories = []) {
  return pageCategories.some((category) => EVENT_PAGE_CATEGORY.test(category));
}

/**
 * Returns why a boss is event-only, or null when it is not.
 * `locations` comes from wiki.mjs locationEntries(); `linkedCategories` maps
 * linked page titles to their categories.
 */
export function eventOnlyReason(bossCategories, locations, linkedCategories) {
  const npcCategories = eventNpcCategories(bossCategories);

  if (npcCategories.length > 0) {
    return `Boss page category: ${npcCategories.join(', ')}`;
  }

  if (locations.length === 0) {
    return null;
  }

  // A location whose condition is negative ("not during [[Event]]",
  // "except during ...") is where the boss appears OUTSIDE the event, so it
  // never counts as event-only.
  const eventLinks = locations.map((entry) =>
    NEGATED_CONDITION.test(entry.condition ?? '')
      ? []
      : entry.links.filter((title) => isEventPage(linkedCategories[title])),
  );

  if (eventLinks.every((links) => links.length > 0)) {
    return `Every location is during an event: ${[...new Set(eventLinks.flat())].join(', ')}`;
  }

  return null;
}
