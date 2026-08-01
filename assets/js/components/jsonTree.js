/**
 * WP REST API Playground — Collapsible JSON tree renderer.
 *
 * Built with DOM APIs rather than innerHTML: response bodies are untrusted, and
 * textContent removes the escaping burden entirely.
 *
 * Keyboard model follows the ARIA tree pattern. The row is the treeitem and the
 * only focusable thing in it, and a roving tabindex keeps exactly one row in the
 * page tab order — so a 3,000-row response costs one Tab stop, not 6,000. The
 * chevron and the copy-path affordance are decorative spans driven by pointer
 * events plus their keyboard equivalents (Left/Right, and "c" for copy).
 *
 * Two things keep large payloads responsive — a node's children are only built
 * the first time it is expanded, and containers with more children than
 * CHUNK_SIZE reveal them a chunk at a time.
 */

import { formatPath } from './jsonPath';

/** Children rendered per "Show more" step. */
const CHUNK_SIZE = 200;

/** Containers up to this depth start expanded, if they are also small enough. */
const AUTO_EXPAND_DEPTH = 2;

/** A container with more children than this starts collapsed regardless of depth. */
const AUTO_EXPAND_MAX_CHILDREN = 50;

/** Total rows auto-expansion may create before it stops opening further levels. */
const AUTO_EXPAND_ROW_BUDGET = 400;

/** Strings longer than this get the CSS line clamp and a click-to-expand hint. */
const CLIP_THRESHOLD = 180;

/** Ceiling on rows created by "Expand all", to keep it from locking the tab up. */
const EXPAND_ALL_BUDGET = 5000;

/** Per-node render data, keyed by the node element. */
const nodeData = new WeakMap();

/** The row currently holding tabindex="0", keyed by the [role=tree] element. */
const activeRow = new WeakMap();

const isContainer = (value) => value !== null && typeof value === 'object';

/**
 * List a container's children as [key, value] pairs.
 *
 * @param {unknown} value - Value to inspect.
 * @returns {Array<[string|number, unknown]>}
 */
const childEntries = (value) => {
	if (Array.isArray(value)) return value.map((item, index) => [index, item]);
	if (isContainer(value)) return Object.keys(value).map((key) => [key, value[key]]);
	return [];
};

/**
 * Create an element with a class and optional text.
 *
 * @param {string} tag        - Tag name.
 * @param {string} className  - Class attribute.
 * @param {string} [text]     - Text content.
 * @returns {HTMLElement}
 */
const el = (tag, className, text) => {
	const node = document.createElement(tag);
	node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
};

/**
 * CSS modifier for a scalar's type, matching the existing .json-* colours.
 *
 * @param {unknown} value - Scalar value.
 * @returns {string}
 */
const scalarClass = (value) => {
	if (value === null) return 'json-null';
	if (typeof value === 'string') return 'json-string';
	if (typeof value === 'number') return 'json-number';
	if (typeof value === 'boolean') return 'json-boolean';
	return 'json-null';
};

/**
 * Display text for a scalar. Strings keep their quotes so the output still
 * reads as JSON.
 *
 * @param {unknown} value - Scalar value.
 * @returns {string}
 */
const scalarText = (value) => {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (typeof value === 'string') return JSON.stringify(value);
	return String(value);
};

/**
 * Short inline summary shown while a container is collapsed, e.g.
 * `{6} id, date, slug…`.
 *
 * @param {unknown} value - Container value.
 * @returns {string}
 */
const previewText = (value) => {
	const entries = childEntries(value);
	if (!entries.length) return '';

	const parts = entries.slice(0, 3).map(([key, child]) => {
		if (Array.isArray(value)) {
			if (Array.isArray(child)) return `[${child.length}]`;
			if (isContainer(child)) return `{${Object.keys(child).length}}`;
			const text = scalarText(child);
			return text.length > 24 ? `${text.slice(0, 24)}…` : text;
		}
		return String(key);
	});

	return parts.join(', ') + (entries.length > 3 ? '…' : '');
};

