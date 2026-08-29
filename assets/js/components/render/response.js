/**
 * WP REST API Playground — Response panel renderer.
 */

import { copyText, escapeHtml, statusModifier } from '../utils';
import { generateJsCode, generatePhpCode, generateCurlCode, redactSecrets } from '../generateCode';
import { mountJsonViewer, mountTextViewer } from './jsonViewer';

/**
 * Viewer currently mounted in the Body pane. The copy button lives in the
 * response header, outside the pane, so it reads what is on screen from here.
 *
 * @type {{ getVisibleText: () => string }|null}
 */
let activeViewer = null;

export const showResponseLoading = () => {
	const meta = document.getElementById('response-meta');
	const body = document.getElementById('response-body');
	activeViewer = null;
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

	activeViewer = null;

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
 * The request the Code tab is describing, kept so the redact toggle can
 * regenerate the snippets without re-sending anything.
 *
 * @type {{url: string, options: object, meta: object}|null}
 */
let codeSource = null;

/** Whether credentials are masked in generated snippets. */
let redactCode = true;

/**
 * Which language the Code tab is showing.
 *
 * Held here rather than read back off the DOM because toggling redaction
 * rebuilds the whole code pane — without this the rebuild would always come
 * back on JavaScript and throw away the language the user had chosen.
 *
 * @type {'js'|'php'|'curl'}
 */
let codeLang = 'js';

/**
 * Build the inner HTML for the code language sub-tabs and their panes.
 *
 * @param {string} url - The request URL.
 * @param {{ method: string, headers: Record<string,string>, body?: string }} options - Fetch options.
 * @param {{ secretHeaders?: string[], secretQuery?: string[] }} [meta] - Which keys hold secrets.
 * @returns {string}
 */
const buildCodePanesHtml = (url, options, meta = {}) => {
	if (!url || !options) return '';

	codeSource = { url, options, meta };

	const hasSecrets = (meta.secretHeaders?.length ?? 0) + (meta.secretQuery?.length ?? 0) > 0;
	const source = redactCode ? redactSecrets(url, options, meta) : { url, options };

	const jsCode = generateJsCode(source.url, source.options);
	const phpCode = generatePhpCode(source.url, source.options);
	const curlCode = generateCurlCode(source.url, source.options);

	const langs = [
		['js', 'JavaScript', jsCode],
		['php', 'WordPress', phpCode],
		['curl', 'cURL', curlCode],
	];

	const tabs = langs
		.map(
			([id, label]) =>
				`<button class="rest-playground__code-lang-tab${id === codeLang ? ' is-active' : ''}" data-lang="${id}" type="button">${label}</button>`,
		)
		.join('');

	const panes = langs
		.map(
			([id, , code]) =>
				`<div id="resp-code-${id}-pane" class="rest-playground__code-lang-pane"${id === codeLang ? '' : ' hidden'}>
					<pre class="rest-playground__json-output">${escapeHtml(code)}</pre>
				</div>`,
		)
		.join('');

	return `
		<div class="rest-playground__code-lang-tabs">
			${tabs}
			${
				hasSecrets
					? `<label class="rest-playground__redact-toggle">
							<input type="checkbox" class="rest-playground__checkbox" id="redact-secrets" ${redactCode ? 'checked' : ''}>
							Hide credentials
						</label>`
					: ''
			}
		</div>
		${panes}
	`;
};

/**
 * Attach handlers for the Code tab's own controls.
 *
 * Split out from the response tabs because the redact toggle rebuilds only the
 * code pane: rebinding the outer tabs there too would stack a fresh listener on
 * the same surviving buttons on every toggle.
 *
 * @param {HTMLElement} bodyEl - The #response-body container.
 */
const attachCodeHandlers = (bodyEl) => {
	bodyEl.querySelectorAll('.rest-playground__code-lang-tab').forEach((tab) => {
		tab.addEventListener('click', (e) => {
			const { lang } = /** @type {HTMLElement} */ (e.currentTarget).dataset;
			// Recorded so a later rebuild — toggling redaction, or the next
			// response — comes back on the language the user was reading.
			codeLang = /** @type {'js'|'php'|'curl'} */ (lang);
			bodyEl.querySelectorAll('.rest-playground__code-lang-tab').forEach((t) => {
				t.classList.remove('is-active');
			});
			/** @type {HTMLElement} */ (e.currentTarget).classList.add('is-active');
			bodyEl.querySelectorAll('.rest-playground__code-lang-pane').forEach((pane) => {
				pane.hidden = pane.id !== `resp-code-${lang}-pane`;
			});
		});
	});

	// Regenerating from codeSource rather than the rendered text: the masked
	// snippet has no way back to the real credential.
	document.getElementById('redact-secrets')?.addEventListener('change', (e) => {
		redactCode = /** @type {HTMLInputElement} */ (e.target).checked;
		const codePane = document.getElementById('resp-code-pane');
		if (!codePane || !codeSource) return;
		codePane.innerHTML = buildCodePanesHtml(
			codeSource.url,
			codeSource.options,
			codeSource.meta,
		);
		attachCodeHandlers(bodyEl);
		// The rebuild replaced the checkbox that fired this event, so focus has to
		// be put back or a keyboard user is dropped to the top of the document.
		document.getElementById('redact-secrets')?.focus();
	});
};

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

	attachCodeHandlers(bodyEl);
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
 * @param {string} opts.rawText - Unparsed response body, shown in the Raw view.
 * @param {boolean} opts.isJson - Whether the response is JSON.
 * @param {number} opts.duration - Request duration in milliseconds.
 * @param {Headers} opts.headers - Response headers object.
 * @param {string} opts.requestUrl - The URL that was fetched.
 * @param {{ method: string, headers: Record<string,string>, body?: string }} opts.requestOptions - The fetch options used.
 * @param {{ secretHeaders?: string[], secretQuery?: string[] }} [opts.requestMeta] - Which request keys hold credentials.
 */
export const renderResponse = ({
	status,
	statusText,
	data,
	rawText,
	isJson,
	duration,
	headers,
	requestUrl,
	requestOptions,
	requestMeta,
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

		document.getElementById('copy-response')?.addEventListener('click', async () => {
			// Copies what the Body pane is showing — filtered result, raw text or
			// the whole document — rather than always the unfiltered payload.
			const text = activeViewer?.getVisibleText() ?? String(rawText ?? '');
			const copied = await copyText(text);

			const btn = document.getElementById('copy-response');
			if (!btn) return;

			btn.classList.toggle('is-copied', copied);
			btn.classList.toggle('is-copy-failed', !copied);
			btn.title = copied ? 'Copied!' : 'Copy failed — clipboard unavailable';
			setTimeout(() => {
				btn.classList.remove('is-copied', 'is-copy-failed');
				btn.title = 'Copy response';
			}, 2000);
		});
	}

	// Serialize headers for display.
	const headerObj = /** @type {Record<string,string>} */ ({});
	if (headers) {
		headers.forEach((val, key) => {
			headerObj[key] = val;
		});
	}

	if (bodyEl) {
		bodyEl.innerHTML = `
			<div class="rest-playground__resp-tabs" role="tablist">
				<button class="rest-playground__resp-tab is-active" data-tab="body" type="button" role="tab" aria-selected="true">Body</button>
				<button class="rest-playground__resp-tab" data-tab="headers" type="button" role="tab" aria-selected="false">Headers</button>
				<button class="rest-playground__resp-tab" data-tab="code" type="button" role="tab" aria-selected="false">Code</button>
			</div>
			<div id="resp-body-pane" class="rest-playground__resp-pane"></div>
			<div id="resp-headers-pane" class="rest-playground__resp-pane" hidden></div>
			<div id="resp-code-pane" class="rest-playground__resp-pane" hidden>
				${buildCodePanesHtml(requestUrl, requestOptions, requestMeta)}
			</div>
		`;

		const bodyPane = bodyEl.querySelector('#resp-body-pane');
		if (bodyPane) {
			activeViewer = isJson
				? mountJsonViewer(bodyPane, {
						data,
						rawText: rawText ?? JSON.stringify(data, null, 2),
					})
				: mountTextViewer(bodyPane, String(rawText ?? data));
		}

		const headersPane = bodyEl.querySelector('#resp-headers-pane');
		if (headersPane) {
			mountJsonViewer(headersPane, { data: headerObj, rawText: '', showToolbar: false });
		}

		attachTabHandlers(bodyEl);
	}
};

/**
 * Generate and display code examples without sending a request.
 * Opens the response panel directly to the Code tab.
 *
 * @param {string} requestUrl                                                                    - The URL that was fetched.
 * @param {{ method: string, headers: Record<string,string>, body?: string }} requestOptions - The fetch options used.
 * @param {{ secretHeaders?: string[], secretQuery?: string[] }} [requestMeta] - Which request keys hold credentials.
 */
export const renderCodeOnly = (requestUrl, requestOptions, requestMeta) => {
	const metaEl = document.getElementById('response-meta');
	const bodyEl = document.getElementById('response-body');

	activeViewer = null;
	if (metaEl) metaEl.innerHTML = '';

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
				${buildCodePanesHtml(requestUrl, requestOptions, requestMeta)}
			</div>
		`;

		attachTabHandlers(bodyEl);
	}
};
