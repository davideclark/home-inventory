import { FlatList, View, Text, StyleSheet, Pressable, Alert, SectionList } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useRef, useMemo } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq, asc } from 'drizzle-orm';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { db } from '../../db';
import { item, catalogue } from '../../schema';

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

export default function ContainerScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const { data: containerData } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber, parentId: item.parentId })
      .from(item)
      .where(eq(item.id, itemId))
      .limit(1)
  );
  const container = containerData?.[0];

  const { data: allContainers } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber, parentId: item.parentId })
      .from(item)
      .where(eq(item.canContain, true))
  );

  const containerMap = useMemo(() => {
    const map: ContainerMap = new Map();
    allContainers?.forEach(c => map.set(c.id, { name: c.name, itemNumber: c.itemNumber, parentId: c.parentId }));
    return map;
  }, [allContainers]);

  const { data: children } = useLiveQuery(
    db.select({
        id: item.id,
        itemNumber: item.itemNumber,
        name: item.name,
        status: item.status,
        manufacturer: item.manufacturer,
        model: item.model,
        canContain: item.canContain,
        parentId: item.parentId,
        catalogueName: catalogue.name,
        catalogueIcon: catalogue.icon,
      })
      .from(item)
      .leftJoin(catalogue, eq(item.catalogueId, catalogue.id))
      .where(eq(item.parentId, itemId))
      .orderBy(asc(item.itemNumber))
  );

  const subContainers = children?.filter(c => c.canContain) ?? [];
  const items = children?.filter(c => !c.canContain) ?? [];

  const title = container
    ? (container.itemNumber != null ? `#${String(container.itemNumber).padStart(3, '0')} ${container.name}` : container.name)
    : 'Container';

  const breadcrumb = container ? buildPath(container.parentId, containerMap) : '';

  const sections = [
    ...(subContainers.length > 0 ? [{ title: 'Containers', data: subContainers }] : []),
    ...(items.length > 0 ? [{ title: 'Items', data: items }] : []),
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/new-item', params: { parentId: itemId } })}
              hitSlop={12}
              style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 4 }}
            >
              <Text style={{ color: '#007AFF', fontSize: 24, lineHeight: 26 }}>+</Text>
            </Pressable>
          ),
        }}
      />

      {!children || children.length === 0 ? (
        <View style={styles.centered}>
          {breadcrumb ? <Text style={styles.breadcrumb}>{breadcrumb}</Text> : null}
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to add an item to this container.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(child) => child.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={breadcrumb ? (
            <View style={styles.breadcrumbRow}>
              <Text style={styles.breadcrumb}>{breadcrumb}</Text>
            </View>
          ) : null}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item: child }) => (
            child.canContain
              ? <ContainerRow child={child} containerMap={containerMap} />
              : <ItemRow child={child} containerMap={containerMap} />
          )}
          SectionSeparatorComponent={() => <View style={styles.sectionSep} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </>
  );
}

type Child = {
  id: string;
  itemNumber: number | null;
  name: string;
  status: string | null;
  manufacturer: string | null;
  model: string | null;
  canContain: boolean;
  parentId: string | null;
  catalogueName: string | null;
  catalogueIcon: string | null;
};

function ContainerRow({ child: c, containerMap }: { child: Child; containerMap: ContainerMap }) {
  const swipeRef = useRef<Swipeable>(null);

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        <Pressable
          style={styles.editAction}
          onPress={() => { swipeRef.current?.close(); router.push({ pathname: '/edit-item', params: { itemId: c.id } }); }}
        >
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable
          style={styles.deleteAction}
          onPress={() => {
            swipeRef.current?.close();
            Alert.alert('Delete Container', `Delete "${c.name}"? This cannot be undone.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => {
                try { await db.delete(item).where(eq(item.id, c.id)); }
                catch (e) { Alert.alert('Cannot delete', e instanceof Error ? e.message : String(e)); }
              }},
            ]);
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
    </Swipeable>
  );
}

function ItemRow({ child: i, containerMap }: { child: Child; containerMap: ContainerMap }) {
  const swipeRef = useRef<Swipeable>(null);
  const statusColour = STATUS_COLOURS[i.status ?? 'active'] ?? '#8e8e93';
  const subtitle = [i.manufacturer, i.model].filter(Boolean).join(' ');
  const catLabel = [i.catalogueIcon, i.catalogueName].filter(Boolean).join(' ');

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        <Pressable
          style={styles.editAction}
          onPress={() => { swipeRef.current?.close(); router.push({ pathname: '/edit-item', params: { itemId: i.id } }); }}
        >
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable
          style={styles.deleteAction}
          onPress={() => {
            swipeRef.current?.close();
            Alert.alert('Delete Item', `Delete "${i.name}"? This cannot be undone.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => {
                try { await db.delete(item).where(eq(item.id, i.id)); }
                catch (e) { Alert.alert('Cannot delete', e instanceof Error ? e.message : String(e)); }
              }},
            ]);
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
          {catLabel ? <Text style={styles.rowCatalogue}>{catLabel}</Text> : null}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#333' },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center' },
  list: { paddingBottom: 8 },
  breadcrumbRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  breadcrumb: { fontSize: 12, color: '#aaa' },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: '#888', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionSep: { height: 0 },
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
  rowName: { flex: 1, fontSize: 16, fontWeight: '500', color: '#111' },
  rowNameNobadge: { marginLeft: 4 },
  rowBody: { flex: 1 },
  rowBodyNobadge: { marginLeft: 4 },
  rowSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  rowCatalogue: { fontSize: 11, color: '#aaa', marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  chevron: { fontSize: 20, color: '#ccc' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ddd', marginLeft: 76 },
  swipeActions: { flexDirection: 'row' },
  editAction: { backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center', width: 80 },
  deleteAction: { backgroundColor: '#ff3b30', justifyContent: 'center', alignItems: 'center', width: 80 },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