// ---------------------------------------------------------------------------
// Structure helpers
// ---------------------------------------------------------------------------

const rowOf = (node) => node?.querySelector(':scope > .rest-playground__json-row') ?? null;
const nodeOf = (row) => row.parentElement;
const groupOf = (node) => node.querySelector(':scope > .rest-playground__json-children');
const treeOf = (element) => element.closest('[role="tree"]');
const isOpen = (node) => node.classList.contains('is-open');
const isExpandable = (row) => row.hasAttribute('aria-expanded');

/**
 * Child node elements of a container node, including the trailing "show more"
 * row so it takes part in arrow navigation like any other row.
 *
 * @param {HTMLElement} node - Node element.
 * @returns {HTMLElement[]}
 */
const childNodesOf = (node) => {
	const group = groupOf(node);
	return group ? [...group.querySelectorAll(':scope > .rest-playground__json-node')] : [];
};

/**
 * The deepest row reachable from `node` without opening anything.
 *
 * @param {HTMLElement} node - Node element to descend from.
 * @returns {HTMLElement}
 */
const lastVisibleNode = (node) => {
	let current = node;
	while (isOpen(current)) {
		const kids = childNodesOf(current);
		if (!kids.length) break;
		current = kids[kids.length - 1];
	}
	return current;
};

/**
 * Row after `row` in visual order, skipping collapsed subtrees.
 *
 * @param {HTMLElement} row - Starting row.
 * @returns {HTMLElement|null}
 */
const nextVisibleRow = (row) => {
	const node = nodeOf(row);
	if (isOpen(node)) {
		const kids = childNodesOf(node);
		if (kids.length) return rowOf(kids[0]);
	}

	let current = node;
	while (current) {
		const sibling = current.nextElementSibling;
		if (sibling?.classList.contains('rest-playground__json-node')) return rowOf(sibling);
		const group = current.parentElement;
		current = group?.classList.contains('rest-playground__json-children')
			? group.parentElement
			: null;
	}
	return null;
};

/**
 * Row before `row` in visual order.
 *
 * @param {HTMLElement} row - Starting row.
 * @returns {HTMLElement|null}
 */
const previousVisibleRow = (row) => {
	const node = nodeOf(row);
	const sibling = node.previousElementSibling;
	if (sibling?.classList.contains('rest-playground__json-node')) {
		return rowOf(lastVisibleNode(sibling));
	}
	const group = node.parentElement;
	return group?.classList.contains('rest-playground__json-children')
		? rowOf(group.parentElement)
		: null;
};

/**
 * Row of the enclosing container, if any.
 *
 * @param {HTMLElement} row - Starting row.
 * @returns {HTMLElement|null}
 */
const parentRowOf = (row) => {
	const group = nodeOf(row).parentElement;
	return group?.classList.contains('rest-playground__json-children')
		? rowOf(group.parentElement)
		: null;
};

// ---------------------------------------------------------------------------
// Focus handling
// ---------------------------------------------------------------------------

/**
 * Move the single tab stop to `row`, optionally focusing it.
 *
 * @param {HTMLElement} tree    - The [role=tree] element.
 * @param {HTMLElement} row     - Row to make current.
 * @param {boolean} [focus]     - Whether to also move DOM focus.
 */
const setRovingFocus = (tree, row, focus = true) => {
	if (!tree || !row) return;
	const previous = activeRow.get(tree);
	if (previous && previous !== row && previous.isConnected) previous.tabIndex = -1;
	row.tabIndex = 0;
	activeRow.set(tree, row);
	if (focus) row.focus();
};

/**
 * Announce a transient message through the tree's live region.
 *
 * @param {HTMLElement} tree    - The [role=tree] element.
 * @param {string} message      - Text to announce.
 */
const announce = (tree, message) => {
	const live = tree.parentElement?.querySelector('.rest-playground__json-live');
	if (live) live.textContent = message;
};

// ---------------------------------------------------------------------------
// Row construction
// ---------------------------------------------------------------------------

