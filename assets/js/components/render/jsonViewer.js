/**
 * WP REST API Playground — JSON viewer for the response body pane.
 *
 * Wraps the collapsible tree with the surrounding chrome: a Tree/Pretty/Raw
 * view switch, a JSONPath filter box, and expand/collapse controls.
 */

import { escapeHtml, syntaxHighlight } from '../utils';
import { createJsonTree, expandAll, collapseAll } from '../jsonTree';
import { queryJson } from '../jsonPath';

const VIEW_STORAGE_KEY = 'wp-rest-playground-response-view';
const FILTER_DEBOUNCE_MS = 200;
const VIEWS = ['tree', 'pretty', 'raw'];

/**
 * Read the last view the user chose. Falls back to the tree when storage is
 * unavailable (private mode, disabled cookies).
 *
 * @returns {string}
 */
const readStoredView = () => {
	try {
		const stored = localStorage.getItem(VIEW_STORAGE_KEY);
		return VIEWS.includes(stored) ? stored : 'tree';
	} catch {
		return 'tree';
	}
};

/**
 * Persist the chosen view.
 *
 * @param {string} view - One of VIEWS.
 */
const storeView = (view) => {
	try {
		localStorage.setItem(VIEW_STORAGE_KEY, view);
	} catch {
		// Storage is optional; the viewer works fine without it.
	}
};

/**
 * Build the toolbar markup. Contains no response data, so a template is safe
 * here — the body itself is always rendered through the tree or escapeHtml().
 *
 * @param {string} view - Initially active view.
 * @returns {string}
 */
const toolbarHtml = (view) => `
	<div class="rest-playground__json-toolbar">
		<div class="rest-playground__view-switch" role="group" aria-label="Response view">
			<button type="button" class="rest-playground__view-btn${view === 'tree' ? ' is-active' : ''}" data-view="tree" aria-pressed="${view === 'tree'}">Tree</button>
			<button type="button" class="rest-playground__view-btn${view === 'pretty' ? ' is-active' : ''}" data-view="pretty" aria-pressed="${view === 'pretty'}">Pretty</button>
			<button type="button" class="rest-playground__view-btn${view === 'raw' ? ' is-active' : ''}" data-view="raw" aria-pressed="${view === 'raw'}">Raw</button>
		</div>
		<div class="rest-playground__json-filter">
			<input
				type="text"
				id="resp-filter"
				class="rest-playground__json-filter-input"
				placeholder="Filter: $..title, $[?(@.status=='publish')]"
				aria-label="Filter response with a JSONPath expression"
				aria-describedby="resp-filter-status"
				spellcheck="false"
				autocomplete="off"
			>
			<button type="button" class="rest-playground__json-filter-clear" id="resp-filter-clear" title="Clear filter" aria-label="Clear filter" hidden>&times;</button>
		</div>
		<div class="rest-playground__json-tree-actions">
			<button type="button" class="rest-playground__json-action" id="resp-expand-all" title="Expand all" aria-label="Expand all">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M5 6l3 3 3-3M5 11l3 3 3-3M2 2h12"/>
				</svg>
			</button>
			<button type="button" class="rest-playground__json-action" id="resp-collapse-all" title="Collapse all" aria-label="Collapse all">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M5 5l3-3 3 3M5 11l3 3 3-3M2 8h12"/>
				</svg>
			</button>
		</div>
	</div>
	<p class="rest-playground__json-status" id="resp-filter-status" role="status" aria-live="polite"></p>
	<div class="rest-playground__json-view" id="resp-json-view"></div>
`;

/**
 * Mount the JSON viewer into a container.
 *
 * @param {HTMLElement} container - Element to render into (a response pane).
 * @param {object} opts           - Viewer data.
 * @param {unknown} opts.data     - Parsed JSON value.
 * @param {string} opts.rawText   - Untouched response body text.
 * @param {boolean} [opts.showToolbar] - Set false for flat payloads like headers.
 * @returns {{ getVisibleText: () => string }} Accessor used by the copy button.
 */
