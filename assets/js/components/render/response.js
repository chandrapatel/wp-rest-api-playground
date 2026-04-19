/**
 * WP REST API Playground — Response panel renderer.
 */

import { escapeHtml, syntaxHighlight, statusModifier } from '../utils';
import { generateJsCode, generatePhpCode, generateCurlCode } from '../generateCode';

export const showResponseLoading = () => {
	const meta = document.getElementById('response-meta');
	const body = document.getElementById('response-body');
	if (meta) meta.innerHTML = '';
	if (body) {
		body.innerHTML = `
			<div class="rest-playground__response-loading">
				<div class="rest-playground__spinner" aria-hidden="true"></div>
				Sending request…
			</div>
		`;
	}
};

/**
 * Render an error message in the response panel.
 *
 * @param {string} message  - The error message to display.
 * @param {number} duration - Request duration in milliseconds.
 */
export const renderResponseError = (message, duration) => {
	const metaEl = document.getElementById('response-meta');
	const bodyEl = document.getElementById('response-body');

	if (metaEl) {
		metaEl.innerHTML = `
			<span class="rest-playground__status-badge rest-playground__status-badge--error">Error</span>
			<span class="rest-playground__timing">${duration}ms</span>
		`;
	}

	if (bodyEl) {
		bodyEl.innerHTML = `
			<div class="rest-playground__response-error">
				<strong>Request Failed</strong>
				<p>${escapeHtml(message)}</p>
			</div>
		`;
	}
};

// ---------------------------------------------------------------------------
// Shared helpers for the Code tab
// ---------------------------------------------------------------------------

/**
 * Build the inner HTML for the code language sub-tabs and their panes.
 *
 * @param {string} jsCode   - The JavaScript fetch() code example.
 * @param {string} phpCode  - The WordPress PHP code example.
 * @param {string} curlCode - The cURL command example.
 * @returns {string}
 */
const buildCodePanesHtml = (jsCode, phpCode, curlCode) => `
	<div class="rest-playground__code-lang-tabs">
		<button class="rest-playground__code-lang-tab is-active" data-lang="js" type="button">JavaScript</button>
		<button class="rest-playground__code-lang-tab" data-lang="php" type="button">WordPress</button>
		<button class="rest-playground__code-lang-tab" data-lang="curl" type="button">cURL</button>
	</div>
	<div id="resp-code-js-pane" class="rest-playground__code-lang-pane">
		<pre class="rest-playground__json-output">${escapeHtml(jsCode)}</pre>
	</div>
	<div id="resp-code-php-pane" class="rest-playground__code-lang-pane" hidden>
		<pre class="rest-playground__json-output">${escapeHtml(phpCode)}</pre>
	</div>
	<div id="resp-code-curl-pane" class="rest-playground__code-lang-pane" hidden>
		<pre class="rest-playground__json-output">${escapeHtml(curlCode)}</pre>
	</div>
`;

/**
 * Attach click handlers for the response top-level tabs and the code language sub-tabs.
 *
 * @param {HTMLElement} bodyEl - The #response-body container.
 */
const attachTabHandlers = (bodyEl) => {
	bodyEl.querySelectorAll('.rest-playground__resp-tab').forEach((tab) => {
		tab.addEventListener('click', (e) => {
			const target = /** @type {HTMLElement} */ (e.currentTarget).dataset.tab;
			bodyEl.querySelectorAll('.rest-playground__resp-tab').forEach((t) => {
				t.classList.remove('is-active');
				t.setAttribute('aria-selected', 'false');
			});
			/** @type {HTMLElement} */ (e.currentTarget).classList.add('is-active');
			/** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-selected', 'true');
			const bodyPane = document.getElementById('resp-body-pane');
			const headersPane = document.getElementById('resp-headers-pane');
			const codePane = document.getElementById('resp-code-pane');
			if (bodyPane) bodyPane.hidden = target !== 'body';
			if (headersPane) headersPane.hidden = target !== 'headers';
			if (codePane) codePane.hidden = target !== 'code';
		});
	});

	bodyEl.querySelectorAll('.rest-playground__code-lang-tab').forEach((tab) => {
		tab.addEventListener('click', (e) => {
			const { lang } = /** @type {HTMLElement} */ (e.currentTarget).dataset;
			bodyEl.querySelectorAll('.rest-playground__code-lang-tab').forEach((t) => {
				t.classList.remove('is-active');
			});
			/** @type {HTMLElement} */ (e.currentTarget).classList.add('is-active');
			const jsPane = document.getElementById('resp-code-js-pane');
			const phpPane = document.getElementById('resp-code-php-pane');
			const curlPane = document.getElementById('resp-code-curl-pane');
			if (jsPane) jsPane.hidden = lang !== 'js';
			if (phpPane) phpPane.hidden = lang !== 'php';
			if (curlPane) curlPane.hidden = lang !== 'curl';
		});
	});
};

// ---------------------------------------------------------------------------
// Public renderers
// ---------------------------------------------------------------------------

