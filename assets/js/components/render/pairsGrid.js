/**
 * WP REST API Playground — Enable/name/value grid.
 *
 * Used by the Headers tab and by the Custom Headers auth scheme, which share a
 * row shape so one renderer serves both.
 */

import { escapeHtml } from '../utils';

/**
 * @typedef {{enabled: boolean, name: string, value: string}} Pair
 */

/**
 * Normalise a row list and guarantee a blank trailing row to type into.
 *
 * The grid never renders an "add row" button: typing in the trailing row
 * appends a fresh one, which is how the same interaction works in Postman.
 *
 * @param {Pair[]} rows - Current rows.
 * @returns {Pair[]}
 */
export const withBlankRow = (rows) => {
	const list = (Array.isArray(rows) ? rows : []).map((row) => ({
		enabled: row?.enabled !== false,
		name: row?.name ?? '',
		value: row?.value ?? '',
	}));
	const last = list[list.length - 1];
	if (!last || last.name || last.value) {
		list.push({ enabled: true, name: '', value: '' });
	}
	return list;
};

/**
 * Build the grid markup.
 *
 * @param {Pair[]}  rows      - Rows to render (a blank trailing row is added).
 * @param {string}  idPrefix  - Prefix for row element ids, unique per mount.
 * @param {object}  [labels]  - Column and placeholder text.
 * @param {string}  [labels.namePlaceholder] - Heading and placeholder for the name column.
 * @param {string}  [labels.valuePlaceholder] - Heading and placeholder for the value column.
 * @returns {string}
 */
export const renderPairsGrid = (rows, idPrefix, labels = {}) => {
	const namePlaceholder = labels.namePlaceholder ?? 'Header name';
	const valuePlaceholder = labels.valuePlaceholder ?? 'Value';
	const safePrefix = escapeHtml(idPrefix);

	const body = withBlankRow(rows)
		.map((row, index) => {
			const isBlank = !row.name && !row.value;
			return `
				<div class="rest-playground__pair-row" data-pair-index="${index}">
					<input
						class="rest-playground__checkbox rest-playground__pair-enabled"
						type="checkbox"
						id="${safePrefix}-enabled-${index}"
						data-pair-field="enabled"
						${row.enabled ? 'checked' : ''}
						${isBlank ? 'disabled' : ''}
						aria-label="Enable this row"
					>
					<input
						class="rest-playground__field-input rest-playground__pair-input rest-playground__pair-input--name"
						type="text"
						id="${safePrefix}-name-${index}"
						data-pair-field="name"
						value="${escapeHtml(row.name)}"
						placeholder="${escapeHtml(namePlaceholder)}"
						spellcheck="false"
						autocomplete="off"
						aria-label="${escapeHtml(namePlaceholder)}"
					>
					<input
						class="rest-playground__field-input rest-playground__pair-input rest-playground__pair-input--value"
						type="text"
						id="${safePrefix}-value-${index}"
						data-pair-field="value"
						value="${escapeHtml(row.value)}"
						placeholder="${escapeHtml(valuePlaceholder)}"
						spellcheck="false"
						autocomplete="off"
						aria-label="${escapeHtml(valuePlaceholder)}"
					>
					<button
						class="rest-playground__pair-remove"
						type="button"
						id="${safePrefix}-remove-${index}"
						data-pair-field="remove"
						${isBlank ? 'disabled' : ''}
						aria-label="Remove this row"
						title="Remove"
					>
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
							<path d="M4 4l8 8M12 4l-8 8"/>
						</svg>
					</button>
				</div>
			`;
		})
		.join('');

	return `
		<div class="rest-playground__pairs" data-pairs-prefix="${safePrefix}">
			<div class="rest-playground__pair-head" aria-hidden="true">
				<span></span>
				<span>${escapeHtml(namePlaceholder)}</span>
				<span>${escapeHtml(valuePlaceholder)}</span>
				<span></span>
			</div>
			${body}
		</div>
	`;
};