export const mountJsonViewer = (container, { data, rawText, showToolbar = true }) => {
	if (!showToolbar) {
		const pre = document.createElement('pre');
		pre.className = 'rest-playground__json-output';
		pre.innerHTML = syntaxHighlight(data);
		container.appendChild(pre);
		return { getVisibleText: () => JSON.stringify(data, null, 2) };
	}

	let view = readStoredView();
	let filtered = data;
	let filterActive = false;

	// Lets the pane pin the toolbar and scroll only the body beneath it.
	container.classList.add('has-json-viewer');
	container.innerHTML = toolbarHtml(view);

	const viewEl = container.querySelector('#resp-json-view');
	const statusEl = container.querySelector('#resp-filter-status');
	const filterInput = /** @type {HTMLInputElement} */ (container.querySelector('#resp-filter'));
	const clearBtn = container.querySelector('#resp-filter-clear');
	const expandBtn = container.querySelector('#resp-expand-all');
	const collapseBtn = container.querySelector('#resp-collapse-all');

	/**
	 * Text currently on screen, so the header copy button matches what is shown.
	 *
	 * @returns {string}
	 */
	const getVisibleText = () => {
		if (view === 'raw') return rawText;
		return JSON.stringify(filtered, null, 2);
	};

	/**
	 * Update the status line. The element stays in the DOM even when empty —
	 * a hidden live region is outside the accessibility tree, so mutating it
	 * while hidden would announce nothing. CSS collapses it when it has no text.
	 *
	 * A query that parses but matches nothing is a 'warn', not an 'error' — the
	 * expression is valid, so marking the input aria-invalid would misreport it.
	 *
	 * @param {string} message - Text to announce, or '' to clear.
	 * @param {'none'|'warn'|'error'} [tone] - How to style and expose it.
	 */
	const setStatus = (message, tone = 'none') => {
		if (!statusEl) return;
		statusEl.textContent = message ?? '';
		statusEl.classList.toggle('is-error', tone === 'error');
		statusEl.classList.toggle('is-warn', tone === 'warn');

		if (!filterInput) return;
		if (tone === 'error') filterInput.setAttribute('aria-invalid', 'true');
		else filterInput.removeAttribute('aria-invalid');
	};

	const paint = () => {
		if (!viewEl) return;
		viewEl.textContent = '';

		if (view === 'raw') {
			const pre = document.createElement('pre');
			pre.className = 'rest-playground__json-output';
			pre.textContent = rawText;
			viewEl.appendChild(pre);
			return;
		}

		if (view === 'pretty') {
			const pre = document.createElement('pre');
			pre.className = 'rest-playground__json-output';
			pre.innerHTML = syntaxHighlight(filtered);
			viewEl.appendChild(pre);
			return;
		}

		viewEl.appendChild(
			createJsonTree(filtered, {
				label: filterActive ? 'Filtered response body' : 'Response body',
			}),
		);
	};

	const applyFilter = () => {
		const query = filterInput?.value.trim() ?? '';
		if (clearBtn) clearBtn.hidden = !query;

		if (!query) {
			filtered = data;
			filterActive = false;
			setStatus('');
			paint();
			return;
		}

		try {
			const matches = queryJson(data, query);
			filterActive = true;
			// A single hit is far more readable unwrapped; anything else stays an
			// array so the count and the shape agree.
			filtered =
				matches.length === 1 ? matches[0].value : matches.map((match) => match.value);
			setStatus(
				matches.length === 1 ? '1 match' : `${matches.length} matches`,
				matches.length === 0 ? 'warn' : 'none',
			);
		} catch (err) {
			filtered = data;
			filterActive = false;
			setStatus(err instanceof Error ? err.message : 'Invalid filter expression.', 'error');
		}

		paint();
	};

	/**
	 * Switch views and sync every control that depends on the active one.
	 *
	 * @param {string} next     - Target view.
	 * @param {boolean} [force] - Run even when already on that view, so the mount
	 * can use it to establish the initial control states.
	 */
	const setView = (next, force = false) => {
		if (!VIEWS.includes(next) || (next === view && !force)) return;
		view = next;
		storeView(view);

		container.querySelectorAll('.rest-playground__view-btn').forEach((btn) => {
			const active = /** @type {HTMLElement} */ (btn).dataset.view === view;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-pressed', String(active));
		});

		// Raw is the unmodified response body by definition, so filtering and the
		// tree controls have nothing to act on there.
		const treeOnly = view === 'tree';
		if (expandBtn) /** @type {HTMLButtonElement} */ (expandBtn).disabled = !treeOnly;
		if (collapseBtn) /** @type {HTMLButtonElement} */ (collapseBtn).disabled = !treeOnly;
		if (filterInput) {
			filterInput.disabled = view === 'raw';
			filterInput.title = view === 'raw' ? 'Filtering is unavailable in Raw view' : '';
		}
		if (view === 'raw' && filterActive) {
			setStatus('Filter not applied in Raw view', 'warn');
			paint();
		} else if (view !== 'raw' && filterActive) {
			// Re-runs the query and repaints in one pass.
			applyFilter();
		} else {
			paint();
		}
	};

	container.querySelectorAll('.rest-playground__view-btn').forEach((btn) => {
		btn.addEventListener('click', (event) => {
			setView(/** @type {HTMLElement} */ (event.currentTarget).dataset.view);
		});
	});

	let filterTimer = 0;
	filterInput?.addEventListener('input', () => {
		window.clearTimeout(filterTimer);
		filterTimer = window.setTimeout(applyFilter, FILTER_DEBOUNCE_MS);
	});

	filterInput?.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' || !filterInput.value) return;
		filterInput.value = '';
		window.clearTimeout(filterTimer);
		applyFilter();
	});

	clearBtn?.addEventListener('click', () => {
		if (!filterInput) return;
		filterInput.value = '';
		filterInput.focus();
		applyFilter();
	});

	expandBtn?.addEventListener('click', () => {
		const tree = viewEl?.querySelector('.rest-playground__json-tree');
		if (tree) expandAll(tree);
	});

	collapseBtn?.addEventListener('click', () => {
		const tree = viewEl?.querySelector('.rest-playground__json-tree');
		if (tree) collapseAll(tree);
	});

	// Paints the body and establishes control states for the restored view.
	setView(view, true);

	return { getVisibleText };
};

/**
 * Render a non-JSON body (HTML, XML, plain text) as escaped text.
 *
 * @param {HTMLElement} container - Element to render into.
 * @param {string} text           - Response body.
 * @returns {{ getVisibleText: () => string }}
 */
export const mountTextViewer = (container, text) => {
	container.innerHTML = `<pre class="rest-playground__json-output"><span class="json-string">${escapeHtml(text)}</span></pre>`;
	return { getVisibleText: () => text };
};
