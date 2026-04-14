/**
 * WP REST API Playground — Request form and endpoint panel renderer.
 */

import { state } from '../state';
import { escapeHtml, extractPathParams, prettifyRoute } from '../utils';
import { renderField } from './fields';

/**
 * Populate the path/query/body parameter sections for the given endpoint + method.
 *
 * @param {{ route: string, methods: Record<string, Record<string, object>> }} endpoint - The endpoint descriptor object.
 * @param {string} method - The HTTP method to render the form for.
 */
export const renderRequestForm = (endpoint, method) => {
	const args = endpoint.methods[method] ?? {};
	const pathParams = extractPathParams(endpoint.route);
	const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method);

	// --- Path parameters ---
	const pathSection = document.getElementById('path-params-section');
	const pathFields = document.getElementById('path-params-fields');

	if (pathSection && pathFields) {
		if (pathParams.length > 0) {
			pathSection.hidden = false;
			pathFields.innerHTML = pathParams
				.map((name) => renderField(name, { ...(args[name] ?? {}), required: true }, 'path'))
				.join('');
		} else {
			pathSection.hidden = true;
			pathFields.innerHTML = '';
		}
	}

	// Non-path args.
	const otherArgs = Object.entries(args).filter(([name]) => !pathParams.includes(name));

	const querySection = document.getElementById('query-params-section');
	const queryFields = document.getElementById('query-params-fields');
	const bodySection = document.getElementById('body-section');
	const bodyFields = document.getElementById('body-fields');

	if (isBodyMethod) {
		// Hide query section; show body section.
		if (querySection) querySection.hidden = true;
		if (queryFields) queryFields.innerHTML = '';

		if (bodySection && bodyFields) {
			bodySection.hidden = false;

			if (otherArgs.length > 0) {
				bodyFields.innerHTML = `
					<div class="rest-playground__body-tabs">
						<button class="rest-playground__body-tab is-active" data-tab="form" type="button">Form Fields</button>
						<button class="rest-playground__body-tab" data-tab="raw" type="button">Raw JSON</button>
					</div>
					<div id="body-form-pane" class="rest-playground__body-pane">
						${otherArgs.map(([name, arg]) => renderField(name, arg, 'body')).join('')}
					</div>
					<div id="body-raw-pane" class="rest-playground__body-pane" hidden>
						<textarea id="raw-json-body" class="rest-playground__json-input" placeholder='{\n  "title": "My Post"\n}' rows="10" spellcheck="false"></textarea>
					</div>
				`;
				bodyFields.querySelectorAll('.rest-playground__body-tab').forEach((tab) => {
					tab.addEventListener('click', (e) => {
						const target = /** @type {HTMLElement} */ (e.currentTarget).dataset.tab;
						bodyFields
							.querySelectorAll('.rest-playground__body-tab')
							.forEach((t) => t.classList.remove('is-active'));
						/** @type {HTMLElement} */ (e.currentTarget).classList.add('is-active');
						const formPane = document.getElementById('body-form-pane');
						const rawPane = document.getElementById('body-raw-pane');
						if (formPane) formPane.hidden = target !== 'form';
						if (rawPane) rawPane.hidden = target !== 'raw';
					});
				});
			} else {
				// No schema args — just a raw JSON textarea.
				bodyFields.innerHTML = `
					<p class="rest-playground__field-desc" style="margin-bottom:8px;">No schema available for this endpoint's body. Enter raw JSON below.</p>
					<textarea id="raw-json-body" class="rest-playground__json-input" placeholder="{}" rows="8" spellcheck="false"></textarea>
				`;
			}
		}
	} else {
		// GET / DELETE — show query params.
		if (bodySection) bodySection.hidden = true;
		if (bodyFields) bodyFields.innerHTML = '';

		if (querySection && queryFields) {
			querySection.hidden = false;
			queryFields.innerHTML =
				otherArgs.length > 0
					? otherArgs.map(([name, arg]) => renderField(name, arg, 'query')).join('')
					: '<p class="rest-playground__no-params">No query parameters defined for this endpoint.</p>';
		}
	}
};

/**
 * Show the endpoint panel, populate the URL bar and method tabs, then render the form.
 *
 * @param {{ route: string, methods: Record<string, Record<string, object>> }} endpoint - The endpoint descriptor object.
 * @param {string} method - The HTTP method to render the form for.
 */
export const renderEndpointPanel = (endpoint, method) => {
	const welcome = document.getElementById('rest-playground-welcome');
	const panel = document.getElementById('rest-playground-endpoint');
	if (welcome) welcome.hidden = true;
	if (panel) panel.hidden = false;

	// URL bar.
	const baseUrl = (window.wpRestPlayground?.restUrl ?? '').replace(/\/$/, '');
	const urlBase = document.getElementById('url-base');
	const urlRoute = document.getElementById('url-route');
	if (urlBase) urlBase.textContent = baseUrl;
	if (urlRoute) urlRoute.textContent = prettifyRoute(endpoint.route);

	// Method tabs.
	const tabsEl = document.getElementById('method-tabs');
	if (tabsEl) {
		tabsEl.innerHTML = Object.keys(endpoint.methods)
			.map(
				(m) => `
				<button
					class="rest-playground__method-tab rest-playground__method-tab--${escapeHtml(m.toLowerCase())}${m === method ? ' is-active' : ''}"
					data-method="${escapeHtml(m)}"
					type="button"
					role="tab"
					aria-selected="${m === method}"
				>${escapeHtml(m)}</button>
			`,
			)
			.join('');

		tabsEl.querySelectorAll('.rest-playground__method-tab').forEach((tab) => {
			tab.addEventListener('click', (e) => {
				const newMethod = /** @type {HTMLElement} */ (e.currentTarget).dataset.method ?? '';
				tabsEl.querySelectorAll('.rest-playground__method-tab').forEach((t) => {
					t.classList.remove('is-active');
					t.setAttribute('aria-selected', 'false');
				});
				/** @type {HTMLElement} */ (e.currentTarget).classList.add('is-active');
				/** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-selected', 'true');
				state.selectedMethod = newMethod;
				renderRequestForm(endpoint, newMethod);
			});
		});
	}

	renderRequestForm(endpoint, method);
};
