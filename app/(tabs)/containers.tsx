import { FlatList, View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq, asc, isNull, and } from 'drizzle-orm';
import { db } from '../../db';
import { item } from '../../schema';

export default function ContainersScreen() {
  const { data: containers } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber })
      .from(item)
      .where(and(eq(item.canContain, true), isNull(item.parentId)))
      .orderBy(asc(item.itemNumber))
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
          <Text style={[styles.rowName, c.itemNumber == null && styles.rowNameNobadge]}>{c.name}</Text>
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
  rowName: { flex: 1, fontSize: 16, fontWeight: '500', color: '#111' },
  rowNameNobadge: { marginLeft: 4 },
  chevron: { fontSize: 20, color: '#ccc' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ddd', marginLeft: 76 },
});