/**
 * Append the key portion of a row: `"slug":` for objects, `0:` for arrays.
 *
 * @param {HTMLElement} row              - Row element.
 * @param {string|number|null} key       - Property key or array index.
 * @param {boolean} isIndex              - Whether the key is an array index.
 */
const appendKey = (row, key, isIndex) => {
	if (key === null) return;
	row.appendChild(
		el(
			'span',
			isIndex ? 'rest-playground__json-index' : 'rest-playground__json-key json-key',
			isIndex ? String(key) : JSON.stringify(String(key)),
		),
	);
	row.appendChild(el('span', 'rest-playground__json-colon', ':'));
};

/**
 * Append the value portion of a row — either a scalar or a collapsed-state
 * summary for a container.
 *
 * Long strings are rendered in full and clamped by CSS rather than truncated in
 * JS, so assistive technology always reads the whole value while sighted users
 * get a three-line preview they can click or activate to open.
 *
 * @param {HTMLElement} row  - Row element.
 * @param {unknown} value    - The node's value.
 */
const appendValue = (row, value) => {
	if (!isContainer(value)) {
		const text = scalarText(value);
		const span = el('span', `rest-playground__json-value ${scalarClass(value)}`, text);

		if (typeof value === 'string' && text.length > CLIP_THRESHOLD) {
			span.classList.add('is-clipped');
			span.title = 'Show the full value';
		}

		row.appendChild(span);
		return;
	}

	const entries = childEntries(value);
	const bracket = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
	row.appendChild(el('span', 'rest-playground__json-summary', bracket));

	const preview = previewText(value);
	if (preview) row.appendChild(el('span', 'rest-playground__json-preview', preview));
};

/**
 * Build one tree node (its row plus a lazily-filled group).
 *
 * @param {object} spec                      - Node description.
 * @param {string|number|null} spec.key       - Property key, or null for the root.
 * @param {unknown} spec.value                - The node's value.
 * @param {Array<string|number>} spec.path    - Path from the document root.
 * @param {number} spec.depth                 - Nesting depth, used for indentation.
 * @param {number} [spec.posInSet]            - 1-based position among siblings.
 * @param {number} [spec.setSize]             - Total siblings, including unrendered ones.
 * @returns {HTMLElement}
 */
const buildNode = ({ key, value, path, depth, posInSet, setSize }) => {
	const node = el('div', 'rest-playground__json-node');
	const row = el('div', 'rest-playground__json-row');

	row.setAttribute('role', 'treeitem');
	row.tabIndex = -1;
	row.setAttribute('aria-level', String(depth + 1));
	if (posInSet) {
		row.setAttribute('aria-posinset', String(posInSet));
		row.setAttribute('aria-setsize', String(setSize));
	}
	row.style.setProperty('--rest-playground-json-depth', String(depth));

	const entries = isContainer(value) ? childEntries(value) : [];
	const expandable = entries.length > 0;
	if (expandable) row.setAttribute('aria-expanded', 'false');

	// Chevron and copy affordance are decorative: the row carries the semantics,
	// and both actions have keyboard equivalents on the focused row.
	const marker = el(
		'span',
		expandable ? 'rest-playground__json-toggle' : 'rest-playground__json-spacer',
	);
	marker.setAttribute('aria-hidden', 'true');
	if (expandable) marker.dataset.action = 'toggle';
	row.appendChild(marker);

	appendKey(row, key, typeof key === 'number');
	appendValue(row, value);

	const copyPath = el('span', 'rest-playground__json-path-btn');
	copyPath.setAttribute('aria-hidden', 'true');
	copyPath.dataset.action = 'copy-path';
	copyPath.title = 'Copy JSON path (c)';
	row.appendChild(copyPath);

	node.appendChild(row);

	if (expandable) {
		const group = el('div', 'rest-playground__json-children');
		group.setAttribute('role', 'group');
		group.hidden = true;
		node.appendChild(group);
	}

	nodeData.set(node, { value, path, depth, rendered: 0, built: !expandable });
	return node;
};

