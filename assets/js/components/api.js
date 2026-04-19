/**
 * WP REST API Playground — Request builder and executor.
 */

import { state } from './state';
import { extractPathParams } from './utils';
import {
	showResponseLoading,
	renderResponse,
	renderResponseError,
	renderCodeOnly,
} from './render/response';

/**
 * Assemble the fetch URL and init options from the current form state.
 *
 * @returns {{ url: string, options: { method: string|null, headers: Record<string,string>, body: string|undefined, credentials: string } }}
 */
export const buildRequest = () => {
	const endpoint = state.selectedEndpoint;
	const method = state.selectedMethod;
	const pathParams = extractPathParams(endpoint.route);

	// Build URL: substitute path params.
	let routePath = endpoint.route;
	pathParams.forEach((param) => {
		const input = /** @type {HTMLInputElement|null} */ (
			document.getElementById(`field-path-${param}`)
		);
		const val = input?.value?.trim() ?? '';
		if (val) {
			// Replace the named capture group with the actual value.
			routePath = routePath.replace(
				new RegExp(`\\(\\?P<${param}>[^)]+\\)`),
				encodeURIComponent(val),
			);
		}
	});
	// Strip any leftover unresolved regex patterns.
	routePath = routePath.replace(/\(\?P<[^>]+>[^)]+\)/g, '');

	const baseUrl = (window.wpRestPlayground?.restUrl ?? '').replace(/\/$/, '');
	let url = baseUrl + routePath;

	// Headers.
	/** @type {Record<string,string>} */
	const headers = {
		'Content-Type': 'application/json',
		'X-WP-Nonce': window.wpRestPlayground?.nonce ?? '',
	};

	if (state.auth.username && state.auth.password) {
		headers.Authorization = `Basic ${btoa(`${state.auth.username}:${state.auth.password}`)}`;
	}

	const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method);
	let body;

	if (!isBodyMethod) {
		// Collect query params from form fields.
		const params = new URLSearchParams();
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
		const qs = params.toString();
		if (qs) url += `?${qs}`;
	} else {
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
				throw new Error('Invalid JSON in request body — please check your syntax.');
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
			credentials: 'same-origin',
		},
	};
};

export const onGetCode = () => {
	if (!state.selectedEndpoint || !state.selectedMethod) return;
	try {
		const { url, options } = buildRequest();
		renderCodeOnly(url, options);
	} catch (err) {
		renderResponseError(err instanceof Error ? err.message : String(err), 0);
	}
};

export const onSendRequest = async () => {
	if (!state.selectedEndpoint || !state.selectedMethod) return;

	const sendBtn = document.getElementById('send-request');
	if (sendBtn) {
		sendBtn.disabled = true;
		sendBtn.textContent = 'Sending…';
	}

	showResponseLoading();

	const startTime = performance.now();

	try {
		const { url, options } = buildRequest();
		const response = await fetch(url, options);
		const duration = Math.round(performance.now() - startTime);

		const contentType = response.headers.get('content-type') ?? '';
		const isJson = contentType.includes('application/json');

		let data;
		if (isJson) {
			data = await response.json();
		} else {
			data = await response.text();
		}

		renderResponse({
			status: response.status,
			statusText: response.statusText,
			data,
			isJson,
			duration,
			headers: response.headers,
			requestUrl: url,
			requestOptions: options,
		});
	} catch (err) {
		const duration = Math.round(performance.now() - startTime);
		renderResponseError(err instanceof Error ? err.message : String(err), duration);
	} finally {
		if (sendBtn) {
			sendBtn.disabled = false;
			sendBtn.textContent = 'Send Request';
		}
	}
};
