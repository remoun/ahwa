// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'drizzle-kit';

const dataDir = process.env.AHWA_DATA_DIR ?? './data';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './src/lib/server/db/migrations',
	dialect: 'sqlite',
	dbCredentials: { url: `${dataDir}/ahwa.db` },
	verbose: true,
	strict: true
});
