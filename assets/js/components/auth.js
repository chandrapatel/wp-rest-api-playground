/**
 * WP REST API Playground — Authentication (Application Passwords).
 */

import { state } from './state';

export const setAuthFormVisible = (visible) => {
	const form = document.getElementById('auth-form');
	const toggle = document.getElementById('auth-toggle');
	if (!form || !toggle) return;
	form.hidden = !visible;
	toggle.setAttribute('aria-expanded', String(visible));
};

export const updateAuthStatus = () => {
	const statusEl = document.getElementById('auth-status');
	const toggle = document.getElementById('auth-toggle');
	const userEl = document.getElementById('auth-username');
	const passEl = document.getElementById('auth-password');

	if (userEl) userEl.value = state.auth.username;
	if (passEl) passEl.value = state.auth.password;

	const isAuth = !!(state.auth.username && state.auth.password);

	if (statusEl) {
		statusEl.textContent = isAuth
			? `Authenticated as ${state.auth.username}`
			: 'Authentication';
	}

	if (toggle) {
		toggle.classList.toggle('is-authenticated', isAuth);
	}
};

export const loadAuthFromStorage = () => {
	try {
		const stored = sessionStorage.getItem('wp-rest-playground-auth');
		if (stored) {
			const parsed = JSON.parse(stored);
			if (
				parsed &&
				typeof parsed.username === 'string' &&
				typeof parsed.password === 'string'
			) {
				state.auth = { username: parsed.username, password: parsed.password };
			} else {
				sessionStorage.removeItem('wp-rest-playground-auth');
			}
		}
	} catch {
		sessionStorage.removeItem('wp-rest-playground-auth');
	}
};

export const saveAuth = () => {
	const username = document.getElementById('auth-username')?.value.trim() ?? '';
	const password = document.getElementById('auth-password')?.value.trim() ?? '';
	state.auth = { username, password };
	try {
		sessionStorage.setItem('wp-rest-playground-auth', JSON.stringify(state.auth));
	} catch {
		// ignore — storage quota exceeded or blocked
	}
	updateAuthStatus();
	setAuthFormVisible(false);
};

export const clearAuth = () => {
	state.auth = { username: '', password: '' };
	sessionStorage.removeItem('wp-rest-playground-auth');
	const userEl = document.getElementById('auth-username');
	const passEl = document.getElementById('auth-password');
	if (userEl) userEl.value = '';
	if (passEl) passEl.value = '';
	updateAuthStatus();
};
