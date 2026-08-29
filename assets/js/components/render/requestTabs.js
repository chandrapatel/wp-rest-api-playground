/**
 * WP REST API Playground — Request tab bar.
 *
 * Owns which of the four request panes is visible and keeps the count badges in
 * step with the form. Tab choice is per-session and deliberately not persisted:
 * it belongs with selectedEndpoint, which also resets on reload.
 */

import { state } from '../state';
import { extractPathParams } from '../utils';
import { authSummary } from '../auth';
import { renderAuthPanel } from './authPanel';
import { renderHeadersPanel } from './headersPanel';

/** Tab ids in display order. */
const TABS = ['params', 'body', 'auth', 'headers'];

/**
 * Whether the Body tab applies to the current method.
 *
 * @param {string|null} method - Selected HTTP method.
 * @returns {boolean}
 */
const hasBody = (method) => ['POST', 'PUT', 'PATCH'].includes(method ?? '');

/**
 * Count the parameters the Params tab is showing.
 *
 * @returns {number}
 */
const paramCount = () => {
	const endpoint = state.selectedEndpoint;
	const method = state.selectedMethod;
	if (!endpoint || !method) return 0;

	const pathParams = extractPathParams(endpoint.route);
	if (hasBody(method)) return pathParams.length;

	const args = endpoint.methods[method] ?? {};
	const queryArgs = Object.keys(args).filter((name) => !pathParams.includes(name));
	return pathParams.length + queryArgs.length;
};

/**
 * Count the enabled, named rows of the Headers tab.
 *
 * @returns {number}
 */
const headerCount = () =>
	state.customHeaders.filter((row) => row.enabled !== false && (row.name ?? '').trim()).length;

/**
 * Update the badge on each tab without touching the panes.
 */
export const refreshTabBadges = () => {
	const bar = document.getElementById('request-tabs');
	if (!bar) return;

	const setBadge = (tab, text, modifier = '') => {
		const badge = bar.querySelector(`[data-tab="${tab}"] .rest-playground__tab-badge`);
		if (!badge) return;
		badge.textContent = text;
		badge.hidden = !text;
		badge.className = `rest-playground__tab-badge${modifier ? ` rest-playground__tab-badge--${modifier}` : ''}`;
	};

	const params = paramCount();
	setBadge('params', params ? String(params) : '');

	const headers = headerCount();
	setBadge('headers', headers ? String(headers) : '');

	const auth = authSummary();
	setBadge('auth', auth.isActive ? '✓' : '', auth.isActive ? 'ok' : '');

	// The Body tab is meaningless for GET/DELETE — WordPress ignores a body on
	// those, so showing an empty pane would just invite confusion.
	const bodyTab = bar.querySelector('[data-tab="body"]');
	if (bodyTab) bodyTab.hidden = !hasBody(state.selectedMethod);
};

/**
 * Show one tab and hide the rest.
 *
 * @param {string} tab - Tab id.
 */
export const selectRequestTab = (tab) => {
	const target = TABS.includes(tab) ? tab : 'params';
	// Falling back rather than rendering a hidden pane: switching POST → GET
	// while Body is open would otherwise leave the panel blank.
	const resolved = target === 'body' && !hasBody(state.selectedMethod) ? 'params' : target;

	state.activeRequestTab = resolved;

	TABS.forEach((id) => {
		const button = document.querySelector(`#request-tabs [data-tab="${id}"]`);
		const pane = document.getElementById(`tab-pane-${id}`);
		const isActive = id === resolved;
		if (button) {
			button.classList.toggle('is-active', isActive);
			button.setAttribute('aria-selected', String(isActive));
			button.tabIndex = isActive ? 0 : -1;
		}
		if (pane) pane.hidden = !isActive;
	});

	if (resolved === 'auth') renderAuthPanel();
	if (resolved === 'headers') renderHeadersPanel();
};

/**
 * Wire the tab bar. Called once at boot.
 */
export const initRequestTabs = () => {
	const bar = document.getElementById('request-tabs');
	if (!bar) return;

	bar.addEventListener('click', (event) => {
		const button = /** @type {HTMLElement} */ (event.target).closest?.('[data-tab]');
		if (!button) return;
		selectRequestTab(/** @type {HTMLElement} */ (button).dataset.tab ?? 'params');
	});

	// Arrow-key navigation, per the ARIA tabs pattern. Hidden tabs are skipped so
	// Right from Params on a GET lands on Auth rather than the invisible Body tab.
	bar.addEventListener('keydown', (event) => {
		const { key } = /** @type {KeyboardEvent} */ (event);
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;

		const visible = /** @type {HTMLElement[]} */ (
			Array.from(bar.querySelectorAll('[data-tab]'))
		).filter((tab) => !tab.hidden);
		if (!visible.length) return;

		const current = visible.findIndex((tab) => tab.classList.contains('is-active'));
		let next = 0;
		if (key === 'Home') next = 0;
		else if (key === 'End') next = visible.length - 1;
		else if (key === 'ArrowLeft') next = (current - 1 + visible.length) % visible.length;
		else next = (current + 1) % visible.length;

		event.preventDefault();
		selectRequestTab(visible[next].dataset.tab ?? 'params');
		visible[next].focus();
	});

	refreshTabBadges();
};
