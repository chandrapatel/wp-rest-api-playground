/**
 * WP REST API Playground — Headers tab.
 *
 * These headers apply to every request regardless of the selected credential,
 * and are merged after the auth headers so an entry here can override one.
 */

import { state } from '../state';
import { renderPairsGrid, bindPairsGrid } from './pairsGrid';

/** Called after an edit so the tab badge can refresh. */
let onHeadersChanged = () => {};

/**
 * Register the callback fired whenever the header list changes.
 *
 * @param {() => void} callback - Invoked after every edit.
 */
export const setHeadersChangeHandler = (callback) => {
	onHeadersChanged = callback;
};

/**
 * Render the Headers tab into its pane and wire the grid.
 */
export const renderHeadersPanel = () => {
	const pane = document.getElementById('tab-pane-headers');
	if (!pane) return;

	pane.innerHTML = `
		<div class="rest-playground__headers-panel">
			<p class="rest-playground__field-desc rest-playground__headers-intro">
				Sent with every request. These are applied after the credential from the Auth tab,
				so naming the same header here replaces the one it would have sent — matching is
				case-insensitive. <code>Content-Type: application/json</code> is added automatically
				and can be overridden the same way; <code>X-WP-Nonce</code> is added only for
				profiles that authenticate by your login cookie.
			</p>
			${renderPairsGrid(state.customHeaders, 'custom-header')}
		</div>
	`;

	bindPairsGrid(
		pane,
		(rows) => {
			state.customHeaders = rows;
			onHeadersChanged();
		},
		renderHeadersPanel,
	);
};
