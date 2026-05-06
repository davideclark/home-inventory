import { FlatList, View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { catalogue, item } from '../../schema';
import type { Item } from '../../schema';

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

export default function ItemListScreen() {
  const { catalogueId } = useLocalSearchParams<{ catalogueId: string }>();

  const { data: catData } = useLiveQuery(
    db.select({ name: catalogue.name, icon: catalogue.icon })
      .from(catalogue)
      .where(eq(catalogue.id, catalogueId))
      .limit(1)
  );

  const { data: items } = useLiveQuery(
    db.select().from(item)
      .where(eq(item.catalogueId, catalogueId))
      .orderBy(asc(item.itemNumber))
  );

  const cat = catData?.[0];
  const title = cat ? `${cat.icon ? cat.icon + ' ' : ''}${cat.name}` : 'Items';

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
              <Pressable
                onPress={() => router.push({ pathname: '/new-item', params: { catalogueId } })}
                hitSlop={12}
                style={{ paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Text style={{ color: '#007AFF', fontSize: 24, lineHeight: 26 }}>+</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push(`/catalogue/${catalogueId}`)}
                hitSlop={12}
                style={{ paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Text style={{ color: '#007AFF', fontSize: 16 }}>Edit</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      {!items || items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No items yet</Text>
          <Text style={styles.emptySubtitle}>Add items to this catalogue to get started.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: i }) => <ItemRow item={i} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </>
  );
}

function ItemRow({ item: i }: { item: Item }) {
  const statusColour = STATUS_COLOURS[i.status ?? 'active'] ?? '#8e8e93';
  const subtitle = [i.manufacturer, i.model].filter(Boolean).join(' ');

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={() => router.push({ pathname: '/edit-item', params: { itemId: i.id } })}>
      {i.itemNumber != null && (
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>#{String(i.itemNumber).padStart(3, '0')}</Text>
        </View>
      )}
      <View style={[styles.rowBody, i.itemNumber == null && styles.rowBodyNobadge]}>
        <Text style={styles.rowName}>{i.name}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {i.status && i.status !== 'active' && (
        <View style={[styles.statusBadge, { backgroundColor: statusColour }]}>
          <Text style={styles.statusText}>{i.status}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#333' },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center' },
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
