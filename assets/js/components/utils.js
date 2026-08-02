/**
 * WP REST API Playground — Utility/helper functions.
 */

/**
 * Escape HTML special characters to prevent XSS in innerHTML assignments.
 *
 * @param {unknown} value - The value to escape.
 * @returns {string}
 */
export const escapeHtml = (value) =>
	String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');

/**
 * Locate every `(?P<name>pattern)` span in a route.
 *
 * A naive `[^)]+` match stops at the first `)`, but core route patterns nest
 * groups — e.g. /wp/v2/plugins/(?P<plugin>[^.\/]+(?:\/[^.\/]+)?) — so the close
 * paren has to be found by depth counting, skipping regex-escaped characters.
 *
 * @param {string} route - The raw WP REST API route pattern.
 * @returns {Array<{name: string, start: number, end: number}>} Spans in order;
 * `start`/`end` delimit the whole `(?P<…>…)` group, `end` exclusive.
 */
const findParamSpans = (route) => {
	const spans = [];
	let i = 0;
	while (i < route.length) {
		const start = route.indexOf('(?P<', i);
		if (start === -1) break;
		const nameEnd = route.indexOf('>', start + 4);
		if (nameEnd === -1) break;
		let depth = 1;
		let j = nameEnd + 1;
		while (j < route.length && depth > 0) {
			if (route[j] === '\\') j += 1;
			else if (route[j] === '(') depth += 1;
			else if (route[j] === ')') depth -= 1;
			j += 1;
		}
		spans.push({ name: route.slice(start + 4, nameEnd), start, end: j });
		i = j;
	}
	return spans;
};

/**
 * Replace each path param group in a route with whatever `resolve` returns
 * for its name. The parts between groups pass through untouched.
 *
 * @param {string} route - The raw WP REST API route pattern.
 * @param {(name: string) => string} resolve - Replacement for a param name.
 * @returns {string}
 */
export const substitutePathParams = (route, resolve) => {
	let out = '';
	let last = 0;
	findParamSpans(route).forEach(({ name, start, end }) => {
		out += route.slice(last, start) + resolve(name);
		last = end;
	});
	return out + route.slice(last);
};

/**
 * Encode a path parameter value for interpolation into the URL path.
 *
 * `/` is deliberately left literal. Several core routes accept a slash inside a
 * single param — /wp/v2/plugins/(?P<plugin>[^.\/]+(?:\/[^.\/]+)?) is matched by
 * `jetpack/jetpack`, and template ids look like `twentytwentyfour//home`.
 * WordPress matches REST routes against the still-encoded request path, so a
 * `%2F` never turns back into a separator: the route matches as one segment and
 * the controller then looks up a resource whose name literally contains `%2F`.
 *
 * @param {string} value - Raw value from the path parameter field.
 * @returns {string}
 */
export const encodePathParam = (value) => encodeURIComponent(value).replace(/%2F/g, '/');

/**
 * Replace regex-style path param patterns with {name} for display.
 * e.g. /wp/v2/posts/(?P<id>[\d]+) → /wp/v2/posts/{id}
 *
 * @param {string} route - The raw WP REST API route pattern.
 * @returns {string}
 */
export const prettifyRoute = (route) => substitutePathParams(route, (name) => `{${name}}`);

/**
 * Extract parameter names from a route regex.
 * e.g. /wp/v2/posts/(?P<id>[\d]+) → ['id']
 *
 * @param {string} route - The raw WP REST API route pattern.
 * @returns {string[]}
 */
export const extractPathParams = (route) => findParamSpans(route).map(({ name }) => name);

/**
 * Simple JSON syntax highlighter.
 *
 * Matching runs against the unescaped JSON and each token is escaped as it is
 * wrapped. Escaping up front instead would turn every `"` into `&quot;` before
 * the pattern sees it, so keys and string values would never match. Everything
 * left unmatched is JSON structure — braces, brackets, commas, colons and
 * whitespace — none of which is HTML-significant.
 *
 * @param {unknown} data  Plain JS value (object, array, string, number …)
 * @returns {string}      HTML string with <span> highlighting.
 */
export const syntaxHighlight = (data) => {
	const json = JSON.stringify(data, null, 2);
	if (json === undefined) return escapeHtml(String(data));

	return json.replace(
		/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
		(match) => {
			let cls = 'json-number';
			if (/^"/.test(match)) {
				cls = /:$/.test(match) ? 'json-key' : 'json-string';
			} else if (/true|false/.test(match)) {
				cls = 'json-boolean';
			} else if (/null/.test(match)) {
				cls = 'json-null';
			}
			return `<span class="${cls}">${escapeHtml(match)}</span>`;
		},
	);
};

/**
 * Copy text to the clipboard, reporting whether it worked.
 *
 * `navigator.clipboard` is undefined outside secure contexts, which this
 * plugin explicitly supports — it warns about plain HTTP rather than refusing
 * to run — and `writeText()` rejects when permission is denied or the document
 * is not focused. Callers need both to surface as a failed copy instead of a
 * silent no-op with an unhandled rejection behind it.
 *
 * @param {string} text - Text to place on the clipboard.
 * @returns {Promise<boolean>} Whether the copy succeeded.
 */
export const copyText = async (text) => {
	if (!navigator.clipboard?.writeText) return false;
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
};

/**
 * Determine the CSS modifier for an HTTP status code.
 *
 * @param {number} status - The HTTP status code.
 * @returns {'success'|'warning'|'error'}
 */
export const statusModifier = (status) => {
	if (status >= 200 && status < 300) return 'success';
	if (status >= 400) return 'error';
	return 'warning';
};
