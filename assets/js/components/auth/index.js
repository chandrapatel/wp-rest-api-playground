/**
 * WP REST API Playground — Credential profiles.
 *
 * Profiles live in sessionStorage, never localStorage and never the server:
 * a credential is a secret, so it should not outlive the tab that entered it.
 * (Layout preferences take the opposite view — see components/layout.js.)
 */

import { state } from '../state';
import { defaultConfig, getScheme, hasScheme, pairsToObject, DEFAULT_SCHEME } from './schemes';

const STORAGE_KEY = 'wp-rest-playground-auth-v2';

/** Pre-v2 key: a bare { username, password } application-password pair. */
const LEGACY_STORAGE_KEY = 'wp-rest-playground-auth';

/**
 * Mint an id for a new profile.
 *
 * crypto.randomUUID() is unavailable outside secure contexts, which this plugin
 * explicitly supports — it warns about plain HTTP rather than refusing to run —
 * so fall back to a counter-plus-random id. Ids only have to be unique within
 * one sessionStorage entry, not globally.
 *
 * @returns {string}
 */
let idCounter = 0;
const newId = () => {
	if (crypto?.randomUUID) return crypto.randomUUID();
	idCounter += 1;
	return `p${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
};

/**
 * Reduce a stored profile to only what its scheme declares.
 *
 * Unknown scheme ids and config keys the scheme does not define are dropped, so
 * a hand-edited or stale storage entry cannot introduce headers the UI never
 * showed the user.
 *
 * @param {unknown} raw - Candidate profile from storage.
 * @returns {{id: string, name: string, type: string, config: Record<string, any>}|null}
 */
const sanitizeProfile = (raw) => {
	if (!raw || typeof raw !== 'object') return null;

	if (!hasScheme(raw.type)) return null;
	const { type } = raw;

	const config = defaultConfig(type);

	getScheme(type).fields.forEach((field) => {
		const value = raw.config?.[field.key];
		if (field.type === 'pairs') {
			if (!Array.isArray(value)) return;
			config[field.key] = value
				.filter((row) => row && typeof row === 'object')
				.map((row) => ({
					enabled: row.enabled !== false,
					name: typeof row.name === 'string' ? row.name : '',
					value: typeof row.value === 'string' ? row.value : '',
				}));
		} else if (typeof value === 'string') {
			config[field.key] = value;
		}
	});

	return {
		id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
		name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled',
		type,
		config,
	};
};

/**
 * Move a pre-v2 application-password pair into a profile.
 *
 * One-way and silent — the old key is removed once converted, so this runs at
 * most once per session storage lifetime.
 *
 * @returns {{id: string, name: string, type: string, config: Record<string, any>}|null}
 */
const migrateLegacy = () => {
	let stored;
	try {
		stored = sessionStorage.getItem(LEGACY_STORAGE_KEY);
	} catch {
		return null;
	}
	if (!stored) return null;

	let profile = null;
	try {
		const parsed = JSON.parse(stored);
		if (parsed && typeof parsed.username === 'string' && typeof parsed.password === 'string') {
			profile = sanitizeProfile({
				id: newId(),
				name: 'Application Password',
				type: 'app-password',
				config: { username: parsed.username, password: parsed.password },
			});
		}
	} catch {
		// Unparseable legacy value — nothing to carry forward.
	}

	try {
		sessionStorage.removeItem(LEGACY_STORAGE_KEY);
	} catch {
		// Removal is best-effort; a surviving key just gets skipped next time
		// because a v2 entry will exist by then.
	}

	return profile;
};

/**
 * Persist the current profiles. Failures are ignored — storage can be full,
 * disabled, or blocked in private mode, and none of that should break a request
 * the user is in the middle of building.
 */
export const persistAuth = () => {
	try {
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				activeProfileId: state.auth.activeProfileId,
				sendWpCookie: state.auth.sendWpCookie,
				profiles: state.auth.profiles,
			}),
		);
	} catch {
		// ignore — storage quota exceeded or blocked
	}
};

/**
 * Hydrate state.auth from storage, migrating a pre-v2 entry if one is present.
 */
export const loadAuth = () => {
	/** @type {Array<{id: string, name: string, type: string, config: Record<string, any>}>} */
	let profiles = [];
	let activeProfileId = null;
	let sendWpCookie = false;

	try {
		const stored = sessionStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			// Each entry is guarded on its own: one unusable row must not cost
			// the user the rest of their profiles. A throw escaping here would
			// be caught below, which discards the whole store.
			profiles = (Array.isArray(parsed?.profiles) ? parsed.profiles : [])
				.map((raw) => {
					try {
						return sanitizeProfile(raw);
					} catch {
						return null;
					}
				})
				.filter(Boolean);
			activeProfileId =
				typeof parsed?.activeProfileId === 'string' ? parsed.activeProfileId : null;
			sendWpCookie = parsed?.sendWpCookie === true;
		}
	} catch {
		try {
			sessionStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
	}

	if (!profiles.length) {
		const migrated = migrateLegacy();
		if (migrated) {
			profiles = [migrated];
			activeProfileId = migrated.id;
		}
	}

	// Always offer the cookie-based profile so there is something to fall back to
	// when the last credential is deleted.
	if (!profiles.some((profile) => profile.type === 'none')) {
		profiles.unshift({
			id: newId(),
			name: 'Logged-in User',
			type: 'none',
			config: defaultConfig('none'),
		});
	}

	// A dangling id from a deleted profile would leave the UI with no selection.
	if (!profiles.some((profile) => profile.id === activeProfileId)) {
		activeProfileId = profiles[0].id;
	}

	state.auth = { activeProfileId, profiles, sendWpCookie };

	// Write straight back. Hydration is not always a no-op: migrating the pre-v2
	// key removes it, and the fallback profile above may have just been created.
	// Without this the migrated credential exists only in memory — a reload
	// before the user happens to edit something would lose it from both keys.
	persistAuth();
};

/**
 * The profile currently selected, or null if state is somehow empty.
 *
 * @returns {{id: string, name: string, type: string, config: Record<string, any>}|null}
 */
export const getActiveProfile = () =>
	state.auth.profiles.find((profile) => profile.id === state.auth.activeProfileId) ?? null;

/**
 * Select a profile by id. Unknown ids are ignored rather than clearing the
 * selection.
 *
 * @param {string} id - Profile id.
 */
export const setActiveProfile = (id) => {
	if (!state.auth.profiles.some((profile) => profile.id === id)) return;
	state.auth.activeProfileId = id;
	persistAuth();
};

/**
 * Add a profile and make it active.
 *
 * @param {string} type - Scheme id for the new profile.
 * @param {string} [name] - Display name; defaults to the scheme label.
 * @returns {{id: string, name: string, type: string, config: Record<string, any>}}
 */
export const createProfile = (type = DEFAULT_SCHEME, name = '') => {
	const profile = {
		id: newId(),
		name: name.trim() || getScheme(type).label,
		type,
		config: defaultConfig(type),
	};
	state.auth.profiles.push(profile);
	state.auth.activeProfileId = profile.id;
	persistAuth();
	return profile;
};

/**
 * Copy the active profile, including its credentials, and select the copy.
 *
 * @returns {{id: string, name: string, type: string, config: Record<string, any>}|null}
 */
export const duplicateProfile = () => {
	const active = getActiveProfile();
	if (!active) return null;
	const copy = {
		id: newId(),
		name: `${active.name} copy`,
		type: active.type,
		config: JSON.parse(JSON.stringify(active.config)),
	};
	state.auth.profiles.push(copy);
	state.auth.activeProfileId = copy.id;
	persistAuth();
	return copy;
};

/**
 * Rename the active profile. A blank name is rejected so the picker never shows
 * an empty row.
 *
 * @param {string} name - New display name.
 */
export const renameProfile = (name) => {
	const active = getActiveProfile();
	if (!active || !name.trim()) return;
	active.name = name.trim();
	persistAuth();
};

/**
 * Delete the active profile and select its neighbour.
 *
 * The last remaining profile is not deletable — an empty list would leave the
 * Auth tab with nothing to render and no way back.
 *
 * @returns {boolean} Whether a profile was removed.
 */
export const deleteProfile = () => {
	if (state.auth.profiles.length <= 1) return false;
	const index = state.auth.profiles.findIndex(
		(profile) => profile.id === state.auth.activeProfileId,
	);
	if (index === -1) return false;

	state.auth.profiles.splice(index, 1);
	const next = state.auth.profiles[Math.min(index, state.auth.profiles.length - 1)];
	state.auth.activeProfileId = next.id;
	persistAuth();
	return true;
};

/**
 * Change the active profile's scheme, resetting its config to that scheme's
 * defaults — the old config's keys are meaningless to the new scheme.
 *
 * @param {string} type - Scheme id.
 */
export const setActiveType = (type) => {
	const active = getActiveProfile();
	if (!active || !hasScheme(type)) return;
	active.type = type;
	active.config = defaultConfig(type);
	persistAuth();
};

/**
 * Write one config key on the active profile.
 *
 * @param {string} key   - Config key declared by the profile's scheme.
 * @param {any}    value - New value.
 */
export const updateActiveConfig = (key, value) => {
	const active = getActiveProfile();
	if (!active) return;
	active.config[key] = value;
	persistAuth();
};

/**
 * Whether the request should carry the browser's WordPress login cookie.
 *
 * This is the crux of testing a credential. wp_validate_auth_cookie() runs on
 * `determine_current_user` at priority 10 and wp_validate_application_password()
 * at priority 20, where it returns early if a user was already resolved — so a
 * logged-in admin's cookie silently beats any Authorization header. Sending a
 * credential therefore means *not* sending the cookie, unless the user asks for
 * both explicitly.
 *
 * @returns {boolean}
 */
export const hasCustomAuthorizationHeader = () =>
	Object.keys(pairsToObject(state.customHeaders)).some(
		(name) => name.toLowerCase() === 'authorization',
	);

export const shouldSendWpCookie = () => {
	// An Authorization header typed into the Headers tab is a credential just as
	// much as one the Auth tab produced, and it loses to the cookie in exactly
	// the same way. Treating only the profile as "a credential is present" left
	// the default profile sending cookie, nonce and header together — the very
	// conflict this is meant to avoid.
	const active = getActiveProfile();
	const suppliesCredential =
		(!!active && active.type !== 'none') || hasCustomAuthorizationHeader();

	if (!suppliesCredential) return true;
	return state.auth.sendWpCookie === true;
};

/**
 * Set the cookie override and persist it.
 *
 * @param {boolean} value - Whether to also send the cookie and nonce.
 */
export const setSendWpCookie = (value) => {
	state.auth.sendWpCookie = value === true;
	persistAuth();
};

/**
 * Resolve the active profile into headers and query params to merge into the
 * request.
 *
 * @returns {import('./schemes').AuthApplied}
 */
export const applyAuth = () => {
	const active = getActiveProfile();
	if (!active) return {};
	return getScheme(active.type).apply(active.config) ?? {};
};

/**
 * Why the active profile cannot be used yet, or null when it is usable.
 *
 * Kept separate from applyAuth() so the caller decides what an incomplete
 * profile means: the panel previews it, the request builder refuses it. Without
 * that refusal an empty Bearer profile sends `Authorization: Bearer ` and a
 * half-filled application password sends `admin:` — both drop the login cookie
 * on the way out, so the user gets an unexplained 401 while the Auth tab is
 * quietly showing "Incomplete".
 *
 * @returns {string|null}
 */
export const validateActiveProfile = () => {
	const active = getActiveProfile();
	if (!active) return null;
	return getScheme(active.type).validate?.(active.config) ?? null;
};

/**
 * Short description of the active profile for the sidebar chip and tab badge.
 *
 * @returns {{label: string, isActive: boolean}}
 */
export const authSummary = () => {
	const active = getActiveProfile();
	if (!active) {
		return { label: 'Logged-in user', isActive: false };
	}
	// Not a credential the user supplied, so the chip stays neutral — but it is
	// still named, so a renamed profile reads correctly in the sidebar.
	if (active.type === 'none') {
		return { label: active.name, isActive: false };
	}
	const scheme = getScheme(active.type);
	const invalid = scheme.validate?.(active.config) ?? null;
	return { label: active.name, isActive: !invalid };
};
