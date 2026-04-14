/**
 * WP REST API Playground — Response panel renderer.
 */

import { escapeHtml, syntaxHighlight, statusModifier } from '../utils';

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
 */
export const renderResponse = ({ status, statusText, data, isJson, duration, headers }) => {
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

	if (bodyEl) {
		bodyEl.innerHTML = `
			<div class="rest-playground__resp-tabs" role="tablist">
				<button class="rest-playground__resp-tab is-active" data-tab="body" type="button" role="tab" aria-selected="true">Body</button>
				<button class="rest-playground__resp-tab" data-tab="headers" type="button" role="tab" aria-selected="false">Headers</button>
			</div>
			<div id="resp-body-pane" class="rest-playground__resp-pane">
				<pre class="rest-playground__json-output">${formattedBody}</pre>
			</div>
			<div id="resp-headers-pane" class="rest-playground__resp-pane" hidden>
				<pre class="rest-playground__json-output">${formattedHeaders}</pre>
			</div>
		`;

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
				if (bodyPane) bodyPane.hidden = target !== 'body';
				if (headersPane) headersPane.hidden = target !== 'headers';
			});
		});
	}
};
