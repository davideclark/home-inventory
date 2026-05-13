import { View, FlatList, StyleSheet, Pressable, Keyboard } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { useState, useRef } from 'react';
import { router } from 'expo-router';
import { or, like, eq, asc, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../../db';
import { item, catalogue } from '../../schema';
import { emojiIcon } from '../../utils';

const STATUS_COLOURS: Record<string, string> = {
  active:   '#34c759',
  untested: '#ff9500',
  tested:   '#34c759',
  faulty:   '#ff3b30',
  stored:   '#8e8e93',
  sold:     '#5856d6',
  donated:  '#007AFF',
  lost:     '#ff9500',
};

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const q = query.trim();

  function cancel() {
    setQuery('');
    Keyboard.dismiss();
    inputRef.current?.blur();
  }

  const { data: results } = useLiveQuery(
    db.select({
        id:           item.id,
        itemNumber:   item.itemNumber,
        name:         item.name,
        manufacturer: item.manufacturer,
        model:        item.model,
        status:       item.status,
        catalogueName: catalogue.name,
        catalogueIcon: catalogue.icon,
      })
      .from(item)
      .leftJoin(catalogue, eq(item.catalogueId, catalogue.id))
      .where(q.length >= 2
        ? or(
            like(item.name,         `%${q}%`),
            like(item.manufacturer, `%${q}%`),
            like(item.model,        `%${q}%`),
            like(item.type,         `%${q}%`),
            like(item.notes,        `%${q}%`),
            like(item.barcode,      `%${q}%`),
            sql`CAST(${item.itemNumber} AS TEXT) LIKE ${'%' + q + '%'}`,
            ...(/^\d+$/.test(q) ? [eq(item.itemNumber, parseInt(q, 10))] : []),
          )
        : sql`1 = 0`)
      .orderBy(asc(item.itemNumber)),
    [q]
  );

  return (
    <View style={styles.flex}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => Keyboard.dismiss()}
          placeholder="Search items…"
          placeholderTextColor="#aaa"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {focused && (
          <Pressable hitSlop={8} onPress={cancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        )}
      </View>

      {q.length < 2 ? (
        <View style={styles.centered}>
          <Text style={styles.hintText}>Search across all catalogues</Text>
        </View>
      ) : results && results.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.hintText}>No items match "{q}"</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          renderItem={({ item: r }) => {
            const statusColour = STATUS_COLOURS[r.status ?? 'active'] ?? '#8e8e93';
            const subtitle = [r.manufacturer, r.model].filter(Boolean).join(' ');
            const catLabel = [emojiIcon(r.catalogueIcon), r.catalogueName].filter(Boolean).join(' ');
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => { Keyboard.dismiss(); router.push({ pathname: '/item-detail', params: { itemId: r.id } }); }}
              >
                {r.itemNumber != null && (
                  <View style={styles.numberBadge}>
                    <Text style={styles.numberText}>#{String(r.itemNumber).padStart(3, '0')}</Text>
                  </View>
                )}
                <View style={[styles.rowBody, r.itemNumber == null && styles.rowBodyNobadge]}>
                  <Text style={styles.rowName}>{r.name}</Text>
                  {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
                  {catLabel ? <Text style={styles.rowCatalogue}>{catLabel}</Text> : null}
                </View>
                {r.status && r.status !== 'active' && (
                  <View style={[styles.statusBadge, { backgroundColor: statusColour }]}>
                    <Text style={styles.statusText}>{r.status}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f2f2f7' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  searchInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#111',
  },
  cancelBtn: { paddingLeft: 12 },
  cancelBtnText: { fontSize: 16, color: '#007AFF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hintText: { fontSize: 15, color: '#888' },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  rowPressed: { backgroundColor: '#f0f0f0' },
  numberBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 12,
    minWidth: 48,
    alignItems: 'center',
  },
  numberText: { fontSize: 12, fontWeight: '600', color: '#555', fontVariant: ['tabular-nums'] },
  rowBody: { flex: 1 },
  rowBodyNobadge: { marginLeft: 4 },
  rowName: { fontSize: 16, fontWeight: '500', color: '#111' },
  rowSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  rowCatalogue: { fontSize: 12, color: '#aaa', marginTop: 2 },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ddd',
    marginLeft: 76,
  },
});
