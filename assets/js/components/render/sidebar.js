/**
 * WP REST API Playground — Sidebar (category + route list) renderer.
 */

import { state } from '../state';
import { escapeHtml, prettifyRoute } from '../utils';
import { renderEndpointPanel } from './form';

export const onCategoryToggle = (e) => {
	const btn = /** @type {HTMLElement} */ (e.currentTarget);
	const category = btn.dataset.category ?? '';
	const routesEl = btn.nextElementSibling;
	const isOpen = state.expandedCategories.has(category);

	if (isOpen) {
		state.expandedCategories.delete(category);
		btn.classList.remove('is-open');
		btn.setAttribute('aria-expanded', 'false');
		routesEl?.classList.remove('is-open');
		routesEl?.setAttribute('aria-hidden', 'true');
	} else {
		state.expandedCategories.add(category);
		btn.classList.add('is-open');
		btn.setAttribute('aria-expanded', 'true');
		routesEl?.classList.add('is-open');
		routesEl?.setAttribute('aria-hidden', 'false');
	}
};

export const onRouteSelect = (e) => {
	const btn = /** @type {HTMLElement} */ (e.currentTarget);
	const encoded = btn.dataset.endpoint ?? '';
	const endpoint = JSON.parse(decodeURIComponent(atob(encoded)));

	// Update active state in sidebar.
	document
		.querySelectorAll('.rest-playground__route-item')
		.forEach((el) => el.classList.remove('is-active'));
	btn.classList.add('is-active');

	state.selectedEndpoint = endpoint;
	state.selectedMethod = Object.keys(endpoint.methods)[0];

	renderEndpointPanel(endpoint, state.selectedMethod);
};

/**
 * Render all categories and their route items into #endpoint-nav.
 *
 * @param {typeof state.routes} routes - The routes map keyed by category name.
 */
export const renderSidebar = (routes) => {
	const nav = document.getElementById('endpoint-nav');
	if (!nav) return;

	const entries = Object.entries(routes);

	if (entries.length === 0) {
		nav.innerHTML =
			'<p style="padding:16px;color:var(--rest-playground-chrome-muted);font-size:13px;">No endpoints match your search.</p>';
		return;
	}

	const html = entries
		.map(([category, endpoints]) => {
			const isOpen = state.expandedCategories.has(category);
			const safeId = `cat-${category.replace(/\W+/g, '-').toLowerCase()}`;

			const routesHtml = endpoints
				.map((endpoint) => {
					const methods = Object.keys(endpoint.methods);
					const badges = methods
						.map(
							(m) =>
								`<span class="rest-playground__badge rest-playground__badge--${m.toLowerCase()}">${m}</span>`,
						)
						.join('');
					const path = prettifyRoute(endpoint.route);
					const isActive = state.selectedEndpoint?.route === endpoint.route;

					// Encode endpoint data as a base64 JSON string to avoid attribute escaping issues.
					const encoded = btoa(encodeURIComponent(JSON.stringify(endpoint)));

					return `
				<button
					class="rest-playground__route-item${isActive ? ' is-active' : ''}"
					data-endpoint="${escapeHtml(encoded)}"
					title="${escapeHtml(endpoint.route)}"
					type="button"
				>
					<span class="rest-playground__route-methods">${badges}</span>
					<span class="rest-playground__route-path">${escapeHtml(path)}</span>
				</button>
			`;
				})
				.join('');

			return `
			<div class="rest-playground__category" id="${safeId}">
				<button class="rest-playground__category-header${isOpen ? ' is-open' : ''}" data-category="${escapeHtml(category)}" type="button" aria-expanded="${isOpen}">
					<span class="rest-playground__category-name">${escapeHtml(category)}</span>
					<span class="rest-playground__category-count">${endpoints.length}</span>
					<svg class="rest-playground__category-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M4 6l4 4 4-4"/>
					</svg>
				</button>
				<div class="rest-playground__category-routes${isOpen ? ' is-open' : ''}" aria-hidden="${!isOpen}">
					${routesHtml}
				</div>
			</div>
		`;
		})
		.join('');

	nav.innerHTML = html;

	nav.querySelectorAll('.rest-playground__category-header').forEach((btn) => {
		btn.addEventListener('click', onCategoryToggle);
	});

	nav.querySelectorAll('.rest-playground__route-item').forEach((btn) => {
		btn.addEventListener('click', onRouteSelect);
	});
};
