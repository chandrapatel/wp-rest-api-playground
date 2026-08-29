/**
 * WP REST API Playground — Code example generators.
 */

/**
 * Escape single quotes and backslashes for single-quoted string literals.
 *
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
const escapeForStr = (str) => str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Escape a value for a POSIX single-quoted shell string. Backslash-escaping
 * does not work inside single quotes — the only way to embed a quote is to
 * close the string, emit an escaped quote, and reopen it (the `'\''` idiom).
 * Anything else, including backslashes, is literal inside single quotes.
 *
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
const escapeForShell = (str) => str.replace(/'/g, "'\\''");

/**
 * Choose the placeholder that stands in for a redacted credential.
 *
 * Keeping the scheme word makes the snippet self-documenting — a reader can see
 * it needs a bearer token rather than a base64 pair — without carrying the
 * secret itself.
 *
 * @param {string} value - The real header value.
 * @returns {string}
 */
const placeholderFor = (value) => {
	const scheme = /^(\w+)\s+\S/.exec(value)?.[1];
	if (!scheme) return 'YOUR_API_KEY';
	if (scheme.toLowerCase() === 'basic') return 'Basic YOUR_BASE64_CREDENTIALS';
	return `${scheme} YOUR_TOKEN`;
};

/**
 * Replace credential values with placeholders before a snippet is generated.
 *
 * Snippets exist to be pasted into docs, tickets and chat, so the safe default
 * is to leave the secret behind. The Code tab exposes a toggle to opt out.
 *
 * @param {string} url - The request URL.
 * @param {{ method: string, headers: Record<string,string>, body?: string }} options - Fetch options.
 * @param {{ secretHeaders?: string[], secretQuery?: string[] }} [meta] - Which keys hold secrets.
 * @returns {{ url: string, options: { method: string, headers: Record<string,string>, body?: string } }}
 */
export const redactSecrets = (url, options, meta = {}) => {
	const secretHeaders = meta.secretHeaders ?? [];
	const secretQuery = meta.secretQuery ?? [];

	const headers = { ...options.headers };
	secretHeaders.forEach((name) => {
		// Matched case-insensitively: the scheme reports the spelling it wrote
		// ("Authorization"), but a Headers-tab row may have replaced it under a
		// different case ("authorization"). An exact lookup misses that and the
		// live credential is printed into the snippet with masking switched on.
		const lower = name.toLowerCase();
		const key = Object.keys(headers).find((existing) => existing.toLowerCase() === lower);
		if (key) headers[key] = placeholderFor(headers[key]);
	});

	// Query parameter names, unlike header names, are case-sensitive — so these
	// stay an exact match.
	let redactedUrl = url;
	if (secretQuery.length) {
		const qIdx = url.indexOf('?');
		if (qIdx !== -1) {
			const params = new URLSearchParams(url.slice(qIdx + 1));
			secretQuery.forEach((name) => {
				if (params.has(name)) params.set(name, 'YOUR_API_KEY');
			});
			redactedUrl = `${url.slice(0, qIdx)}?${params.toString()}`;
		}
	}

	return { url: redactedUrl, options: { ...options, headers } };
};

/**
 * Header-name tests used by the generators.
 *
 * Case-insensitive because the Headers tab preserves whatever spelling the user
 * typed: an exact-case check let a lowercase `x-wp-nonce` override slip into
 * snippets that state they omit it.
 *
 * @param {string} key - Header name.
 * @returns {boolean}
 */
const isNonceHeader = (key) => key.toLowerCase() === 'x-wp-nonce';

/**
 * Whether a header name is Content-Type, in any spelling.
 *
 * @param {string} key - Header name.
 * @returns {boolean}
 */
const isContentTypeHeader = (key) => key.toLowerCase() === 'content-type';

/**
 * Warn that a snippet cannot reproduce browser cookie authentication.
 *
 * curl and wp_remote_* run outside the browser, so neither carries the login
 * cookie the playground relied on — they would execute anonymously. Presenting
 * them as equivalents without saying so is the more misleading option, since
 * the request appears to work in the panel and then behaves differently.
 *
 * @param {string|undefined} credentials - The fetch credentials mode used.
 * @param {string} commentToken - Line-comment prefix for the target language.
 * @returns {string} Comment block, or an empty string when not applicable.
 */
const cookieCaveat = (credentials, commentToken) => {
	if (credentials !== 'same-origin' && credentials !== 'include') return '';
	return (
		`${commentToken} This request authenticates with your browser's login cookie, which\n` +
		`${commentToken} this snippet cannot send — it will run as a logged-out visitor.\n` +
		`${commentToken} Use an Application Password profile for a runnable equivalent.\n\n`
	);
};

/**
 * Parse a URL into its base path and a plain object of query params.
 *
 * @param {string} url - The URL to parse.
 * @returns {{ base: string, params: Record<string,string> }}
 */
