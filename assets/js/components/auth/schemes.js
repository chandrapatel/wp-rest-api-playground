/**
 * WP REST API Playground — Authentication scheme registry.
 *
 * Every supported auth method is one entry in AUTH_SCHEMES. An entry is pure
 * data plus pure functions: `fields` drives form rendering, `apply()` says what
 * to merge into the outgoing request. Adding a method therefore means adding an
 * object literal here and nothing else — no branching in the request builder,
 * no bespoke markup, no new storage handling.
 */

/**
 * Base64-encode a string that may contain characters outside Latin-1.
 *
 * btoa() throws InvalidCharacterError above U+00FF, so a username or password
 * with an accented or non-Latin character would fail to encode. Encoding to
 * UTF-8 bytes first is what an HTTP Basic credential is meant to carry anyway.
 *
 * @param {string} value - Text to encode.
 * @returns {string} Base64 of the UTF-8 bytes.
 */
export const utf8Base64 = (value) => {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	// Built one char at a time rather than via spread: a long token would blow
	// the argument limit of String.fromCharCode on a single call.
	bytes.forEach((byte) => {
		binary += String.fromCharCode(byte);
	});
	return btoa(binary);
};

/**
 * Mask a secret for display, keeping a short tail so the user can tell two
 * saved credentials apart without revealing either.
 *
 * @param {string} value - The secret.
 * @returns {string}
 */
export const maskSecret = (value) => {
	if (!value) return '';
	if (value.length <= 4) return '•'.repeat(value.length);
	return `${'•'.repeat(Math.min(value.length - 4, 24))}${value.slice(-4)}`;
};

/**
 * @typedef {object} AuthField
 * @property {string}   key         - Config key this field reads and writes.
 * @property {string}   label       - Visible label.
 * @property {'text'|'secret'|'select'|'pairs'} type - Control to render.
 * @property {string}   [placeholder]
 * @property {string}   [help]      - Hint shown under the control.
 * @property {string}   [default]   - Value used when the config key is unset.
 * @property {Array<[string, string]>} [options] - [value, label] for `select`.
 * @property {(value: string) => string} [normalize] - Applied before use.
 */

/**
 * @typedef {object} AuthApplied
 * @property {Record<string,string>} [headers]       - Headers to merge in.
 * @property {Record<string,string>} [query]         - Query params to merge in.
 * @property {string[]}              [secretHeaders] - Header names to redact in code samples.
 * @property {string[]}              [secretQuery]   - Query keys to redact in code samples.
 */

/**
 * Application passwords are displayed by WordPress in space-separated groups of
 * four and users paste them exactly as shown. The spaces are presentational —
 * wp_authenticate_application_password() strips them server-side — so strip
 * them here too, otherwise the base64 payload carries characters the server
 * never expects.
 *
 * @param {string} value - Raw field value.
 * @returns {string}
 */
const stripSpaces = (value) => value.replace(/\s+/g, '');

/**
 * Build an HTTP Basic Authorization header value.
 *
 * @param {string} user - Username.
 * @param {string} pass - Password.
 * @returns {string}
 */
const basicHeader = (user, pass) => `Basic ${utf8Base64(`${user}:${pass}`)}`;

/**
 * Collect the enabled, named rows of a `pairs` field into a plain object.
 *
 * Later rows win on a duplicate name, matching how a headers list is normally
 * read. Rows with a blank name are ignored so an empty trailing row — which the
 * grid always keeps around for input — never emits a header.
 *
 * @param {Array<{enabled?: boolean, name?: string, value?: string}>} rows - Grid rows.
 * @returns {Record<string,string>}
 */
export const pairsToObject = (rows) => {
	/** @type {Record<string,string>} */
	const out = {};
	(Array.isArray(rows) ? rows : []).forEach((row) => {
		const name = (row?.name ?? '').trim();
		if (!name || row?.enabled === false) return;
		out[name] = row?.value ?? '';
	});
	return out;
};

/**
 * @typedef {object} AuthScheme
 * @property {string}     label  - Name shown in the type dropdown.
 * @property {string}     help   - One-line explanation under the dropdown.
 * @property {AuthField[]} fields - Controls the Auth tab renders.
 * @property {(config: Record<string,any>) => (string|null)} [validate] - Message when incomplete.
 * @property {(config: Record<string,any>) => string} summary - Short label for the sidebar chip.
 * @property {(config: Record<string,any>) => AuthApplied} apply - What to merge into the request.
 */

