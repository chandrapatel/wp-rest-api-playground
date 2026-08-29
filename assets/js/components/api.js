/**
 * WP REST API Playground — Request builder and executor.
 */

import { state } from './state';
import { encodePathParam, hasTraversalSegment, substitutePathParams } from './utils';
import { applyAuth, shouldSendWpCookie, validateActiveProfile } from './auth';
import { pairsToObject } from './auth/schemes';
import {
	showResponseLoading,
	renderResponse,
	renderResponseError,
	renderCodeOnly,
} from './render/response';

/**
 * Raised when the form cannot be turned into a request. Separates a problem the
 * user can see and fix in the form from a transport failure, whose cause is not
 * visible to us and so only ever gets a generic message.
 */
export class RequestBuildError extends Error {
	/**
	 * Build the error with the text to surface in the response panel.
	 *
	 * @param {string} message - Text shown in the response panel.
	 */
	constructor(message) {
		super(message);
		this.name = 'RequestBuildError';
	}
}

/**
 * Header names are RFC 7230 tokens. A name outside that set, or a value
 * carrying a CR or LF, makes fetch() throw a bare TypeError that reaches the
 * user as the generic "Request failed" — so both are checked here, where the
 * message can name the offending header.
 */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Header names whose value is treated as a credential in generated snippets.
 *
 * Matched on whole hyphen-separated words, so `X-Api-Key` and `X-Auth-Token`
 * are caught while `X-Monkey` is not. Deliberately errs toward redacting: a
 * needlessly masked debug header is a small annoyance, a leaked token pasted
 * into a ticket is not. Names the user has not spelled recognisably are still
 * missed, which is why the Code tab keeps its explicit reveal control.
 */
const CREDENTIAL_HEADER_PATTERN =
	/(^|-)(authorization|auth|token|secret|password|key|cookie|credential)(-|$)/i;

/**
 * Header names the Fetch spec forbids a page from setting.
 *
 * The browser drops these silently, so accepting one would leave the preview
 * and the Code tab claiming a header that never leaves. `Cookie` is the one
 * users reach for most — session auth belongs to the Auth tab, which sends the
 * real cookie via `credentials`.
 */
const FORBIDDEN_HEADERS = new Set([
	'accept-charset',
	'accept-encoding',
	'access-control-request-headers',
	'access-control-request-method',
	'connection',
	'content-length',
	'cookie',
	'cookie2',
	'date',
	'dnt',
	'expect',
	'host',
	'keep-alive',
	'origin',
	'permissions-policy',
	'referer',
	'set-cookie',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'via',
]);

/** `Proxy-` and `Sec-` prefixed names are forbidden as a class. */
const FORBIDDEN_HEADER_PREFIX = /^(proxy|sec)-/i;

/**
 * Method-override headers are forbidden only for certain values, so they are
 * checked against the value rather than rejected outright — `X-HTTP-Method-
 * Override: PATCH` is legitimate and widely used, while the CONNECT/TRACE/TRACK
 * forms are dropped by the browser.
 */
const METHOD_OVERRIDE_HEADERS = new Set([
	'x-http-method',
	'x-http-method-override',
	'x-method-override',
]);

/** Methods a page may not smuggle through an override header. */
const FORBIDDEN_OVERRIDE_METHODS = new Set(['connect', 'trace', 'track']);

/**
 * Merge headers into a target object, rejecting anything malformed.
 *
 * @param {Record<string,string>} target - Accumulating header map, mutated.
 * @param {Record<string,string>} source - Headers to add.
 * @throws {RequestBuildError} When a name or value is not sendable.
 */
