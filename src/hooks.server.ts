// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import { createIdentityHandle, readIdentityEnv } from '$lib/server/identity';

// Resolve once at module load — env doesn't change between requests, and
// the result of readIdentityEnv is a tiny config object.
const identityEnv = readIdentityEnv(process.env);

export const handle = createIdentityHandle({ db, env: identityEnv });