const parseUrl = (url) => {
	const qIdx = url.indexOf('?');
	if (qIdx === -1) return { base: url, params: {} };
	const base = url.slice(0, qIdx);
	const params = Object.fromEntries(new URLSearchParams(url.slice(qIdx + 1)));
	return { base, params };
};

/**
 * Recursively convert a JS value to a PHP array/scalar literal.
 *
 * @param {unknown} value  - The value to convert.
 * @param {number}  indent - Current indentation level (in 4-space units).
 * @returns {string}
 */
const toPhpLiteral = (value, indent = 1) => {
	if (Array.isArray(value)) {
		if (value.length === 0) return '[]';
		const pad = '    '.repeat(indent);
		const closePad = '    '.repeat(indent - 1);
		const items = value.map((item) => `${pad}${toPhpLiteral(item, indent + 1)}`).join(',\n');
		return `[\n${items},\n${closePad}]`;
	}

	if (value !== null && typeof value === 'object') {
		const keys = Object.keys(value);
		if (keys.length === 0) return '[]';
		const pad = '    '.repeat(indent);
		const closePad = '    '.repeat(indent - 1);
		const items = keys
			.map((key) => `${pad}'${escapeForStr(key)}' => ${toPhpLiteral(value[key], indent + 1)}`)
			.join(',\n');
		return `[\n${items},\n${closePad}]`;
	}

	if (typeof value === 'string') return `'${escapeForStr(value)}'`;
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (value === null) return 'null';
	return String(value);
};

/**
 * Generate a JavaScript fetch() code example.
 * - GET    : query params shown as URLSearchParams variable.
 * - POST/PUT/PATCH: body shown as a separate `params` object variable.
 * X-WP-Nonce is kept only when the request authenticates by cookie, where it is
 * mandatory; with a credential in the Authorization header it is dropped, since
 * it is browser-only and irrelevant outside the playground.
 *
 * @param {string} url                                                            - The request URL.
 * @param {{ method: string, headers: Record<string,string>, body?: string, credentials?: string }} options - Fetch options.
 * @returns {string}
 */
export const generateJsCode = (url, options) => {
	const { method, headers, body, credentials } = options;
	const isGet = method === 'GET';
	const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method);
	const { base, params: queryParams } = isGet ? parseUrl(url) : { base: url, params: {} };
	const hasQueryParams = isGet && Object.keys(queryParams).length > 0;

	// The nonce is only meaningful next to the login cookie, and is required
	// there: rest_cookie_check_errors() calls wp_set_current_user( 0 ) when a
	// cookie-authenticated REST request arrives without one, so a snippet that
	// kept the cookie but dropped the nonce would quietly run as nobody.
	const usesCookie = credentials === 'same-origin' || credentials === 'include';
	const sendsNonce = usesCookie && Object.keys(headers).some(isNonceHeader);

	let code = '';

	if (sendsNonce) {
		code += `// X-WP-Nonce is tied to your current login and expires with the session.\n`;
		code += `// On a page that enqueues the wp-api script, use wpApiSettings.nonce instead.\n\n`;
	}

	// GET: URLSearchParams variable.
	if (hasQueryParams) {
		code += `const params = new URLSearchParams( {\n`;
		Object.entries(queryParams).forEach(([key, val]) => {
			code += `    ${JSON.stringify(key)}: ${JSON.stringify(val)},\n`;
		});
		code += `} );\n\n`;
	}

	// POST/PUT/PATCH: body params variable.
	if (isBodyMethod && body) {
		try {
			const parsed = JSON.parse(body);
			code += `const params = ${JSON.stringify(parsed, null, 4)
				.split('\n')
				.map((line, i) => (i === 0 ? line : `    ${line}`))
				.join('\n')};\n\n`;
		} catch {
			// Unparseable body — fall back to inline below.
		}
	}

	const fetchUrl = hasQueryParams
		? `\`${escapeForStr(base)}?\${ params }\``
		: `'${escapeForStr(url)}'`;

	code += `const response = await fetch(\n`;
	code += `    ${fetchUrl},\n`;
	code += `    {\n`;
	code += `        method: '${method}',\n`;
	code += `        headers: {\n`;

	Object.entries(headers).forEach(([key, val]) => {
		if (isNonceHeader(key) && !usesCookie) return;
		code += `            '${escapeForStr(key)}': '${escapeForStr(val)}',\n`;
	});

	code += `        },\n`;

	if (isBodyMethod && body) {
		try {
			JSON.parse(body); // Verify it was parseable — if so, reference the variable.
			code += `        body: JSON.stringify( params ),\n`;
		} catch {
			code += `        body: ${JSON.stringify(body)},\n`;
		}
	}

	// Carried through deliberately. Run from a page on the same site, fetch would
	// otherwise default to sending the login cookie, which WordPress resolves
	// before the Authorization header — the snippet would quietly run as the
	// logged-in user instead of as the credential it appears to use.
	if (credentials) {
		code += `        credentials: '${escapeForStr(credentials)}',\n`;
	}

	code += `    }\n`;
	code += `);\n\n`;
	code += `const data = await response.json();\n`;
	code += `console.log( data );`;

	return code;
};

