// SPDX-License-Identifier: AGPL-3.0-or-later
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

const dataDir = process.env.AHWA_DATA_DIR ?? './data';
const dbPath = `${dataDir}/ahwa.db`;

const client = new Database(dbPath, { create: true });
client.exec('PRAGMA journal_mode=WAL');

export const db = drizzle(client, { schema });