const mergeHeaders = (target, source) => {
	Object.entries(source).forEach(([name, value]) => {
		if (!HEADER_NAME_PATTERN.test(name)) {
			throw new RequestBuildError(
				`"${name}" is not a valid header name — use only letters, digits and the characters !#$%&'*+-.^_\`|~ (no spaces or colons).`,
			);
		}
		if (/[\r\n]/.test(String(value))) {
			throw new RequestBuildError(
				`The value for "${name}" contains a line break, which cannot be sent in a header.`,
			);
		}

		const lowerName = name.toLowerCase();
		if (FORBIDDEN_HEADERS.has(lowerName) || FORBIDDEN_HEADER_PREFIX.test(lowerName)) {
			throw new RequestBuildError(
				lowerName === 'cookie'
					? 'Browsers do not let a page set the "Cookie" header. Use the Auth tab — the Logged-in User profile sends your session cookie with the request.'
					: `Browsers do not let a page set the "${name}" header; it would be dropped before the request was sent.`,
			);
		}

		if (METHOD_OVERRIDE_HEADERS.has(lowerName)) {
			const smuggled = String(value)
				.split(',')
				.map((part) => part.trim().toLowerCase())
				.find((part) => FORBIDDEN_OVERRIDE_METHODS.has(part));
			if (smuggled) {
				throw new RequestBuildError(
					`Browsers reject "${name}" when it names ${smuggled.toUpperCase()}; the header would be dropped before the request was sent.`,
				);
			}
		}

		// Header names are case-insensitive, but object keys are not. Left alone,
		// "content-type" and "Content-Type" both survive into the init object and
		// fetch's Headers *appends* on the collision — the request would go out
		// with "application/json, text/plain" rather than the override the user
		// asked for. Drop any prior spelling so the last one written wins.
		Object.keys(target).forEach((existing) => {
			if (existing !== name && existing.toLowerCase() === lowerName) {
				delete target[existing];
			}
		});

		target[name] = String(value);
	});
};

/**
 * Assemble the fetch URL and init options from the current form state.
 *
 * @returns {{ url: string, options: { method: string|null, headers: Record<string,string>, body: string|undefined, credentials: string }, meta: { secretHeaders: string[], secretQuery: string[] } }}
 */
export const buildRequest = () => {
	const endpoint = state.selectedEndpoint;
	const method = state.selectedMethod;

	// Build URL: substitute path params with their field values; params left
	// blank drop out of the path entirely, matching the old strip behaviour.
	const routePath = substitutePathParams(endpoint.route, (param) => {
		const input = /** @type {HTMLInputElement|null} */ (
			document.getElementById(`field-path-${param}`)
		);
		const val = input?.value?.trim() ?? '';
		if (hasTraversalSegment(val)) {
			throw new RequestBuildError(
				`The "${param}" path parameter cannot contain "." or ".." path segments — they would send the request to a different endpoint than the one shown.`,
			);
		}
		return val ? encodePathParam(val) : '';
	});

	const baseUrl = (window.wpRestPlayground?.restUrl ?? '').replace(/\/$/, '');
	let url = baseUrl + routePath;

	// Refuse before building rather than sending a half-formed credential. The
	// profile has already dropped the login cookie by this point, so proceeding
	// would produce a 401 whose cause is nowhere on screen.
	const invalidAuth = validateActiveProfile();
	if (invalidAuth) {
		throw new RequestBuildError(`Authentication is incomplete — ${invalidAuth}`);
	}

	// Headers, in precedence order: defaults, then the credential, then the
	// Headers tab — so an explicit entry there overrides either of the first two.
	const {
		headers: authHeaders = {},
		query: authQuery = {},
		secretHeaders = [],
		secretQuery = [],
	} = applyAuth();

	const useWpCookie = shouldSendWpCookie();

	/** @type {Record<string,string>} */
	const headers = { 'Content-Type': 'application/json' };

	// Sending the nonce and cookie alongside a credential would defeat the
	// credential: WordPress resolves the login cookie on `determine_current_user`
	// before it ever looks at the Authorization header.
	if (useWpCookie) {
		headers['X-WP-Nonce'] = window.wpRestPlayground?.nonce ?? '';
	}

	mergeHeaders(headers, authHeaders);
	mergeHeaders(headers, pairsToObject(state.customHeaders));

	// A row in the Headers tab can carry a credential just as readily as the
	// Auth tab can — overriding one the scheme set, or supplying one where the
	// profile sets none. Those names have to reach the Code tab as secrets too,
	// or the snippet prints a live token and does not even offer the control to
	// hide it.
	//
	// Derived from the merged headers rather than accumulated alongside them, so
	// the names always match what is actually being sent: an override changes the
	// spelling of a key, and listing both would be meaningless.
	const declaredSecrets = new Set(secretHeaders.map((name) => name.toLowerCase()));
	const finalSecretHeaders = Object.keys(headers).filter(
		(name) => declaredSecrets.has(name.toLowerCase()) || CREDENTIAL_HEADER_PATTERN.test(name),
	);

	const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method);
	let body;

	// Query params. An API key placed in the query string has to ride along on
	// every method, so the auth-supplied entries are applied even for POST/PUT.
	const params = new URLSearchParams();

	if (!isBodyMethod) {
		document
			.querySelectorAll('[data-context="query"]')
			.forEach((/** @type {HTMLInputElement} */ input) => {
				let val;
				if (input.type === 'checkbox') {
					val = input.checked ? '1' : '';
				} else {
					val = input.value.trim();
				}
				if (val) params.set(input.name, val);
			});
	}

	Object.entries(authQuery).forEach(([name, value]) => params.set(name, value));

	const qs = params.toString();
	if (qs) url += `?${qs}`;

	if (isBodyMethod) {
		// Determine whether we're in raw-JSON or form-field mode.
		const rawPane = document.getElementById('body-raw-pane');
		const rawTextarea = /** @type {HTMLTextAreaElement|null} */ (
			document.getElementById('raw-json-body')
		);
		const isRawMode = rawPane && !rawPane.hidden;

		if (isRawMode && rawTextarea?.value.trim()) {
			const raw = rawTextarea.value.trim();
			try {
				JSON.parse(raw); // validate before sending
			} catch {
				throw new RequestBuildError(
					'Invalid JSON in request body — please check your syntax.',
				);
			}
			body = raw;
		} else {
			// Collect form fields.
			const bodyData = /** @type {Record<string, unknown>} */ ({});
			document
				.querySelectorAll('[data-context="body"]')
				.forEach((/** @type {HTMLInputElement} */ input) => {
					if (input.id === 'raw-json-body') return;
					const fieldType = input.dataset.type ?? 'string';
					const raw = input.type === 'checkbox' ? input.checked : input.value.trim();
					if (raw === '' || raw === false) return;

					try {
						if (fieldType === 'array' || fieldType === 'object') {
							bodyData[input.name] = JSON.parse(String(raw));
						} else if (fieldType === 'integer') {
							bodyData[input.name] = parseInt(String(raw), 10);
						} else if (fieldType === 'number') {
							bodyData[input.name] = parseFloat(String(raw));
						} else {
							bodyData[input.name] = raw;
						}
					} catch {
						bodyData[input.name] = raw;
					}
				});
			body = JSON.stringify(bodyData);
		}
	}

	return {
		url,
		options: {
			method,
			headers,
			body: isBodyMethod ? body : undefined,
			credentials: useWpCookie ? 'same-origin' : 'omit',
		},
		// Kept beside `options` rather than inside it: that object goes straight
		// to fetch(), which must not receive keys it does not understand.
		meta: { secretHeaders: finalSecretHeaders, secretQuery },
	};
};