/**
 * Generate a cURL command example.
 * - GET    : query params stay embedded in the URL.
 * - Non-GET: --request METHOD + --data for the body.
 * X-WP-Nonce is omitted — it is browser-only.
 * Content-Type is omitted for GET — it is not relevant.
 *
 * @param {string} url                                                            - The request URL.
 * @param {{ method: string, headers: Record<string,string>, body?: string }} options - Fetch options.
 * @returns {string}
 */
export const generateCurlCode = (url, options) => {
	const { method, headers, body, credentials } = options;
	const isGet = method === 'GET';

	/** @type {string[]} */
	const parts = ['curl'];

	if (!isGet) {
		parts.push(`  --request ${method}`);
	}

	parts.push(`  --url '${escapeForShell(url)}'`);

	Object.entries(headers).forEach(([key, val]) => {
		if (isNonceHeader(key)) return;
		if (isGet && isContentTypeHeader(key)) return;
		parts.push(`  --header '${escapeForShell(key)}: ${escapeForShell(val)}'`);
	});

	if (body) {
		try {
			const pretty = JSON.stringify(JSON.parse(body));
			parts.push(`  --data '${escapeForShell(pretty)}'`);
		} catch {
			parts.push(`  --data '${escapeForShell(body)}'`);
		}
	}

	return cookieCaveat(credentials, '#') + parts.join(' \\\n');
};

/**
 * Generate a WordPress PHP code example.
 * - GET        : wp_remote_get()  with query params as inline 'body' array (WP appends to URL).
 * - POST       : wp_remote_post() with $params variable passed through wp_json_encode().
 * - PUT/PATCH  : wp_remote_post() with explicit 'method' and $params variable.
 * - DELETE     : wp_remote_post() with explicit 'method', no body.
 * X-WP-Nonce is omitted — it is browser-only, and useless here without the
 * matching cookie, which PHP cannot send either; cookie-mode requests get a
 * comment saying so rather than a snippet that quietly runs logged out.
 *
 * @param {string} url                                                            - The request URL.
 * @param {{ method: string, headers: Record<string,string>, body?: string }} options - Fetch options.
 * @returns {string}
 */
export const generatePhpCode = (url, options) => {
	const { method, headers, body, credentials } = options;
	const isGet = method === 'GET';
	const isPost = method === 'POST';
	const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method);
	const { base, params: queryParams } = isGet ? parseUrl(url) : { base: url, params: {} };
	const hasQueryParams = isGet && Object.keys(queryParams).length > 0;

	const fnName = isGet ? 'wp_remote_get' : 'wp_remote_post';
	const baseUrl = isGet ? base : url;

	let code = cookieCaveat(credentials, '//');

	// POST/PUT/PATCH: $params variable.
	if (isBodyMethod && body) {
		try {
			const parsed = JSON.parse(body);
			code += `$params = ${toPhpLiteral(parsed)};\n\n`;
		} catch {
			// Unparseable body — fall back to inline below.
		}
	}

	code += `$response = ${fnName}(\n`;
	code += `    '${escapeForStr(baseUrl)}',\n`;
	code += `    [\n`;

	// PUT/PATCH/DELETE require an explicit method key.
	if (!isGet && !isPost) {
		code += `        'method'  => '${method}',\n`;
	}

	code += `        'headers' => [\n`;

	Object.entries(headers).forEach(([key, val]) => {
		if (isNonceHeader(key)) return;
		code += `            '${escapeForStr(key)}' => '${escapeForStr(val)}',\n`;
	});

	code += `        ],\n`;

	if (hasQueryParams) {
		// GET query params: inline array (WordPress appends them to the URL).
		code += `        'body'    => [\n`;
		Object.entries(queryParams).forEach(([key, val]) => {
			code += `            '${escapeForStr(key)}' => '${escapeForStr(val)}',\n`;
		});
		code += `        ],\n`;
	} else if (isBodyMethod && body) {
		try {
			JSON.parse(body); // Verify parseable — reference the variable.
			code += `        'body'    => wp_json_encode( $params ),\n`;
		} catch {
			code += `        'body'    => '${escapeForStr(body)}',\n`;
		}
	}

	code += `    ]\n`;
	code += `);\n\n`;
	code += `$body = wp_remote_retrieve_body( $response );\n`;
	code += `$data = json_decode( $body, true );`;

	return code;
};
