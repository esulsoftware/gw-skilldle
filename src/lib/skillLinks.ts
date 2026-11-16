import type { Skill } from './skills';

export function skillIconPath(skill: Skill): string {
  return `/skill-icons/${skill.id}.png`;
}

export function wikiUrl(skill: Skill): string {
  return `https://wiki.guildwars.com/wiki/${encodeURIComponent(skill.name)}`;
}
