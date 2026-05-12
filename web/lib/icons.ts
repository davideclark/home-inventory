import * as allSi from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';

export type { SimpleIcon };

// All simple-icons sorted alphabetically by title
export const siIcons: SimpleIcon[] = (Object.values(allSi) as unknown[])
  .filter((v): v is SimpleIcon =>
    typeof v === 'object' && v !== null && 'slug' in v && 'path' in v && 'hex' in v
  )
  .sort((a, b) => a.title.localeCompare(b.title));

// Lookup by slug — used by IconRenderer
export const siBySlug = new Map<string, SimpleIcon>(
  siIcons.map(icon => [icon.slug, icon])
);

// ---- Emoji ----

export interface EmojiEntry {
  id: string;
  name: string;
  keywords: string[];
  native: string;
}

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: EmojiEntry[];
}

const CATEGORY_LABELS: Record<string, string> = {
  people:   'Smileys & People',
  nature:   'Animals & Nature',
  foods:    'Food & Drink',
  activity: 'Activities',
  places:   'Travel & Places',
  objects:  'Objects',
  symbols:  'Symbols',
  flags:    'Flags',
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const raw = require('@emoji-mart/data') as {
  categories: Array<{ id: string; emojis: string[] }>;
  emojis: Record<string, { name: string; keywords?: string[]; skins: Array<{ native: string }> }>;
};

export const emojiCategories: EmojiCategory[] = raw.categories
  .filter(cat => CATEGORY_LABELS[cat.id])
  .map(cat => ({
    id: cat.id,
    label: CATEGORY_LABELS[cat.id],
    emojis: cat.emojis
      .map(id => {
        const e = raw.emojis[id];
        if (!e) return null;
        return { id, name: e.name, keywords: e.keywords ?? [], native: e.skins[0].native };
      })
      .filter((e): e is EmojiEntry => e !== null),
  }));

// ---- Value helpers ----

export function isSimpleIcon(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('si:');
}

export function toSimpleIconValue(slug: string): string {
  return `si:${slug}`;
}

// ---- Curated retro/vintage brand quick-picks (slugs from simple-icons) ----
// These are shown as a dedicated section in the picker for discoverability.
export const retroBrandSlugs: string[] = [
  // Classic home computers
  'commodore', 'atari',
  // Consoles
  'playstation', 'playstation2', 'playstation3', 'playstation4', 'playstation5',
  'playstationportable', 'playstationvita',
  // Classic publishers / studios still in simple-icons
  'sega', 'konami', 'activision', 'squareenix',
  // Modern retro platforms
  'retroarch', 'retropie', 'retroachievements',
];

// ---- Custom SVG ----

export function isCustomSvg(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('svg:');
}

export function toCustomSvgValue(svgText: string): string {
  return 'svg:' + btoa(unescape(encodeURIComponent(svgText)));
}

export function customSvgToDataUrl(value: string): string {
  return 'data:image/svg+xml;base64,' + value.slice(4);
}
