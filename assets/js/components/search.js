/**
 * WP REST API Playground — Sidebar search/filter.
 */

import { state } from './state';
import { prettifyRoute } from './utils';
import { renderSidebar } from './render/sidebar';

export const onSearch = (e) => {
	const query = /** @type {HTMLInputElement} */ (e.target).value.toLowerCase().trim();

	if (!query) {
		state.filteredRoutes = state.routes;
		renderSidebar(state.routes);
		return;
	}

	/** @type {typeof state.routes} */
	const filtered = {};
	Object.entries(state.routes).forEach(([category, endpoints]) => {
		const matches = endpoints.filter(
			(ep) =>
				prettifyRoute(ep.route).toLowerCase().includes(query) ||
				ep.route.toLowerCase().includes(query) ||
				category.toLowerCase().includes(query),
		);
		if (matches.length > 0) {
			filtered[category] = matches;
			state.expandedCategories.add(category);
		}
	});

	state.filteredRoutes = filtered;
	renderSidebar(filtered);
};