/**
 * Build the trailing "show more" row for a chunked container.
 *
 * @param {number} remaining - Rows the next step will reveal.
 * @param {number} total     - Total children in the container.
 * @param {number} depth     - Depth the row sits at.
 * @returns {HTMLElement}
 */
const buildMoreNode = (remaining, total, depth) => {
	const node = el('div', 'rest-playground__json-node rest-playground__json-node--more');
	const row = el('div', 'rest-playground__json-row rest-playground__json-more');

	row.setAttribute('role', 'treeitem');
	row.tabIndex = -1;
	row.setAttribute('aria-level', String(depth + 1));
	row.dataset.action = 'show-more';
	row.style.setProperty('--rest-playground-json-depth', String(depth));

	const spacer = el('span', 'rest-playground__json-spacer');
	spacer.setAttribute('aria-hidden', 'true');
	row.appendChild(spacer);
	row.appendChild(
		el('span', 'rest-playground__json-more-label', `Show ${remaining} more of ${total}`),
	);

	node.appendChild(row);
	return node;
};

/**
 * Render the next chunk of a node's children into its group.
 *
 * @param {HTMLElement} node - Node element previously built by buildNode().
 */
const renderChunk = (node) => {
	const data = nodeData.get(node);
	const group = groupOf(node);
	if (!data || !group) return;

	const entries = childEntries(data.value);
	group.querySelector(':scope > .rest-playground__json-node--more')?.remove();

	const end = Math.min(data.rendered + CHUNK_SIZE, entries.length);
	const fragment = document.createDocumentFragment();

	for (let i = data.rendered; i < end; i += 1) {
		const [key, value] = entries[i];
		fragment.appendChild(
			buildNode({
				key,
				value,
				path: [...data.path, key],
				depth: data.depth + 1,
				posInSet: i + 1,
				setSize: entries.length,
			}),
		);
	}

	group.appendChild(fragment);
	data.rendered = end;
	data.built = true;

	if (end < entries.length) {
		group.appendChild(
			buildMoreNode(
				Math.min(CHUNK_SIZE, entries.length - end),
				entries.length,
				data.depth + 1,
			),
		);
	}
};

/**
 * Expand or collapse a node, building its children on first expand.
 *
 * @param {HTMLElement} node    - Node element.
 * @param {boolean} expanded    - Target state.
 */
const setExpanded = (node, expanded) => {
	const data = nodeData.get(node);
	const group = groupOf(node);
	const row = rowOf(node);
	if (!data || !group || !row || !isExpandable(row)) return;

	if (expanded && !data.built) renderChunk(node);

	group.hidden = !expanded;
	node.classList.toggle('is-open', expanded);
	row.setAttribute('aria-expanded', expanded ? 'true' : 'false');

	// Collapsing a subtree that holds the tab stop would strand it on a hidden
	// row, so pull it back up to the node that just closed.
	if (expanded) return;
	const tree = treeOf(row);
	const current = tree ? activeRow.get(tree) : null;
	if (current && current !== row && node.contains(current)) {
		setRovingFocus(tree, row, node.contains(row.ownerDocument.activeElement));
	}
};

/**
 * Expand nodes breadth-first from `root` until the row budget runs out.
 *
 * @param {HTMLElement} root - Tree root or a node element.
 */
const expandAll = (root) => {
	const queue = [...root.querySelectorAll('.rest-playground__json-node')];

	// Nodes already rendered are in the initial sweep and would be queued a
	// second time by their parent. Without this guard the duplicates multiply
	// per level, and they cost no budget because they create no new rows.
	const seen = new Set(queue);
	let budget = EXPAND_ALL_BUDGET;

	while (queue.length && budget > 0) {
		const node = queue.shift();
		const group = groupOf(node);

		if (group) {
			const before = group.querySelectorAll(':scope > .rest-playground__json-node').length;
			setExpanded(node, true);
			const rows = group.querySelectorAll(':scope > .rest-playground__json-node');
			budget -= rows.length - before;
			rows.forEach((row) => {
				if (seen.has(row)) return;
				seen.add(row);
				queue.push(row);
			});
		}
	}
};

