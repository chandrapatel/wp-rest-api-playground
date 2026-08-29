/**
 * WP REST API Playground — Auth tab.
 *
 * Renders whatever the active profile's scheme declares in `fields`, so this
 * module never needs to know which schemes exist.
 */

import { state } from '../state';
import { escapeHtml } from '../utils';
import { AUTH_SCHEMES, getScheme, maskSecret } from '../auth/schemes';
import {
	applyAuth,
	createProfile,
	deleteProfile,
	duplicateProfile,
	getActiveProfile,
	renameProfile,
	setActiveProfile,
	setActiveType,
	setSendWpCookie,
	shouldSendWpCookie,
	updateActiveConfig,
} from '../auth';
import { renderPairsGrid, bindPairsGrid } from './pairsGrid';

/** Whether secret values are currently shown in the clear. */
let revealSecrets = false;

/** Called after any change so the sidebar chip and tab badges can refresh. */
let onAuthChanged = () => {};

/**
 * Register the callback fired whenever the active credential changes.
 *
 * @param {() => void} callback - Invoked after every mutation.
 */
export const setAuthChangeHandler = (callback) => {
	onAuthChanged = callback;
};

const eyeIcon = () =>
	`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

const eyeOffIcon = () =>
	`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

/**
 * Build the control for one scheme field.
 *
 * @param {import('../auth/schemes').AuthField} field - Field descriptor.
 * @param {Record<string, any>} config - The active profile's config.
 * @returns {string}
 */
const renderAuthField = (field, config) => {
	const id = `auth-field-${escapeHtml(field.key)}`;
	const value = config[field.key] ?? field.default ?? '';
	const help = field.help
		? `<p class="rest-playground__field-desc">${escapeHtml(field.help)}</p>`
		: '';

	if (field.type === 'pairs') {
		return `
			<div class="rest-playground__field">
				<span class="rest-playground__field-name">${escapeHtml(field.label)}</span>
				${renderPairsGrid(value, 'auth-pairs')}
				${help}
			</div>
		`;
	}

	let control;

	if (field.type === 'select') {
		const options = (field.options ?? [])
			.map(
				([optValue, optLabel]) =>
					`<option value="${escapeHtml(optValue)}"${optValue === value ? ' selected' : ''}>${escapeHtml(optLabel)}</option>`,
			)
			.join('');
		control = `
			<select class="rest-playground__field-select" id="${id}" data-auth-key="${escapeHtml(field.key)}">
				${options}
			</select>
		`;
	} else if (field.type === 'secret') {
		const inputType = revealSecrets ? 'text' : 'password';
		const inner = field.multiline
			? `<textarea
					class="rest-playground__field-input rest-playground__field-textarea rest-playground__secret-input"
					id="${id}"
					data-auth-key="${escapeHtml(field.key)}"
					rows="3"
					spellcheck="false"
					autocomplete="off"
					placeholder="${escapeHtml(field.placeholder ?? '')}"
					${revealSecrets ? '' : 'data-masked="true"'}
				>${escapeHtml(value)}</textarea>`
			: `<input
					class="rest-playground__field-input rest-playground__secret-input"
					type="${inputType}"
					id="${id}"
					data-auth-key="${escapeHtml(field.key)}"
					value="${escapeHtml(value)}"
					spellcheck="false"
					autocomplete="off"
					placeholder="${escapeHtml(field.placeholder ?? '')}"
				>`;
		control = `
			<div class="rest-playground__secret-row">
				${inner}
				<button
					class="rest-playground__reveal-btn"
					type="button"
					data-auth-reveal="1"
					aria-pressed="${revealSecrets}"
					aria-label="${revealSecrets ? 'Hide secret values' : 'Show secret values'}"
					title="${revealSecrets ? 'Hide' : 'Show'}"
				>${revealSecrets ? eyeOffIcon() : eyeIcon()}</button>
			</div>
		`;
	} else {
		control = `
			<input
				class="rest-playground__field-input"
				type="text"
				id="${id}"
				data-auth-key="${escapeHtml(field.key)}"
				value="${escapeHtml(value)}"
				spellcheck="false"
				autocomplete="off"
				placeholder="${escapeHtml(field.placeholder ?? '')}"
			>
		`;
	}

	return `
		<div class="rest-playground__field">
			<div class="rest-playground__field-label-row">
				<label class="rest-playground__field-name" for="${id}">${escapeHtml(field.label)}</label>
			</div>
			${control}
			${help}
		</div>
	`;
};

/**
 * Show exactly what the active profile will attach to the request.
 *
 * Reading this from applyAuth() rather than re-deriving it means the preview
 * cannot drift from what is actually sent.
 *
 * @returns {string}
 */
