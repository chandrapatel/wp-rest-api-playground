/**
 * WP REST API Playground — Entry point.
 *
 * Compiled by 10up-toolkit.  Source: assets/js/rest-playground.js
 */

import '../css/rest-playground.css';

import { state } from './components/state';
import {
	loadAuthFromStorage,
	updateAuthStatus,
	saveAuth,
	clearAuth,
	setAuthFormVisible,
} from './components/auth';
import { renderSidebar } from './components/render/sidebar';
import { onSendRequest, onGetCode } from './components/api';
import { onSearch } from './components/search';

const init = async () => {
	loadAuthFromStorage();
	updateAuthStatus();

	// Warn when the site is not served over HTTPS. Application Password credentials
	// are sent as a base64-encoded Authorization header — base64 is not encryption
	// and the credentials are fully exposed on unencrypted connections.
	if (!window.wpRestPlayground?.isHttps) {
		const banner = document.getElementById('https-warning');
		if (banner) banner.hidden = false;
	}

	// Fetch routes.
	const nav = document.getElementById('endpoint-nav');
	const routesUrl = window.wpRestPlayground?.routesUrl;

	if (!routesUrl) {
		if (nav) {
			const p = document.createElement('p');
			p.style.cssText = 'padding:16px;color:var(--rest-playground-error);';
			p.textContent = 'Configuration error: routesUrl not set.';
			nav.appendChild(p);
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
		// eslint-disable-next-line no-console
		console.error('[REST Playground] Failed to load endpoints:', err);
		if (nav) {
			const p = document.createElement('p');
			p.style.cssText = 'padding:16px;color:var(--rest-playground-error);font-size:13px;';
			p.textContent =
				'Failed to load endpoints. Please refresh the page or check your connection.';
			nav.appendChild(p);
		}
	}

	// Global event listeners.
	document.getElementById('send-request')?.addEventListener('click', onSendRequest);
	document.getElementById('get-code')?.addEventListener('click', onGetCode);
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
