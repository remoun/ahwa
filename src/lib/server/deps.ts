// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Shared shape every mutation handler takes. The DB and bus are
 * process singletons in production by necessity, but handlers depend
 * on the abstract types — a test passes its own DB + TableBus
 * instance, the route file passes the production singletons. The
 * type system stays decoupled even when runtime cardinality is fixed.
 *
 * Single import target for handler files: `import type { HandlerDeps }
 * from './deps'` rather than fanning out to db + table-bus.
 */
export type { DB } from './db';
export { TableBus } from './table-bus';
import type { DB } from './db';
import type { TableBus } from './table-bus';

export interface HandlerDeps {
	getDb: () => DB;
	bus: TableBus;
}
