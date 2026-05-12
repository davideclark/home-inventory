import { FlatList, View, StyleSheet, Pressable, Alert } from 'react-native';
import { Text } from '../../components/Text';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useRef, useMemo } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { asc, eq } from 'drizzle-orm';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { db } from '../../db';
import { catalogue, item } from '../../schema';
import type { Item } from '../../schema';
import { deleteItem } from '../../sync';

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
      .orderBy(asc(item.name))
  );

  const { data: containerItems } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber, parentId: item.parentId })
      .from(item)
      .where(eq(item.canContain, true))
  );

  const containerMap = useMemo(() => {
    const map = new Map<string, { name: string; itemNumber: number | null; parentId: string | null }>();
    containerItems?.forEach(c => map.set(c.id, { name: c.name, itemNumber: c.itemNumber, parentId: c.parentId }));
    return map;
  }, [containerItems]);

  const cat = catData?.[0];
  const title = cat ? `${cat.icon ? cat.icon + ' ' : ''}${cat.name}` : 'Items';

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/new-item', params: { catalogueId } })}
              hitSlop={12}
              style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 4 }}
            >
              <Text style={{ color: '#007AFF', fontSize: 24, lineHeight: 26 }}>+</Text>
            </Pressable>
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
          renderItem={({ item: i }) => <ItemRow item={i} containerMap={containerMap} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </>
  );
}

type ContainerMap = Map<string, { name: string; itemNumber: number | null; parentId: string | null }>;

function buildPath(parentId: string | null | undefined, map: ContainerMap): string {
  if (!parentId) return '';
  const parts: string[] = [];
  let id: string | null = parentId;
  while (id) {
    const c = map.get(id);
    if (!c) break;
    parts.unshift(c.itemNumber != null ? `#${String(c.itemNumber).padStart(3, '0')} ${c.name}` : c.name);
    id = c.parentId;
  }
  return parts.join(' › ');
}

function ItemRow({ item: i, containerMap }: { item: Item; containerMap: ContainerMap }) {
  const swipeRef = useRef<Swipeable>(null);
  const statusColour = STATUS_COLOURS[i.status ?? 'active'] ?? '#8e8e93';
  const subtitle = [i.manufacturer, i.model].filter(Boolean).join(' ');
  const containerPath = buildPath(i.parentId, containerMap);

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        <Pressable
          style={styles.editAction}
          onPress={() => {
            swipeRef.current?.close();
            router.push({ pathname: '/edit-item', params: { itemId: i.id } });
          }}
        >
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable
          style={styles.deleteAction}
          onPress={() => {
            swipeRef.current?.close();
            Alert.alert(
              'Delete Item',
              `Delete "${i.name}"? This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteItem(i.id);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      Alert.alert('Cannot delete', msg);
                    }
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} friction={2}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => router.push({ pathname: '/item-detail', params: { itemId: i.id } })}
      >
        {i.itemNumber != null && (
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>#{String(i.itemNumber).padStart(3, '0')}</Text>
          </View>
        )}
        <View style={[styles.rowBody, i.itemNumber == null && styles.rowBodyNobadge]}>
          <Text style={styles.rowName}>{i.name}</Text>
          {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
          {containerPath ? <Text style={styles.rowPath}>{containerPath}</Text> : null}
        </View>
        {i.status && i.status !== 'active' && (
          <View style={[styles.statusBadge, { backgroundColor: statusColour }]}>
            <Text style={styles.statusText}>{i.status}</Text>
          </View>
        )}
      </Pressable>
    </Swipeable>
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
  rowPath: { fontSize: 11, color: '#aaa', marginTop: 2 },
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
  swipeActions: { flexDirection: 'row' },
  editAction: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
