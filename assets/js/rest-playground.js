/**
 * WP REST API Playground — Entry point.
 *
 * Compiled by 10up-toolkit.  Source: assets/js/rest-playground.js
 */

import '../css/rest-playground.css';

import { state } from './components/state';
import { escapeHtml } from './components/utils';
import {
	loadAuthFromStorage,
	updateAuthStatus,
	saveAuth,
	clearAuth,
	setAuthFormVisible,
} from './components/auth';
import { renderSidebar } from './components/render/sidebar';
import { onSendRequest } from './components/api';
import { onSearch } from './components/search';

const init = async () => {
	loadAuthFromStorage();
	updateAuthStatus();

	// Fetch routes.
	const nav = document.getElementById('endpoint-nav');
	const routesUrl = window.wpRestPlayground?.routesUrl;

	if (!routesUrl) {
		if (nav) {
			nav.innerHTML =
				'<p style="padding:16px;color:var(--rest-playground-error);">Configuration error: routesUrl not set.</p>';
		}
		return;
	}

	try {
		const res = await fetch(routesUrl, {
			headers: { 'X-WP-Nonce': window.wpRestPlayground?.nonce ?? '' },
		});

		if (!res.ok) {
			throw new Error(`HTTP ${res.status} — ${res.statusText}`);
		}

		const data = await res.json();
		state.routes = data;
		state.filteredRoutes = data;

		const loading = document.getElementById('nav-loading');
		if (loading) loading.remove();

		renderSidebar(data);
	} catch (err) {
		if (nav) {
			nav.innerHTML = `<p style="padding:16px;color:var(--rest-playground-error);font-size:13px;">Failed to load endpoints: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
		}
	}

	// Global event listeners.
	document.getElementById('send-request')?.addEventListener('click', onSendRequest);
	document.getElementById('endpoint-search')?.addEventListener('input', onSearch);

	document.getElementById('auth-toggle')?.addEventListener('click', () => {
		const form = document.getElementById('auth-form');
		const isHidden = form?.hidden ?? true;
		setAuthFormVisible(isHidden);
	});

	document.getElementById('auth-save')?.addEventListener('click', saveAuth);
	document.getElementById('auth-clear')?.addEventListener('click', clearAuth);
};

document.addEventListener('DOMContentLoaded', init);
