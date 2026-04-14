// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params, url }) => {
	return {
		tableId: params.id,
		partyId: url.searchParams.get('party') ?? ''
	};
};
