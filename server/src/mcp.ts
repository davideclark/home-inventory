import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { eq, or, ilike, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from './db';
import { catalogue, item, syncTombstone } from './schema';

const server = new Server(
  { name: 'inventory', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_catalogues',
      description: 'List all catalogues',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_containers',
      description: 'List items where canContain=true. Pass parentId to get children of a specific container, or omit for root containers.',
      inputSchema: {
        type: 'object',
        properties: {
          parentId: { type: 'string', description: 'Optional parent container ID' },
        },
      },
    },
    {
      name: 'get_item',
      description: 'Get a single item by id or itemNumber',
      inputSchema: {
        type: 'object',
        properties: {
          id:         { type: 'string', description: 'Item UUID' },
          itemNumber: { type: 'number', description: 'Item number (integer)' },
        },
      },
    },
    {
      name: 'search_items',
      description: 'Full-text search across name, manufacturer, model, type, notes, barcode',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query:       { type: 'string' },
          catalogueId: { type: 'string', description: 'Optional: limit to one catalogue' },
        },
      },
    },
    {
      name: 'add_catalogue',
      description: 'Create a new catalogue',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          id:           { type: 'string', description: 'Optional UUID — generated if omitted' },
          name:         { type: 'string' },
          icon:         { type: 'string', description: 'Emoji character' },
          description:  { type: 'string' },
          sortOrder:    { type: 'number' },
        },
      },
    },
    {
      name: 'add_item',
      description: 'Create a new item',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          id:           { type: 'string', description: 'Optional UUID — generated if omitted' },
          itemNumber:   { type: 'number', description: 'Globally unique integer from label roll' },
          catalogueId:  { type: 'string' },
          parentId:     { type: 'string', description: 'Parent container item ID' },
          name:         { type: 'string' },
          status:       { type: 'string', description: 'active | untested | tested | faulty | stored | sold | donated | lost' },
          notes:        { type: 'string' },
          manufacturer: { type: 'string' },
          model:        { type: 'string' },
          type:         { type: 'string' },
          condition:    { type: 'string' },
          colour:       { type: 'string' },
          barcode:      { type: 'string' },
          canContain:   { type: 'boolean' },
          spec:         { type: 'object', description: 'Catalogue-specific fields as key/value pairs' },
        },
      },
    },
    {
      name: 'update_item',
      description: 'Update an existing item by id',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id:           { type: 'string' },
          itemNumber:   { type: 'number' },
          catalogueId:  { type: 'string' },
          parentId:     { type: 'string' },
          name:         { type: 'string' },
          status:       { type: 'string' },
          notes:        { type: 'string' },
          manufacturer: { type: 'string' },
          model:        { type: 'string' },
          type:         { type: 'string' },
          condition:    { type: 'string' },
          colour:       { type: 'string' },
          barcode:      { type: 'string' },
          canContain:   { type: 'boolean' },
          spec:         { type: 'object' },
        },
      },
    },
    {
      name: 'update_catalogue',
      description: 'Update an existing catalogue by id',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id:           { type: 'string' },
          name:         { type: 'string' },
          icon:         { type: 'string', description: 'Emoji character' },
          description:  { type: 'string' },
          sortOrder:    { type: 'number' },
        },
      },
    },
    {
      name: 'delete_catalogue',
      description: 'Delete a catalogue by id',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
    {
      name: 'delete_item',
      description: 'Delete an item by id',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
    {
      name: 'bulk_import',
      description: 'Import a full dataset. Inserts catalogues first, then items topologically (parents before children). Pass clearFirst=true to wipe existing data.',
      inputSchema: {
        type: 'object',
        properties: {
          clearFirst: { type: 'boolean', description: 'Delete all existing items and catalogues before importing' },
          catalogues: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                id:           { type: 'string' },
                name:         { type: 'string' },
                icon:         { type: 'string' },
                description:  { type: 'string' },
                sortOrder:    { type: 'number' },
              },
            },
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                id:           { type: 'string' },
                itemNumber:   { type: 'number' },
                catalogueId:  { type: 'string' },
                parentId:     { type: 'string' },
                name:         { type: 'string' },
                status:       { type: 'string' },
                notes:        { type: 'string' },
                manufacturer: { type: 'string' },
                model:        { type: 'string' },
                type:         { type: 'string' },
                condition:    { type: 'string' },
                colour:       { type: 'string' },
                barcode:      { type: 'string' },
                canContain:   { type: 'boolean' },
                spec:         { type: 'object' },
              },
            },
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, any>;

  try {
    switch (name) {
      case 'list_catalogues': {
        const rows = await db.select().from(catalogue).orderBy(catalogue.sortOrder, catalogue.name);
        return text(rows);
      }

      case 'list_containers': {
        let q = db.select().from(item).where(eq(item.canContain, true)).$dynamic();
        if (a.parentId) {
          q = q.where(eq(item.parentId, a.parentId));
        } else if (a.parentId === null || a.parentId === undefined) {
          // no filter — return all containers
        }
        const rows = await q.orderBy(item.itemNumber);
        return text(rows);
      }

      case 'get_item': {
        if (!a.id && a.itemNumber == null) throw new Error('Provide id or itemNumber');
        const rows = a.id
          ? await db.select().from(item).where(eq(item.id, a.id)).limit(1)
          : await db.select().from(item).where(eq(item.itemNumber, a.itemNumber)).limit(1);
        if (!rows[0]) throw new Error('Item not found');
        return text(rows[0]);
      }

      case 'search_items': {
        const q = `%${a.query}%`;
        const numericVal = /^\d+$/.test(a.query) ? parseInt(a.query, 10) : null;
        let query = db.select().from(item).where(
          or(
            ilike(item.name,         q),
            ilike(item.manufacturer, q),
            ilike(item.model,        q),
            ilike(item.type,         q),
            ilike(item.notes,        q),
            ilike(item.barcode,      q),
            sql`CAST(${item.itemNumber} AS TEXT) ILIKE ${q}`,
            sql`CAST(${item.spec} AS TEXT) ILIKE ${q}`,
            ...(numericVal !== null ? [eq(item.itemNumber, numericVal)] : []),
          )
        ).$dynamic();
        if (a.catalogueId) query = query.where(eq(item.catalogueId, a.catalogueId));
        const rows = await query.orderBy(item.itemNumber);
        return text(rows);
      }

      case 'add_catalogue': {
        const { id: _id, ...rest } = a;
        const values: any = { ...rest };
        if (_id) values.id = _id;
        const rows = await db.insert(catalogue).values(values).returning();
        return text(rows[0]);
      }

      case 'add_item': {
        const { id: _id, ...rest } = a;
        const values: any = { ...rest };
        if (_id) values.id = _id;
        const rows = await db.insert(item).values(values).returning();
        return text(rows[0]);
      }

      case 'update_item': {
        const { id, ...rest } = a;
        const rows = await db.update(item)
          .set({ ...rest, lastModified: new Date().toISOString() })
          .where(eq(item.id, id))
          .returning();
        if (!rows[0]) throw new Error('Item not found');
        return text(rows[0]);
      }

      case 'update_catalogue': {
        const { id, ...rest } = a;
        const rows = await db.update(catalogue)
          .set({ ...rest, lastModified: new Date().toISOString() })
          .where(eq(catalogue.id, id))
          .returning();
        if (!rows[0]) throw new Error('Catalogue not found');
        return text(rows[0]);
      }

      case 'delete_catalogue': {
        const now = new Date().toISOString();
        const its = await db.select({ id: item.id }).from(item).where(eq(item.catalogueId, a.id));
        for (const i of its) {
          await db.insert(syncTombstone).values({ id: randomUUID(), entityType: 'item', entityId: i.id, deletedAt: now, deviceId: 'mcp' }).onConflictDoNothing();
          await db.delete(item).where(eq(item.id, i.id));
        }
        await db.insert(syncTombstone).values({ id: randomUUID(), entityType: 'catalogue', entityId: a.id, deletedAt: now, deviceId: 'mcp' }).onConflictDoNothing();
        await db.delete(catalogue).where(eq(catalogue.id, a.id));
        return text({ ok: true });
      }

      case 'delete_item': {
        await db.insert(syncTombstone).values({ id: randomUUID(), entityType: 'item', entityId: a.id, deletedAt: new Date().toISOString(), deviceId: 'mcp' }).onConflictDoNothing();
        await db.delete(item).where(eq(item.id, a.id));
        return text({ ok: true });
      }

      case 'bulk_import': {
        const cats: any[]  = a.catalogues ?? [];
        const items: any[] = a.items ?? [];

        if (a.clearFirst) {
          await db.delete(item);
          await db.delete(catalogue);
        }

        // Insert catalogues
        let catCount = 0;
        for (const cat of cats) {
          const { id: _id, ...rest } = cat;
          const values: any = { ...rest };
          if (_id) values.id = _id;
          await db.insert(catalogue).values(values)
            .onConflictDoUpdate({ target: catalogue.id, set: rest });
          catCount++;
        }

        // Sort items topologically (parents before children)
        const sorted = topologicalSort(items);

        let itemCount = 0;
        for (const it of sorted) {
          const { id: _id, ...rest } = it;
          const values: any = { ...rest };
          if (_id) values.id = _id;
          await db.insert(item).values(values)
            .onConflictDoUpdate({ target: item.id, set: rest });
          itemCount++;
        }

        return text({ ok: true, catalogues: catCount, items: itemCount });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
  }
});

function topologicalSort(items: any[]): any[] {
  const map = new Map(items.map(i => [i.id, i]));
  const visited = new Set<string>();
  const result: any[] = [];

  function visit(it: any) {
    if (!it.id || visited.has(it.id)) return;
    if (it.parentId && map.has(it.parentId)) visit(map.get(it.parentId));
    visited.add(it.id);
    result.push(it);
  }

  for (const it of items) visit(it);
  // Items without an id (shouldn't happen but be safe)
  for (const it of items) if (!it.id) result.push(it);

  return result;
}

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
