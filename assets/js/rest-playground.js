/**
 * WP REST API Playground — Entry point.
 *
 * Compiled by 10up-toolkit.  Source: assets/js/rest-playground.js
 */

import '../css/rest-playground.css';

import { state } from './components/state';
import { loadAuth, authSummary } from './components/auth';
import { initLayout } from './components/layout';
import { renderSidebar } from './components/render/sidebar';
import { onSendRequest, onGetCode } from './components/api';
import { onSearch } from './components/search';
import {
	initRequestTabs,
	refreshTabBadges,
	selectRequestTab,
} from './components/render/requestTabs';
import { setAuthChangeHandler } from './components/render/authPanel';
import { setHeadersChangeHandler } from './components/render/headersPanel';

/**
 * Refresh the sidebar credential chip from the active profile.
 */
const updateAuthChip = () => {
	const statusEl = document.getElementById('auth-status');
	const chip = document.getElementById('auth-chip');
	const { label, isActive } = authSummary();

	if (statusEl) statusEl.textContent = label;
	if (chip) chip.classList.toggle('is-authenticated', isActive);
};

const init = async () => {
	// Must not wait on the routes fetch below — the panels are visible immediately.
	initLayout();

	loadAuth();

	// Both panels report back here so the chip and the tab badges stay in step
	// with whatever the user last typed.
	setAuthChangeHandler(() => {
		updateAuthChip();
		refreshTabBadges();
	});
	setHeadersChangeHandler(refreshTabBadges);

	initRequestTabs();
	updateAuthChip();

	// Warn when the site is not served over HTTPS. Credentials ride in an
	// Authorization header — base64 is not encryption, and a token or API key is
	// fully exposed on an unencrypted connection.
	if (!window.wpRestPlayground?.isHttps) {
		const banner = document.getElementById('https-warning');
		if (banner) banner.hidden = false;
	}

	// Wired before the routes request, not after: the chip is the only way into
	// the credential editor, and the endpoint list is not needed to set one up.
	// Binding these afterwards left the whole shell dead while the fetch was in
	// flight, and permanently dead on the early return below.
	document.getElementById('send-request')?.addEventListener('click', onSendRequest);
	document.getElementById('get-code')?.addEventListener('click', onGetCode);
	document.getElementById('endpoint-search')?.addEventListener('input', onSearch);

	document.getElementById('auth-chip')?.addEventListener('click', () => {
		// Credentials are usually set up before picking an endpoint, but the tab
		// bar lives inside the endpoint panel. With nothing selected yet, show
		// that panel with its endpoint-specific chrome hidden so the Auth tab is
		// still reachable; renderEndpointPanel() restores the chrome later.
		if (!state.selectedEndpoint) {
			const welcome = document.getElementById('rest-playground-welcome');
			const panel = document.getElementById('rest-playground-endpoint');
			const header = panel?.querySelector('.rest-playground__endpoint-header');
			const sendBar = panel?.querySelector('.rest-playground__send-bar');
			if (welcome) welcome.hidden = true;
			if (panel) panel.hidden = false;
			if (header) header.hidden = true;
			if (sendBar) sendBar.hidden = true;
			document.getElementById('tab-btn-params')?.setAttribute('hidden', '');
		}

		selectRequestTab('auth');
		document.getElementById('tab-btn-auth')?.focus();
	});

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
};

document.addEventListener('DOMContentLoaded', init);
