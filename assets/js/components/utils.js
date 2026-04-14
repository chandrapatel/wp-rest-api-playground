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
 * Replace regex-style path param patterns with {name} for display.
 * e.g. /wp/v2/posts/(?P<id>[\d]+) → /wp/v2/posts/{id}
 *
 * @param {string} route - The raw WP REST API route pattern.
 * @returns {string}
 */
export const prettifyRoute = (route) => route.replace(/\(\?P<([^>]+)>[^)]+\)/g, '{$1}');

/**
 * Extract parameter names from a route regex.
 * e.g. /wp/v2/posts/(?P<id>[\d]+) → ['id']
 *
 * @param {string} route - The raw WP REST API route pattern.
 * @returns {string[]}
 */
export const extractPathParams = (route) => {
	const params = [];
	const re = /\(\?P<([^>]+)>[^)]+\)/g;
	let m = re.exec(route);
	while (m !== null) {
		params.push(m[1]);
		m = re.exec(route);
	}
	return params;
};

/**
 * Simple JSON syntax highlighter — assumes the input is already HTML-escaped.
 *
 * @param {unknown} data  Plain JS value (object, array, string, number …)
 * @returns {string}      HTML string with <span> highlighting.
 */
export const syntaxHighlight = (data) => {
	const json = escapeHtml(JSON.stringify(data, null, 2));
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
			return `<span class="${cls}">${match}</span>`;
		},
	);
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
