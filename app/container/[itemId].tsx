import { FlatList, View, StyleSheet, Pressable, Alert, SectionList } from 'react-native';
import { Text } from '../../components/Text';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useRef, useMemo } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq, isNotNull } from 'drizzle-orm';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { db } from '../../db';
import { item, catalogue } from '../../schema';
import { deleteItem, deleteContainer } from '../../sync';
import CatalogueIcon from '../../components/CatalogueIcon';

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
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber, parentId: item.parentId, notes: item.notes })
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

  const { data: catSummaryRows } = useLiveQuery(
    db.select({ parentId: item.parentId, catalogueName: catalogue.name })
      .from(item)
      .leftJoin(catalogue, eq(item.catalogueId, catalogue.id))
      .where(isNotNull(item.parentId))
  );

  const cataloguesByContainer = useMemo(() => {
    const map = new Map<string, string[]>();
    catSummaryRows?.forEach(row => {
      if (!row.parentId || !row.catalogueName) return;
      const existing = map.get(row.parentId);
      if (!existing) { map.set(row.parentId, [row.catalogueName]); return; }
      if (!existing.includes(row.catalogueName)) existing.push(row.catalogueName);
    });
    return map;
  }, [catSummaryRows]);

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
  );

  const subContainers = useMemo(
    () => (children?.filter(c => c.canContain) ?? []).sort((a, b) => naturalSort(a.name, b.name)),
    [children]
  );
  const items = useMemo(
    () => (children?.filter(c => !c.canContain) ?? []).sort((a, b) => naturalSort(a.name, b.name)),
    [children]
  );

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
          {container?.notes ? <Text style={styles.containerNotes}>{container.notes}</Text> : null}
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to add an item to this container.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(child) => child.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={(breadcrumb || container?.notes) ? (
            <View style={styles.breadcrumbRow}>
              {breadcrumb ? <Text style={styles.breadcrumb}>{breadcrumb}</Text> : null}
              {container?.notes ? <Text style={styles.containerNotes}>{container.notes}</Text> : null}
            </View>
          ) : null}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item: child }) => (
            child.canContain
              ? <ContainerRow child={child} containerMap={containerMap} cataloguesByContainer={cataloguesByContainer} />
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

function ContainerRow({ child: c, containerMap, cataloguesByContainer }: { child: Child; containerMap: ContainerMap; cataloguesByContainer: Map<string, string[]> }) {
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
          onPress={async () => {
            swipeRef.current?.close();
            const directChildren = await db.select({ id: item.id, canContain: item.canContain })
              .from(item).where(eq(item.parentId, c.id));
            const count = directChildren.length;
            const doDelete = async (cascade: boolean) => {
              try { await deleteContainer(c.id, { cascade }); }
              catch (e) { Alert.alert('Cannot delete', e instanceof Error ? e.message : String(e)); }
            };
            if (count === 0) {
              Alert.alert('Delete Container', `Delete "${c.name}"? This cannot be undone.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => doDelete(true) },
              ]);
            } else {
              const hasNonContainerItems = directChildren.some(ch => !ch.canContain);
              const canMoveUp = c.parentId !== null || !hasNonContainerItems;
              Alert.alert(
                'Delete Container',
                canMoveUp
                  ? `"${c.name}" contains ${count} item${count === 1 ? '' : 's'}. Move them to the parent container, or delete everything?`
                  : `"${c.name}" contains ${count} item${count === 1 ? '' : 's'}. It has no parent, so all contents must be deleted too.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  ...(canMoveUp ? [{ text: 'Move Contents Up', onPress: () => doDelete(false) }] : []),
                  { text: 'Delete All', style: 'destructive' as const, onPress: () => doDelete(true) },
                ]
              );
            }
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
        <View style={[styles.rowBody, c.itemNumber == null && styles.rowBodyNobadge]}>
          <Text style={styles.rowName}>{c.name}</Text>
          {(() => {
            const cats = cataloguesByContainer.get(c.id);
            return cats?.length ? <Text style={styles.rowCatalogue}>{cats.join(', ')}</Text> : null;
          })()}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Swipeable>
  );
}

function ItemRow({ child: i, containerMap }: { child: Child; containerMap: ContainerMap }) {
  const swipeRef = useRef<Swipeable>(null);
  const statusColour = STATUS_COLOURS[i.status ?? 'active'] ?? '#8e8e93';
  const subtitle = [i.manufacturer, i.model].filter(Boolean).join(' ');

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
                try { await deleteItem(i.id); }
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
          {i.catalogueName ? (
            <View style={styles.rowCatalogueRow}>
              <CatalogueIcon value={i.catalogueIcon} size={12} />
              <Text style={styles.rowCatalogue}>{i.catalogueName}</Text>
            </View>
          ) : null}
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
  containerNotes: { fontSize: 13, color: '#666', marginTop: 4 },
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
  rowCatalogueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rowCatalogue: { fontSize: 11, color: '#aaa' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  chevron: { fontSize: 20, color: '#ccc' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ddd', marginLeft: 76 },
  swipeActions: { flexDirection: 'row' },
  editAction: { backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center', width: 80 },
  deleteAction: { backgroundColor: '#ff3b30', justifyContent: 'center', alignItems: 'center', width: 80 },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
