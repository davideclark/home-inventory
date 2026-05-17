import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  TextInput as RNTextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from './Text';
import { Svg, Path } from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import * as allSi from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';

// --- Module-level data (computed once) ---

const siIcons: SimpleIcon[] = (Object.values(allSi) as unknown[])
  .filter((v): v is SimpleIcon =>
    typeof v === 'object' && v !== null && 'slug' in v && 'path' in v && 'hex' in v
  )
  .sort((a, b) => a.title.localeCompare(b.title));

const siBySlug = new Map<string, SimpleIcon>(siIcons.map(i => [i.slug, i]));

const RETRO_SLUGS = [
  'commodore', 'atari',
  'playstation', 'playstation2', 'playstation3', 'playstation4', 'playstation5',
  'playstationportable', 'playstationvita',
  'sega', 'konami', 'activision', 'squareenix',
  'retroarch', 'retropie', 'retroachievements',
];

const retroIcons = RETRO_SLUGS
  .map(s => siBySlug.get(s))
  .filter((i): i is SimpleIcon => i !== undefined);

interface EmojiEntry { id: string; name: string; keywords: string[]; native: string; }
interface EmojiCategory { id: string; label: string; emojis: EmojiEntry[]; }

const CATEGORY_LABELS: Record<string, string> = {
  people: 'Smileys & People',
  nature: 'Animals & Nature',
  foods: 'Food & Drink',
  activity: 'Activities',
  places: 'Travel & Places',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

const rawEmoji = require('@emoji-mart/data') as {
  categories: Array<{ id: string; emojis: string[] }>;
  emojis: Record<string, { name: string; keywords?: string[]; skins: Array<{ native: string }> }>;
};

const emojiCategories: EmojiCategory[] = rawEmoji.categories
  .filter(cat => CATEGORY_LABELS[cat.id])
  .map(cat => ({
    id: cat.id,
    label: CATEGORY_LABELS[cat.id],
    emojis: cat.emojis
      .map(id => {
        const e = rawEmoji.emojis[id];
        if (!e) return null;
        return { id, name: e.name, keywords: e.keywords ?? [], native: e.skins[0].native };
      })
      .filter((e): e is EmojiEntry => e !== null),
  }));

// --- Value helpers ---

export function toSimpleIconValue(slug: string): string { return `si:${slug}`; }

export function toCustomSvgValue(svgText: string): string {
  return 'svg:' + btoa(unescape(encodeURIComponent(svgText)));
}

// --- Grid types ---

type GridItem =
  | { type: 'section-header'; id: string; label: string }
  | { type: 'si-row'; id: string; icons: SimpleIcon[] }
  | { type: 'emoji-row'; id: string; emojis: EmojiEntry[] };

function chunk<T>(arr: T[], n: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += n) rows.push(arr.slice(i, i + n));
  return rows;
}

// --- Component ---

type Props = {
  value: string | null | undefined;
  visible: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
};

const TILE = 44;

