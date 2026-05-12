import { FlatList, View, StyleSheet, Pressable } from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq, isNull, and } from 'drizzle-orm';
import { useMemo } from 'react';
import { db } from '../../db';
import { item } from '../../schema';

function naturalSort(a: string, b: string): number {
  const re = /(\d+)/g;
  const ap = a.split(re);
  const bp = b.split(re);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const as = ap[i] ?? '';
    const bs = bp[i] ?? '';
    if (i % 2 === 1) {
      const diff = parseInt(as, 10) - parseInt(bs, 10);
      if (diff !== 0) return diff;
    } else {
      const cmp = as.toLowerCase() < bs.toLowerCase() ? -1 : as.toLowerCase() > bs.toLowerCase() ? 1 : 0;
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

export default function ContainersScreen() {
  const { data: rawContainers } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber, notes: item.notes })
      .from(item)
      .where(and(eq(item.canContain, true), isNull(item.parentId)))
  );

  const containers = useMemo(
    () => [...(rawContainers ?? [])].sort((a, b) => naturalSort(a.name, b.name)),
    [rawContainers]
  );

  if (!containers || containers.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No containers yet</Text>
        <Text style={styles.emptySubtitle}>Add an item with "Can contain other items" enabled to create a root container.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={containers}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      renderItem={({ item: c }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push({ pathname: '/container/[itemId]', params: { itemId: c.id } })}
        >
          {c.itemNumber != null && (
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>#{String(c.itemNumber).padStart(3, '0')}</Text>
            </View>
          )}
          <View style={[styles.rowBody, c.itemNumber == null && styles.rowBodyNobadge]}>
            <Text style={styles.rowName}>{c.name}</Text>
            {c.notes ? <Text style={styles.rowNotes}>{c.notes}</Text> : null}
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#333' },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center' },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  rowNotes: { fontSize: 13, color: '#666', marginTop: 2 },
  chevron: { fontSize: 20, color: '#ccc' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ddd', marginLeft: 76 },
});
