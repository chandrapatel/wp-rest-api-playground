/**
 * WP REST API Playground — Individual request parameter field renderer.
 */

import { escapeHtml } from '../utils';

/**
 * Build the HTML for a single request parameter field.
 *
 * @param {string} name - The parameter name.
 * @param {Record<string, unknown>} arg - The parameter schema descriptor.
 * @param {'path'|'query'|'body'} context - Where the parameter is sent.
 * @returns {string}
 */
export const renderField = (name, arg, context) => {
	const type = arg.type ?? 'string';
	const required = !!arg.required;
	const description = arg.description ? String(arg.description) : '';
	const defaultVal = arg.default ?? '';
	const enumVals = Array.isArray(arg.enum) ? arg.enum : null;

	const id = `field-${context}-${name}`;

	let inputHtml;

	if (enumVals) {
		const options = enumVals
			.map(
				(v) =>
					`<option value="${escapeHtml(String(v))}"${v === defaultVal ? ' selected' : ''}>${escapeHtml(String(v))}</option>`,
			)
			.join('');
		inputHtml = `
			<select class="rest-playground__field-select" id="${id}" name="${name}" data-context="${context}">
				<option value="">— Select —</option>
				${options}
			</select>
		`;
	} else if (type === 'boolean') {
		return `
			<div class="rest-playground__field">
				<div class="rest-playground__checkbox-row">
					<input
						class="rest-playground__checkbox"
						type="checkbox"
						id="${id}"
						name="${name}"
						data-context="${context}"
						data-type="${type}"
						${defaultVal === true ? 'checked' : ''}
					>
					<label class="rest-playground__field-name" for="${id}">
						${escapeHtml(name)}
						${required ? '<span class="rest-playground__field-required">*</span>' : ''}
						<span class="rest-playground__field-type">boolean</span>
					</label>
				</div>
				${description ? `<p class="rest-playground__field-desc">${escapeHtml(description)}</p>` : ''}
			</div>
		`;
	} else if (type === 'integer' || type === 'number') {
		const min = arg.minimum != null ? ` min="${Number(arg.minimum)}"` : '';
		const max = arg.maximum != null ? ` max="${Number(arg.maximum)}"` : '';
		inputHtml = `
			<input
				class="rest-playground__field-input"
				type="number"
				id="${id}"
				name="${name}"
				data-context="${context}"
				data-type="${type}"
				placeholder="${escapeHtml(String(defaultVal))}"
				${min}${max}
			>
		`;
	} else if (type === 'array' || type === 'object') {
		inputHtml = `
			<textarea
				class="rest-playground__field-input rest-playground__field-textarea"
				id="${id}"
				name="${name}"
				data-context="${context}"
				data-type="${type}"
				rows="3"
				spellcheck="false"
				placeholder="${type === 'array' ? '[]' : '{}'}"
			></textarea>
		`;
	} else {
		inputHtml = `
			<input
				class="rest-playground__field-input"
				type="text"
				id="${id}"
				name="${name}"
				data-context="${context}"
				data-type="${type}"
				placeholder="${escapeHtml(String(defaultVal))}"
			>
		`;
	}

	return `
		<div class="rest-playground__field">
			<div class="rest-playground__field-label-row">
				<label class="rest-playground__field-name" for="${id}">
					${escapeHtml(name)}
					${required ? '<span class="rest-playground__field-required">*</span>' : ''}
				</label>
				<span class="rest-playground__field-type">${escapeHtml(String(type))}</span>
			</div>
			${inputHtml}
			${description ? `<p class="rest-playground__field-desc">${escapeHtml(description)}</p>` : ''}
		</div>
	`;
};