/**
 * Wire a rendered grid to a change callback.
 *
 * Edits are read straight back out of the DOM rather than tracked incrementally,
 * so the callback always receives the grid's full current contents. Rows that
 * end up entirely blank are dropped before the callback sees them — except the
 * trailing one, which withBlankRow() re-adds on the next render.
 *
 * @param {HTMLElement} container - Element containing the grid.
 * @param {(rows: Pair[]) => void} onChange - Receives the updated rows.
 * @param {() => void} rerender - Called when the row count changes.
 */
export const bindPairsGrid = (container, onChange, rerender) => {
	const grid = container.querySelector('.rest-playground__pairs');
	if (!grid) return;

	/**
	 * Read the grid's current contents straight out of the DOM.
	 *
	 * @returns {Pair[]}
	 */
	const readRows = () =>
		Array.from(grid.querySelectorAll('.rest-playground__pair-row'))
			.map((row) => ({
				enabled:
					/** @type {HTMLInputElement} */ (
						row.querySelector('[data-pair-field="enabled"]')
					)?.checked !== false,
				name:
					/** @type {HTMLInputElement} */ (row.querySelector('[data-pair-field="name"]'))
						?.value ?? '',
				value:
					/** @type {HTMLInputElement} */ (row.querySelector('[data-pair-field="value"]'))
						?.value ?? '',
			}))
			.filter((row) => row.name || row.value);

	/**
	 * Re-render without dropping the caret.
	 *
	 * Rebuilding the grid replaces the focused input, which would eject the user
	 * mid-word on the keystroke that creates a new row. Element ids are stable
	 * across renders, so the caret can be put back exactly where it was.
	 */
	const rerenderKeepingFocus = () => {
		const active = /** @type {HTMLInputElement|null} */ (container.ownerDocument.activeElement);
		const id = active?.id ?? '';
		const start = active?.selectionStart ?? null;
		const end = active?.selectionEnd ?? null;

		rerender();

		if (!id) return;
		const restored = /** @type {HTMLInputElement|null} */ (document.getElementById(id));
		if (!restored) return;
		restored.focus();
		if (start !== null && restored.setSelectionRange) {
			try {
				restored.setSelectionRange(start, end);
			} catch {
				// Not a text-like input — focus alone is enough.
			}
		}
	};

	grid.addEventListener('input', (event) => {
		const field = /** @type {HTMLElement} */ (event.target).dataset?.pairField;
		if (field !== 'name' && field !== 'value') return;

		const rows = readRows();
		onChange(rows);

		// Typing into the trailing row turns it into a real one, which needs a
		// new blank row beneath it and its controls enabled.
		const rowCount = grid.querySelectorAll('.rest-playground__pair-row').length;
		if (rows.length >= rowCount) rerenderKeepingFocus();
	});

	grid.addEventListener('change', (event) => {
		if (/** @type {HTMLElement} */ (event.target).dataset?.pairField !== 'enabled') return;
		onChange(readRows());
	});

	grid.addEventListener('click', (event) => {
		const button = /** @type {HTMLElement} */ (event.target).closest?.(
			'[data-pair-field="remove"]',
		);
		if (!button) return;

		const row = button.closest('.rest-playground__pair-row');
		const index = Number(row?.dataset.pairIndex ?? -1);

		row?.remove();
		onChange(readRows());
		rerender();

		// Deleting by keyboard destroys the focused button. Rows shift up, so the
		// same index is now the row that followed; when the last real row goes,
		// that index belongs to the disabled blank row and focus moves back one
		// instead. Without this, Delete drops the user to the top of the document.
		const prefix = grid.dataset.pairsPrefix ?? '';
		const at = (i) =>
			/** @type {HTMLButtonElement|null} */ (
				container.ownerDocument.getElementById(`${prefix}-remove-${i}`)
			);
		const next = at(index);
		const previous = at(index - 1);
		if (next && !next.disabled) {
			next.focus();
		} else if (previous && !previous.disabled) {
			previous.focus();
		} else {
			// Deleting the only real row leaves nothing but the disabled blank
			// one, so put the caret in its name field — the user is most likely
			// about to type a replacement.
			container.ownerDocument.getElementById(`${prefix}-name-0`)?.focus();
		}
	});
};