const renderPreview = () => {
	const active = getActiveProfile();
	if (!active || active.type === 'none') {
		return `
			<div class="rest-playground__auth-preview">
				<span class="rest-playground__auth-preview-label">Will send</span>
				<code class="rest-playground__auth-preview-empty">Cookie + X-WP-Nonce (your current login)</code>
			</div>
		`;
	}

	const scheme = getScheme(active.type);
	const invalid = scheme.validate?.(active.config) ?? null;
	if (invalid) {
		return `
			<div class="rest-playground__auth-preview rest-playground__auth-preview--warn">
				<span class="rest-playground__auth-preview-label">Incomplete</span>
				<code class="rest-playground__auth-preview-empty">${escapeHtml(invalid)}</code>
			</div>
		`;
	}

	const { headers = {}, query = {} } = applyAuth();
	const lines = [
		...Object.entries(headers).map(
			([name, value]) =>
				`${escapeHtml(name)}: ${escapeHtml(revealSecrets ? value : maskSecret(value))}`,
		),
		...Object.entries(query).map(
			([name, value]) =>
				`?${escapeHtml(name)}=${escapeHtml(revealSecrets ? value : maskSecret(value))}`,
		),
	];

	if (!lines.length) {
		return `
			<div class="rest-playground__auth-preview">
				<span class="rest-playground__auth-preview-label">Will send</span>
				<code class="rest-playground__auth-preview-empty">Nothing — this profile adds no headers.</code>
			</div>
		`;
	}

	return `
		<div class="rest-playground__auth-preview">
			<span class="rest-playground__auth-preview-label">Will send</span>
			<div class="rest-playground__auth-preview-lines">
				${lines.map((line) => `<code>${line}</code>`).join('')}
			</div>
		</div>
	`;
};

/**
 * Swap just the preview block, leaving inputs and focus untouched.
 */
const refreshPreview = () => {
	const existing = document.querySelector('.rest-playground__auth-preview');
	if (!existing) return;
	const wrapper = document.createElement('div');
	wrapper.innerHTML = renderPreview();
	const replacement = wrapper.firstElementChild;
	if (replacement) existing.replaceWith(replacement);
};

/**
 * Attach listeners to the controls the last render produced.
 *
 * The re-render is passed in rather than imported: this module's own renderer
 * calls straight back into here, and threading it through the parameter keeps
 * that from becoming a forward reference between two consts.
 *
 * @param {() => void} rerender - Re-renders and rebinds the whole panel.
 */
const bindAuthPanel = (rerender) => {
	const pane = document.getElementById('tab-pane-auth');
	if (!pane) return;

	/** Re-render and notify the shell that the credential summary changed. */
	const refresh = () => {
		rerender();
		onAuthChanged();
	};

	document.getElementById('auth-profile-select')?.addEventListener('change', (event) => {
		setActiveProfile(/** @type {HTMLSelectElement} */ (event.target).value);
		refresh();
	});

	document.getElementById('auth-type-select')?.addEventListener('change', (event) => {
		setActiveType(/** @type {HTMLSelectElement} */ (event.target).value);
		refresh();
	});

	document.getElementById('auth-profile-new')?.addEventListener('click', () => {
		createProfile('app-password');
		refresh();
	});

	document.getElementById('auth-profile-duplicate')?.addEventListener('click', () => {
		duplicateProfile();
		refresh();
	});

	document.getElementById('auth-profile-rename')?.addEventListener('click', () => {
		const active = getActiveProfile();
		if (!active) return;
		// eslint-disable-next-line no-alert
		const name = window.prompt('Profile name', active.name);
		if (name === null) return;
		renameProfile(name);
		refresh();
	});

	document.getElementById('auth-profile-delete')?.addEventListener('click', () => {
		const active = getActiveProfile();
		if (!active) return;
		// eslint-disable-next-line no-alert
		if (!window.confirm(`Delete the profile “${active.name}”? Its credentials are lost.`))
			return;
		deleteProfile();
		refresh();
	});

	document.getElementById('auth-send-cookie')?.addEventListener('change', (event) => {
		setSendWpCookie(/** @type {HTMLInputElement} */ (event.target).checked);
		onAuthChanged();
	});

	// Field edits write straight through to storage. The preview has to follow
	// each keystroke, so it is patched in place rather than re-rendering the
	// panel — a full re-render would drop the caret out of the field.
	pane.querySelectorAll('[data-auth-key]').forEach((input) => {
		const handler = (event) => {
			const { target } = /** @type {{target: HTMLInputElement}} */ (event);
			updateActiveConfig(target.dataset.authKey ?? '', target.value);
			refreshPreview();
			onAuthChanged();
		};
		input.addEventListener('input', handler);
		input.addEventListener('change', handler);
	});

	pane.querySelectorAll('[data-auth-reveal]').forEach((button) => {
		button.addEventListener('click', () => {
			revealSecrets = !revealSecrets;
			rerender();
		});
	});

	const pairsField = getScheme(getActiveProfile()?.type ?? 'none').fields.find(
		(field) => field.type === 'pairs',
	);
	if (pairsField && pane.querySelector('.rest-playground__pairs')) {
		bindPairsGrid(
			pane,
			(rows) => {
				updateActiveConfig(pairsField.key, rows);
				refreshPreview();
				onAuthChanged();
			},
			rerender,
		);
	}
};

