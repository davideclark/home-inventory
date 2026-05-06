import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL ?? 'postgresql://inventory:inventory_local@localhost:5432/home_inventory';
const client = postgres(url);
export const db = drizzle(client, { schema });