/** @type {Record<string, AuthScheme>} */
export const AUTH_SCHEMES = {
	// Deliberately not called "No Auth": the request is still authenticated, just
	// by the browser's existing login rather than by a credential entered here.
	none: {
		label: 'Logged-in User (cookie + nonce)',
		help: 'Attaches no credential of its own — the request carries your WordPress login cookie and REST nonce, so it runs as the account you are signed in with right now. This is not an anonymous request.',
		fields: [],
		summary: () => 'Logged-in user',
		apply: () => ({}),
	},

	'app-password': {
		label: 'WordPress Application Password',
		help: 'Generate one under Users → Profile → Application Passwords. Sent as an HTTP Basic credential.',
		fields: [
			{
				key: 'username',
				label: 'Username',
				type: 'text',
				placeholder: 'admin',
			},
			{
				key: 'password',
				label: 'Application Password',
				type: 'secret',
				placeholder: 'xxxx xxxx xxxx xxxx xxxx xxxx',
				help: 'Spaces are optional — they are stripped before sending.',
				normalize: stripSpaces,
			},
		],
		validate: (config) =>
			config.username && config.password
				? null
				: 'Enter both a username and an application password.',
		summary: (config) => config.username || 'Application password',
		apply: (config) => ({
			headers: {
				Authorization: basicHeader(
					config.username ?? '',
					stripSpaces(config.password ?? ''),
				),
			},
			secretHeaders: ['Authorization'],
		}),
	},

	basic: {
		label: 'Basic Auth',
		help: 'A raw HTTP Basic credential. Unlike an application password the value is sent exactly as typed.',
		fields: [
			{ key: 'username', label: 'Username', type: 'text' },
			{ key: 'password', label: 'Password', type: 'secret' },
		],
		validate: (config) =>
			config.username || config.password ? null : 'Enter a username or a password.',
		summary: (config) => config.username || 'Basic auth',
		apply: (config) => ({
			headers: { Authorization: basicHeader(config.username ?? '', config.password ?? '') },
			secretHeaders: ['Authorization'],
		}),
	},

	bearer: {
		label: 'Bearer Token',
		help: 'Sent as an Authorization header. Used by JWT plugins and most token-based APIs.',
		fields: [
			// Single-line on purpose. A header value cannot contain a line break
			// — buildRequest() rejects one — so a textarea only invites input the
			// request would refuse, and a masked textarea depends on
			// -webkit-text-security, which not every engine honours. A password
			// input is masked natively everywhere.
			{ key: 'token', label: 'Token', type: 'secret' },
			{
				key: 'prefix',
				label: 'Prefix',
				type: 'text',
				default: 'Bearer',
				help: 'The scheme word placed before the token.',
			},
		],
		validate: (config) => (config.token?.trim() ? null : 'Enter a token.'),
		summary: () => 'Bearer token',
		// Trimmed because tokens are almost always pasted, and a copied JWT
		// tends to bring a trailing newline with it — which would otherwise be
		// rejected as a line break in a header value.
		apply: (config) => ({
			headers: {
				Authorization: `${(config.prefix ?? '').trim() || 'Bearer'} ${(config.token ?? '').trim()}`,
			},
			secretHeaders: ['Authorization'],
		}),
	},

	apikey: {
		label: 'API Key',
		help: 'A single named key sent either as a request header or as a query parameter.',
		fields: [
			{ key: 'name', label: 'Key', type: 'text', placeholder: 'X-API-Key' },
			{ key: 'value', label: 'Value', type: 'secret' },
			{
				key: 'location',
				label: 'Add to',
				type: 'select',
				default: 'header',
				options: [
					['header', 'Header'],
					['query', 'Query parameter'],
				],
			},
		],
		// The value matters as much as the name: a key profile with only a name
		// filled in would send an empty header while still suppressing the login
		// cookie, which reads as an unexplained authentication failure.
		validate: (config) => {
			if (!config.name?.trim()) return 'Enter a key name.';
			if (!config.value) return 'Enter a key value.';
			return null;
		},
		summary: (config) => config.name?.trim() || 'API key',
		apply: (config) => {
			const name = (config.name ?? '').trim();
			if (!name) return {};
			const value = config.value ?? '';
			return config.location === 'query'
				? { query: { [name]: value }, secretQuery: [name] }
				: { headers: { [name]: value }, secretHeaders: [name] };
		},
	},

	headers: {
		label: 'Custom Headers',
		help: 'For schemes this list does not cover — sign the request yourself and paste the resulting headers.',
		fields: [{ key: 'pairs', label: 'Headers', type: 'pairs' }],
		validate: (config) =>
			Object.keys(pairsToObject(config.pairs)).length ? null : 'Add at least one header.',
		summary: (config) => {
			const count = Object.keys(pairsToObject(config.pairs)).length;
			return count === 1 ? '1 custom header' : `${count} custom headers`;
		},
		apply: (config) => {
			const headers = pairsToObject(config.pairs);
			return { headers, secretHeaders: Object.keys(headers) };
		},
	},
};

/**
 * Scheme id used for a profile whose type is missing or unrecognised. Falling
 * back to the cookie scheme adds no credential of its own, so a corrupt profile
 * can never cause one to be sent somewhere unintended.
 */
export const DEFAULT_SCHEME = 'none';

/**
 * Whether an id names a real scheme.
 *
 * Uses an own-property check rather than `in`, which also answers true for
 * inherited names — `constructor`, `toString` and friends. A stored profile
 * typed `constructor` would otherwise pass validation and then resolve to
 * Object's constructor, whose missing `fields` throws partway through
 * hydration.
 *
 * @param {unknown} type - Candidate scheme id.
 * @returns {boolean}
 */
export const hasScheme = (type) =>
	typeof type === 'string' && Object.prototype.hasOwnProperty.call(AUTH_SCHEMES, type);

/**
 * Look up a scheme, falling back to the cookie scheme for an unknown id.
 *
 * @param {string} type - Scheme id.
 * @returns {AuthScheme}
 */
export const getScheme = (type) =>
	hasScheme(type) ? AUTH_SCHEMES[type] : AUTH_SCHEMES[DEFAULT_SCHEME];

/**
 * Build the config a freshly created profile of this type starts with, so every
 * field the form renders has a defined value from the outset.
 *
 * @param {string} type - Scheme id.
 * @returns {Record<string, any>}
 */
export const defaultConfig = (type) => {
	/** @type {Record<string, any>} */
	const config = {};
	getScheme(type).fields.forEach((field) => {
		if (field.type === 'pairs') {
			config[field.key] = [];
		} else {
			config[field.key] = field.default ?? '';
		}
	});
	return config;
};