/**
 * Collapse every expanded node except the tree root.
 *
 * @param {HTMLElement} root - Tree root.
 */
const collapseAll = (root) => {
	const nodes = [...root.querySelectorAll('.rest-playground__json-node.is-open')];
	nodes.forEach((node, index) => {
		if (index === 0 && node.parentElement === root) return;
		setExpanded(node, false);
	});
};

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

/**
 * Toggle the CSS line clamp on a long string value.
 *
 * @param {HTMLElement} valueEl - The clipped value element.
 */
const toggleClamp = (valueEl) => {
	const expanded = valueEl.classList.toggle('is-expanded');
	valueEl.title = expanded ? 'Collapse the value' : 'Show the full value';
};

/**
 * Copy the focused row's JSONPath and announce it.
 *
 * @param {HTMLElement} tree - The [role=tree] element.
 * @param {HTMLElement} row  - Row to copy the path of.
 */
const copyPathOf = (tree, row) => {
	const data = nodeData.get(nodeOf(row));
	if (!data) return;
	const path = formatPath(data.path);
	navigator.clipboard?.writeText(path).then(() => {
		row.classList.add('is-copied');
		setTimeout(() => row.classList.remove('is-copied'), 1500);
		announce(tree, `Copied ${path}`);
	});
};

/**
 * Reveal the next chunk and move the tab stop onto the first new row.
 *
 * @param {HTMLElement} tree    - The [role=tree] element.
 * @param {HTMLElement} moreRow - The "show more" row that was activated.
 */
const revealMore = (tree, moreRow) => {
	const group = nodeOf(moreRow).parentElement;
	const owner = group?.parentElement;
	const data = owner ? nodeData.get(owner) : null;
	if (!data) return;

	const firstNew = data.rendered;
	renderChunk(owner);
	const kids = childNodesOf(owner);
	const target = kids[firstNew] ?? kids[kids.length - 1];
	if (target) setRovingFocus(tree, rowOf(target));
};

/**
 * Enter/Space and click share one meaning: act on this row.
 *
 * @param {HTMLElement} tree - The [role=tree] element.
 * @param {HTMLElement} row  - Row to activate.
 */
const activateRow = (tree, row) => {
	if (row.dataset.action === 'show-more') {
		revealMore(tree, row);
		return;
	}
	if (isExpandable(row)) {
		const node = nodeOf(row);
		setExpanded(node, !isOpen(node));
		return;
	}
	const clipped = row.querySelector('.rest-playground__json-value.is-clipped');
	if (clipped) toggleClamp(clipped);
};

/**
 * Expand every sibling at the focused row's level, the ARIA tree "*" shortcut.
 *
 * @param {HTMLElement} node - Node whose siblings should open.
 */
const expandSiblings = (node) => {
	const group = node.parentElement;
	const siblings = group?.classList.contains('rest-playground__json-children')
		? childNodesOf(group.parentElement)
		: [node];
	siblings.forEach((sibling) => setExpanded(sibling, true));
};

/**
 * Wire pointer and keyboard handling for a tree. One listener each, delegated,
 * so lazily-added rows need no wiring of their own.
 *
 * @param {HTMLElement} tree - The [role=tree] element.
 */