/**
 * Render the Auth tab into its pane and wire every control.
 */
export const renderAuthPanel = () => {
	const pane = document.getElementById('tab-pane-auth');
	if (!pane) return;

	const active = getActiveProfile();
	if (!active) {
		pane.innerHTML = '';
		return;
	}

	const scheme = getScheme(active.type);
	const cookieOn = shouldSendWpCookie();
	const cookieForced = active.type === 'none';

	const profileOptions = state.auth.profiles
		.map(
			(profile) =>
				`<option value="${escapeHtml(profile.id)}"${profile.id === active.id ? ' selected' : ''}>${escapeHtml(profile.name)}</option>`,
		)
		.join('');

	const typeOptions = Object.entries(AUTH_SCHEMES)
		.map(
			([id, entry]) =>
				`<option value="${escapeHtml(id)}"${id === active.type ? ' selected' : ''}>${escapeHtml(entry.label)}</option>`,
		)
		.join('');

	pane.innerHTML = `
		<div class="rest-playground__auth-panel">

			<div class="rest-playground__auth-intro">
				<p>
					A <strong>profile</strong> is one saved set of credentials — say an admin
					application password and a subscriber one. The profile selected below is the
					one every request uses. Choose <strong>New</strong> to add another, or
					<strong>Duplicate</strong> to copy this one and change a single field.
				</p>
				<p>
					There is no Save button: edits are kept as you type.
				</p>
				<p class="rest-playground__auth-intro-note">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<circle cx="12" cy="12" r="10"/>
						<path d="M12 16v-4M12 8h.01"/>
					</svg>
					<span>
						Profiles live in this browser tab only. Closing it clears them, and they are
						never written to the database or shared with anyone else on the site.
					</span>
				</p>
			</div>

			<div class="rest-playground__auth-bar">
				<label class="rest-playground__auth-bar-label" for="auth-profile-select">Profile</label>
				<select class="rest-playground__field-select rest-playground__auth-select" id="auth-profile-select">
					${profileOptions}
				</select>
				<div class="rest-playground__auth-bar-actions">
					<button class="rest-playground__btn rest-playground__btn--ghost" type="button" id="auth-profile-new">New</button>
					<button class="rest-playground__btn rest-playground__btn--ghost" type="button" id="auth-profile-rename">Rename</button>
					<button class="rest-playground__btn rest-playground__btn--ghost" type="button" id="auth-profile-duplicate">Duplicate</button>
					<button
						class="rest-playground__btn rest-playground__btn--ghost rest-playground__btn--danger"
						type="button"
						id="auth-profile-delete"
						${state.auth.profiles.length <= 1 ? 'disabled title="The last profile cannot be deleted."' : ''}
					>Delete</button>
				</div>
			</div>

			<div class="rest-playground__field">
				<div class="rest-playground__field-label-row">
					<label class="rest-playground__field-name" for="auth-type-select">Type</label>
				</div>
				<select class="rest-playground__field-select rest-playground__auth-select" id="auth-type-select">
					${typeOptions}
				</select>
				<p class="rest-playground__field-desc">${escapeHtml(scheme.help)}</p>
			</div>

			<div class="rest-playground__auth-fields" id="auth-fields">
				${scheme.fields.map((field) => renderAuthField(field, active.config)).join('')}
			</div>

			${renderPreview()}

			<div class="rest-playground__auth-cookie">
				<div class="rest-playground__checkbox-row">
					<input
						class="rest-playground__checkbox"
						type="checkbox"
						id="auth-send-cookie"
						${cookieOn ? 'checked' : ''}
						${cookieForced ? 'disabled' : ''}
					>
					<label class="rest-playground__field-name" for="auth-send-cookie">
						Also send WordPress cookie + nonce
					</label>
				</div>
				<p class="rest-playground__field-desc">
					${
						cookieForced
							? 'This profile authenticates purely by your login cookie, so it is always sent.'
							: 'Leave this off to authenticate as the credential above. WordPress resolves the login cookie before the Authorization header, so with both present your own account wins and the credential is ignored.'
					}
				</p>
			</div>

		</div>
	`;

	bindAuthPanel(renderAuthPanel);
};