export default function IconPicker({ value, visible, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [svgInput, setSvgInput] = useState('');
  const [svgError, setSvgError] = useState('');
  const [showSvg, setShowSvg] = useState(false);
  const { width } = useWindowDimensions();

  const numCols = Math.max(4, Math.floor((width - 32) / TILE));

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setSvgInput('');
      setSvgError('');
      setShowSvg(false);
    }
  }, [visible]);

  const q = search.toLowerCase().trim();

  const gridData = useMemo<GridItem[]>(() => {
    if (q) {
      const filteredSi = siIcons.filter(i =>
        i.title.toLowerCase().includes(q) || i.slug.includes(q)
      );
      const filteredEmoji: EmojiEntry[] = [];
      emojiCategories.forEach(cat =>
        cat.emojis.forEach(e => {
          if (
            e.name.toLowerCase().includes(q) ||
            e.id.includes(q) ||
            e.keywords.some(k => k.includes(q))
          ) filteredEmoji.push(e);
        })
      );
      const items: GridItem[] = [];
      if (filteredSi.length > 0) {
        items.push({ type: 'section-header', id: 'sh-brands', label: `Brands (${filteredSi.length})` });
        chunk(filteredSi, numCols).forEach((row, i) =>
          items.push({ type: 'si-row', id: `si-r${i}`, icons: row })
        );
      }
      if (filteredEmoji.length > 0) {
        items.push({ type: 'section-header', id: 'sh-emoji', label: `Emoji (${filteredEmoji.length})` });
        chunk(filteredEmoji, numCols).forEach((row, i) =>
          items.push({ type: 'emoji-row', id: `em-r${i}`, emojis: row })
        );
      }
      return items;
    }

    const items: GridItem[] = [];
    if (retroIcons.length > 0) {
      items.push({ type: 'section-header', id: 'sh-retro', label: 'Retro & Vintage' });
      chunk(retroIcons, numCols).forEach((row, i) =>
        items.push({ type: 'si-row', id: `retro-r${i}`, icons: row })
      );
    }
    items.push({ type: 'section-header', id: 'sh-all', label: `All Brands (${siIcons.length})` });
    chunk(siIcons, numCols).forEach((row, i) =>
      items.push({ type: 'si-row', id: `si-r${i}`, icons: row })
    );
    emojiCategories.forEach(cat => {
      items.push({ type: 'section-header', id: `sh-${cat.id}`, label: cat.label });
      chunk(cat.emojis, numCols).forEach((row, i) =>
        items.push({ type: 'emoji-row', id: `${cat.id}-r${i}`, emojis: row })
      );
    });
    return items;
  }, [q, numCols]);

  function select(val: string) {
    onSelect(val);
    onClose();
  }

  function applyCustomSvg() {
    const trimmed = svgInput.trim();
    if (!trimmed.toLowerCase().includes('<svg')) {
      setSvgError('Must contain an <svg> element.');
      return;
    }
    try {
      select(toCustomSvgValue(trimmed));
    } catch {
      setSvgError('Invalid SVG — could not encode.');
    }
  }

  const hasResults = q.length === 0 || gridData.some(i => i.type !== 'section-header');

  const renderItem = ({ item }: { item: GridItem }) => {
    if (item.type === 'section-header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{item.label}</Text>
        </View>
      );
    }
    if (item.type === 'si-row') {
      return (
        <View style={styles.iconRow}>
          {item.icons.map(icon => (
            <Pressable
              key={icon.slug}
              style={({ pressed }) => [
                styles.tile,
                value === toSimpleIconValue(icon.slug) && styles.tileSelected,
                pressed && styles.tilePressed,
              ]}
              onPress={() => select(toSimpleIconValue(icon.slug))}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={`#${icon.hex}`}>
                <Path d={icon.path} />
              </Svg>
            </Pressable>
          ))}
        </View>
      );
    }
    return (
      <View style={styles.iconRow}>
        {item.emojis.map(e => (
          <Pressable
            key={e.id}
            style={({ pressed }) => [
              styles.tile,
              value === e.native && styles.tileSelected,
              pressed && styles.tilePressed,
            ]}
            onPress={() => select(e.native)}
          >
            <Text style={styles.emoji}>{e.native}</Text>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Choose Icon</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.doneBtn}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.searchBar}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search brands and emoji…"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              returnKeyType="search"
            />
          </View>

          <View style={styles.svgSection}>
            <Pressable onPress={() => setShowSvg(v => !v)} style={styles.svgToggle}>
              <Text style={styles.svgToggleText}>
                {showSvg ? '▲  Paste custom SVG' : '▼  Paste custom SVG'}
              </Text>
            </Pressable>
            {showSvg && (
              <View style={styles.svgRow}>
                <RNTextInput
                  style={styles.svgTextInput}
                  value={svgInput}
                  onChangeText={v => { setSvgInput(v); setSvgError(''); }}
                  placeholder={'<svg xmlns=…>…</svg>'}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                <Pressable
                  style={[styles.svgUseBtn, !svgInput.trim() && styles.svgUseBtnDisabled]}
                  onPress={applyCustomSvg}
                  disabled={!svgInput.trim()}
                >
                  <Text style={styles.svgUseBtnText}>Use</Text>
                </Pressable>
              </View>
            )}
            {!!svgError && <Text style={styles.svgError}>{svgError}</Text>}
          </View>

          {!hasResults ? (
            <View style={styles.noResults}>
              <Text style={styles.noResultsText}>No results for "{search}"</Text>
            </View>
          ) : (
            <FlatList
              data={gridData}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              removeClippedSubviews
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  title: { fontSize: 17, fontWeight: '600', color: '#111' },
  doneBtn: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  searchInput: {
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  svgSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  svgToggle: { paddingVertical: 4 },
  svgToggleText: { fontSize: 13, color: '#007AFF' },
  svgRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-start' },
  svgTextInput: {
    flex: 1,
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    minHeight: 64,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  svgUseBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-end',
  },
  svgUseBtnDisabled: { opacity: 0.4 },
  svgUseBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  svgError: { fontSize: 12, color: '#ff3b30', marginTop: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionHeader: { paddingTop: 16, paddingBottom: 6 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  iconRow: { flexDirection: 'row' },
  tile: {
    width: TILE,
    height: TILE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tileSelected: { backgroundColor: '#e3f0ff' },
  tilePressed: { backgroundColor: '#f0f0f0' },
  emoji: { fontSize: 22, lineHeight: TILE },
  noResults: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  noResultsText: { fontSize: 15, color: '#aaa' },
});