export const onGetCode = () => {
	if (!state.selectedEndpoint || !state.selectedMethod) return;
	try {
		const { url, options, meta } = buildRequest();
		renderCodeOnly(url, options, meta);
	} catch (err) {
		renderResponseError(err instanceof Error ? err.message : String(err), 0);
	}
};

export const onSendRequest = async () => {
	if (!state.selectedEndpoint || !state.selectedMethod) return;

	const sendBtn = document.getElementById('send-request');
	// Only the label span changes — writing textContent on the button itself
	// would wipe its icon. The original text is restored, not re-hardcoded, so
	// a translated label survives the round trip.
	const sendLabel = document.getElementById('send-request-label');
	const sendLabelText = sendLabel?.textContent ?? '';
	if (sendBtn) sendBtn.disabled = true;
	if (sendLabel) sendLabel.textContent = 'Sending…';

	showResponseLoading();

	const startTime = performance.now();

	try {
		const { url, options, meta } = buildRequest();
		const response = await fetch(url, options);
		const duration = Math.round(performance.now() - startTime);

		const contentType = response.headers.get('content-type') ?? '';

		// Read the body as text first so the Raw view can show exactly what the
		// server sent, rather than a re-serialisation of the parsed value.
		const rawText = await response.text();
		let data = rawText;
		let isJson = false;

		if (contentType.includes('application/json')) {
			try {
				data = JSON.parse(rawText);
				isJson = true;
			} catch {
				// A malformed JSON body still has to be displayed; fall back to text.
			}
		}

		renderResponse({
			status: response.status,
			statusText: response.statusText,
			data,
			rawText,
			isJson,
			duration,
			headers: response.headers,
			requestUrl: url,
			requestOptions: options,
			requestMeta: meta,
		});
	} catch (err) {
		const duration = Math.round(performance.now() - startTime);
		// eslint-disable-next-line no-console
		console.error('[REST Playground] Request failed:', err);
		const message =
			err instanceof RequestBuildError
				? err.message
				: 'Request failed. Please check your connection and try again.';
		renderResponseError(message, duration);
	} finally {
		if (sendBtn) sendBtn.disabled = false;
		if (sendLabel) sendLabel.textContent = sendLabelText;
	}
};