const attachHandlers = (tree) => {
	tree.addEventListener('click', (event) => {
		const { target } = /** @type {{ target: HTMLElement }} */ (event);
		const row = target.closest('.rest-playground__json-row');
		if (!row) return;

		setRovingFocus(tree, row);

		const action = target.closest('[data-action]')?.dataset.action;
		if (action === 'toggle') {
			const node = nodeOf(row);
			setExpanded(node, !isOpen(node));
			return;
		}
		if (action === 'copy-path') {
			copyPathOf(tree, row);
			return;
		}
		if (action === 'show-more') {
			revealMore(tree, row);
			return;
		}
		const clipped = target.closest('.rest-playground__json-value.is-clipped');
		if (clipped) toggleClamp(clipped);
	});

	tree.addEventListener('keydown', (event) => {
		const { target } = /** @type {{ target: HTMLElement }} */ (event);
		const row = target.closest('.rest-playground__json-row');
		if (!row) return;

		const node = nodeOf(row);
		const expandable = isExpandable(row);
		let handled = true;

		switch (event.key) {
			case 'ArrowDown': {
				const next = nextVisibleRow(row);
				if (next) setRovingFocus(tree, next);
				break;
			}
			case 'ArrowUp': {
				const previous = previousVisibleRow(row);
				if (previous) setRovingFocus(tree, previous);
				break;
			}
			case 'ArrowRight': {
				if (expandable && !isOpen(node)) {
					setExpanded(node, true);
				} else if (expandable) {
					const kids = childNodesOf(node);
					if (kids.length) setRovingFocus(tree, rowOf(kids[0]));
				}
				break;
			}
			case 'ArrowLeft': {
				if (expandable && isOpen(node)) {
					setExpanded(node, false);
				} else {
					const parent = parentRowOf(row);
					if (parent) setRovingFocus(tree, parent);
				}
				break;
			}
			case 'Home': {
				const first = rowOf(tree.firstElementChild);
				if (first) setRovingFocus(tree, first);
				break;
			}
			case 'End': {
				const last = rowOf(lastVisibleNode(tree.firstElementChild));
				if (last) setRovingFocus(tree, last);
				break;
			}
			case 'Enter':
			case ' ':
				activateRow(tree, row);
				break;
			case '*':
				expandSiblings(node);
				break;
			case 'c':
			case 'C':
				copyPathOf(tree, row);
				break;
			default:
				handled = false;
		}

		if (handled) event.preventDefault();
	});
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an interactive JSON tree for a value.
 *
 * @param {unknown} value                            - Parsed JSON value to render.
 * @param {object} [options]                         - Rendering options.
 * @param {Array<string|number>} [options.basePath]  - Path prefix for copied paths.
 * @param {string} [options.label]                   - Accessible name for the tree.
 * @returns {HTMLElement} Wrapper holding the live region and the tree.
 */
export const createJsonTree = (value, { basePath = [], label = 'Response body' } = {}) => {
	const wrap = el('div', 'rest-playground__json-tree-wrap');

	// Outside the tree element: role=tree may only contain treeitem and group.
	const live = el('div', 'rest-playground__json-live');
	live.setAttribute('role', 'status');
	live.setAttribute('aria-live', 'polite');
	wrap.appendChild(live);

	const tree = el('div', 'rest-playground__json-tree');
	tree.setAttribute('role', 'tree');
	tree.setAttribute('aria-label', label);
	wrap.appendChild(tree);

	const rootNode = buildNode({ key: null, value, path: basePath, depth: 0 });
	tree.appendChild(rootNode);

	if (isContainer(value)) {
		setExpanded(rootNode, true);

		// Open the first couple of levels so the shape is visible without clicking.
		// A level opens only when every sibling on it fits the remaining budget,
		// which keeps the result uniform and stops a 100-post response from
		// rendering thousands of rows nobody has asked for yet.
		let budget = AUTO_EXPAND_ROW_BUDGET - childEntries(value).length;

		const openShallow = (parent, depth) => {
			if (depth > AUTO_EXPAND_DEPTH || budget <= 0) return;

			const candidates = childNodesOf(parent)
				.map((child) => ({ child, data: nodeData.get(child) }))
				.filter(({ data }) => data && isContainer(data.value))
				.map((entry) => ({ ...entry, size: childEntries(entry.data.value).length }))
				.filter(({ size }) => size > 0 && size <= AUTO_EXPAND_MAX_CHILDREN);

			const cost = candidates.reduce((total, entry) => total + entry.size, 0);
			if (cost > budget) return;

			budget -= cost;
			candidates.forEach(({ child }) => {
				setExpanded(child, true);
				openShallow(child, depth + 1);
			});
		};
		openShallow(rootNode, 1);
	}

	// The root row is the tree's single tab stop until the user moves it.
	setRovingFocus(tree, rowOf(rootNode), false);
	attachHandlers(tree);

	return wrap;
};

export { expandAll, collapseAll };