/**
 * Render the API response into the response panel.
 *
 * @param {object} opts - Response data and metadata.
 * @param {number} opts.status - HTTP status code.
 * @param {string} opts.statusText - HTTP status text.
 * @param {unknown} opts.data - Parsed response body.
 * @param {boolean} opts.isJson - Whether the response is JSON.
 * @param {number} opts.duration - Request duration in milliseconds.
 * @param {Headers} opts.headers - Response headers object.
 * @param {string} opts.requestUrl - The URL that was fetched.
 * @param {{ method: string, headers: Record<string,string>, body?: string }} opts.requestOptions - The fetch options used.
 */
export const renderResponse = ({
	status,
	statusText,
	data,
	isJson,
	duration,
	headers,
	requestUrl,
	requestOptions,
}) => {
	const metaEl = document.getElementById('response-meta');
	const bodyEl = document.getElementById('response-body');
	const mod = statusModifier(status);

	if (metaEl) {
		metaEl.innerHTML = `
			<span class="rest-playground__status-badge rest-playground__status-badge--${mod}">
				<span>${status}</span>
			</span>
			<span class="rest-playground__status-text">${escapeHtml(statusText)}</span>
			<span class="rest-playground__timing">${duration}ms</span>
			<button class="rest-playground__copy-btn" id="copy-response" type="button" title="Copy response">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<rect x="9" y="9" width="13" height="13" rx="2"/>
					<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
				</svg>
			</button>
		`;

		document.getElementById('copy-response')?.addEventListener('click', () => {
			const text = isJson ? JSON.stringify(data, null, 2) : String(data);
			navigator.clipboard?.writeText(text).then(() => {
				const btn = document.getElementById('copy-response');
				if (btn) {
					btn.classList.add('is-copied');
					btn.title = 'Copied!';
					setTimeout(() => {
						btn.classList.remove('is-copied');
						btn.title = 'Copy response';
					}, 2000);
				}
			});
		});
	}

	const formattedBody = isJson
		? syntaxHighlight(data)
		: `<span class="json-string">${escapeHtml(String(data))}</span>`;

	// Serialize headers for display.
	const headerObj = /** @type {Record<string,string>} */ ({});
	if (headers) {
		headers.forEach((val, key) => {
			headerObj[key] = val;
		});
	}
	const formattedHeaders = syntaxHighlight(headerObj);

	const jsCode = requestUrl && requestOptions ? generateJsCode(requestUrl, requestOptions) : '';
	const phpCode = requestUrl && requestOptions ? generatePhpCode(requestUrl, requestOptions) : '';
	const curlCode =
		requestUrl && requestOptions ? generateCurlCode(requestUrl, requestOptions) : '';

	if (bodyEl) {
		bodyEl.innerHTML = `
			<div class="rest-playground__resp-tabs" role="tablist">
				<button class="rest-playground__resp-tab is-active" data-tab="body" type="button" role="tab" aria-selected="true">Body</button>
				<button class="rest-playground__resp-tab" data-tab="headers" type="button" role="tab" aria-selected="false">Headers</button>
				<button class="rest-playground__resp-tab" data-tab="code" type="button" role="tab" aria-selected="false">Code</button>
			</div>
			<div id="resp-body-pane" class="rest-playground__resp-pane">
				<pre class="rest-playground__json-output">${formattedBody}</pre>
			</div>
			<div id="resp-headers-pane" class="rest-playground__resp-pane" hidden>
				<pre class="rest-playground__json-output">${formattedHeaders}</pre>
			</div>
			<div id="resp-code-pane" class="rest-playground__resp-pane" hidden>
				${buildCodePanesHtml(jsCode, phpCode, curlCode)}
			</div>
		`;

		attachTabHandlers(bodyEl);
	}
};

/**
 * Generate and display code examples without sending a request.
 * Opens the response panel directly to the Code tab.
 *
 * @param {string} requestUrl                                                                    - The URL that was fetched.
 * @param {{ method: string, headers: Record<string,string>, body?: string }} requestOptions - The fetch options used.
 */
export const renderCodeOnly = (requestUrl, requestOptions) => {
	const metaEl = document.getElementById('response-meta');
	const bodyEl = document.getElementById('response-body');

	if (metaEl) metaEl.innerHTML = '';

	const jsCode = generateJsCode(requestUrl, requestOptions);
	const phpCode = generatePhpCode(requestUrl, requestOptions);
	const curlCode = generateCurlCode(requestUrl, requestOptions);

	if (bodyEl) {
		bodyEl.innerHTML = `
			<div class="rest-playground__resp-tabs" role="tablist">
				<button class="rest-playground__resp-tab" data-tab="body" type="button" role="tab" aria-selected="false">Body</button>
				<button class="rest-playground__resp-tab" data-tab="headers" type="button" role="tab" aria-selected="false">Headers</button>
				<button class="rest-playground__resp-tab is-active" data-tab="code" type="button" role="tab" aria-selected="true">Code</button>
			</div>
			<div id="resp-body-pane" class="rest-playground__resp-pane" hidden>
				<p class="rest-playground__no-params" style="padding:16px;">Send a request to see the response body.</p>
			</div>
			<div id="resp-headers-pane" class="rest-playground__resp-pane" hidden>
				<p class="rest-playground__no-params" style="padding:16px;">Send a request to see the response headers.</p>
			</div>
			<div id="resp-code-pane" class="rest-playground__resp-pane">
				${buildCodePanesHtml(jsCode, phpCode, curlCode)}
			</div>
		`;

		attachTabHandlers(bodyEl);
	}
};
