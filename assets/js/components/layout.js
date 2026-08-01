/**
 * WP REST API Playground — Panel layout.
 *
 * Drag, keyboard-resize and collapse the two column dividers. Widths are
 * written to --rest-playground-sidebar-w / --rest-playground-response-w on
 * <html>, which is all the three-column grid in base.css reads, and persisted
 * to localStorage so the layout survives a refresh or a return visit.
 *
 * Credentials live in sessionStorage (see auth.js) — layout deliberately does
 * not, since a panel size is a durable preference rather than a secret.
 */

const STORAGE_KEY = 'wp-rest-playground-layout';
const MOBILE_QUERY = '(max-width: 900px)';
const KEY_STEP = 16;
const KEY_STEP_FINE = 1;

/**
 * @typedef {object} PanelConfig
 * @property {string} key       Storage key, and lookup key into `els`.
 * @property {string} prop      Custom property carrying this panel's width.
 * @property {string} minVar    Custom property holding its minimum width.
 * @property {string} maxVar    Custom property holding its maximum width.
 * @property {string} panelId   Element id of the panel itself.
 * @property {string} resizerId Element id of its separator.
 * @property {string} buttonId  Element id of its collapse toggle.
 * @property {number} direction Sign turning rightward pointer travel into width.
 */

/**
 * Resolved pixel limits — one {min, max} pair per panel key, plus the floor the
 * main panel is guaranteed.
 *
 * @typedef {Record<string, {min: number, max: number}> & {mainMin: number}} Limits
 */

/**
 * `direction` is the sign that turns a rightward pointer movement into a width
 * change: the sidebar grows as the divider moves right, the response panel
 * shrinks.
 *
 * @type {PanelConfig[]}
 */
const PANELS = [
	{
		key: 'sidebar',
		prop: '--rest-playground-sidebar-w',
		minVar: '--rest-playground-sidebar-min',
		maxVar: '--rest-playground-sidebar-max',
		panelId: 'rest-playground-sidebar',
		resizerId: 'resizer-sidebar',
		buttonId: 'collapse-sidebar',
		direction: 1,
	},
	{
		key: 'response',
		prop: '--rest-playground-response-w',
		minVar: '--rest-playground-response-min',
		maxVar: '--rest-playground-response-max',
		panelId: 'rest-playground-response',
		resizerId: 'resizer-response',
		buttonId: 'collapse-response',
		direction: -1,
	},
];

const root = document.documentElement;

/** @type {Record<string, {width?: number, collapsed?: boolean}>} */
let entries = {};

/** @type {Record<string, {panel: HTMLElement, resizer: HTMLElement, button: HTMLElement}>} */
const els = {};

/**
 * Live drag gesture. `lim` is resolved once at pointerdown rather than per
 * move, and is read again by flush() and endDrag().
 *
 * @type {{panel: PanelConfig, startX: number, startWidth: number, next: number, lim: Limits}|null}
 */
let drag = null;
let frame = 0;
let resizeFrame = 0;

const isWidth = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Accept only the keys and value shapes we wrote; anything else is dropped so a
 * hand-edited or stale payload can never break the layout.
 *
 * @param {unknown} raw - Parsed localStorage payload.
 * @returns {Record<string, {width?: number, collapsed?: boolean}>}
 */
const sanitize = (raw) => {
	const clean = {};
	if (!raw || typeof raw !== 'object') return clean;

	PANELS.forEach(({ key }) => {
		const entry = raw[key];
		if (!entry || typeof entry !== 'object') return;

		const next = {};
		if (isWidth(entry.width)) next.width = Math.round(entry.width);
		if (entry.collapsed === true) next.collapsed = true;
		if (Object.keys(next).length) clean[key] = next;
	});

	return clean;
};

const readLayout = () => {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return {};

		const clean = sanitize(JSON.parse(stored));
		if (!Object.keys(clean).length) localStorage.removeItem(STORAGE_KEY);
		return clean;
	} catch {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore — storage blocked entirely.
		}
		return {};
	}
};

const persist = () => {
	try {
		if (!Object.keys(entries).length) {
			localStorage.removeItem(STORAGE_KEY);
			return;
		}
		localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch {
		// ignore — storage quota exceeded or blocked.
	}
};

const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;

// Dragging right must grow the *leading* panel, whichever side that is.
const flowSign = () => (root.dir === 'rtl' ? -1 : 1);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Resolve the resize limits from the CSS custom properties so the numbers stay
 * defined in one place (variables.css).
 *
 * @returns {Limits}
 */
const limits = () => {
	const styles = window.getComputedStyle(root);
	const px = (name, fallback) => {
		const parsed = parseFloat(styles.getPropertyValue(name));
		return Number.isFinite(parsed) ? parsed : fallback;
	};

	const resolved = { mainMin: px('--rest-playground-main-min', 360) };
	PANELS.forEach((panel) => {
		resolved[panel.key] = {
			min: px(panel.minVar, 200),
			max: px(panel.maxVar, 640),
		};
	});

	return resolved;
};

const measure = (panel) => Math.round(els[panel.key].panel.getBoundingClientRect().width);

/**
 * Current width in pixels — an explicit stored value, 0 when collapsed, or
 * whatever the CSS percentage default currently resolves to.
 *
 * @param {PanelConfig} panel - Panel config from PANELS.
 * @returns {number}
 */
const currentWidth = (panel) => {
	const entry = entries[panel.key];
	if (entry?.collapsed) return 0;
	if (isWidth(entry?.width)) return entry.width;
	return measure(panel);
};

/**
 * Per-panel target widths, with `null` meaning "leave the CSS default alone".
 * Explicit widths are additionally shrunk, proportionally to their headroom
 * above the minimum, whenever the viewport can no longer host them plus a
 * usable main panel.
 *
 * @param {Limits} lim - Result of limits().
 * @returns {Record<string, number|null>}
 */
const resolveWidths = (lim) => {
	const widths = {};

	PANELS.forEach((panel) => {
		const entry = entries[panel.key];
		if (entry?.collapsed) {
			widths[panel.key] = 0;
		} else if (isWidth(entry?.width)) {
			widths[panel.key] = clamp(entry.width, lim[panel.key].min, lim[panel.key].max);
		} else {
			widths[panel.key] = null;
		}
	});

	const occupied = PANELS.reduce(
		(total, panel) => total + (widths[panel.key] ?? measure(panel)),
		0,
	);
	const excess = occupied + lim.mainMin - window.innerWidth;
	if (excess <= 0) return widths;

	const shrinkable = PANELS.filter(
		(panel) => widths[panel.key] !== null && widths[panel.key] > lim[panel.key].min,
	);
	const headroom = shrinkable.reduce(
		(total, panel) => total + (widths[panel.key] - lim[panel.key].min),
		0,
	);
	if (headroom <= 0) return widths;

	const take = Math.min(excess, headroom);
	shrinkable.forEach((panel) => {
		const share = ((widths[panel.key] - lim[panel.key].min) / headroom) * take;
		widths[panel.key] = Math.round(widths[panel.key] - share);
	});

	return widths;
};

const apply = () => {
	if (isMobile()) return;

	const lim = limits();
	const widths = resolveWidths(lim);

	PANELS.forEach((panel) => {
		const { resizer, button, panel: el } = els[panel.key];
		const width = widths[panel.key];

		if (width === null) {
			root.style.removeProperty(panel.prop);
		} else {
			root.style.setProperty(panel.prop, `${width}px`);
		}

		const collapsed = entries[panel.key]?.collapsed === true;
		el.classList.toggle('is-collapsed', collapsed);
		button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

		// A collapsed panel legitimately sits at 0, which would fall outside the
		// panel's normal minimum and make the separator's value out of range.
		resizer.setAttribute(
			'aria-valuemin',
			String(collapsed ? 0 : Math.round(lim[panel.key].min)),
		);
		resizer.setAttribute('aria-valuemax', String(Math.round(lim[panel.key].max)));
		resizer.setAttribute('aria-valuenow', String(width === null ? measure(panel) : width));
	});
};

/**
 * Write a dragged/nudged width, clamped to the panel's own limits so the value
 * never accumulates past the edge and feels sticky on the way back.
 *
 * @param {PanelConfig} panel - Panel config from PANELS.
 * @param {number} width - Desired width in pixels.
 * @param {Limits} lim   - Result of limits().
 */
const setWidth = (panel, width, lim) => {
	entries[panel.key] = {
		width: Math.round(clamp(width, lim[panel.key].min, lim[panel.key].max)),
	};
	apply();
};

const flush = () => {
	frame = 0;
	if (!drag) return;
	setWidth(drag.panel, drag.next, drag.lim);
};

const endDrag = () => {
	if (!drag) return;
	if (frame) {
		cancelAnimationFrame(frame);
		frame = 0;
		// Releasing between a pointermove and its queued frame would otherwise
		// discard that last delta and persist a slightly stale width.
		setWidth(drag.panel, drag.next, drag.lim);
	}
	els[drag.panel.key].resizer.classList.remove('is-dragging');
	document.body.classList.remove('is-resizing');
	drag = null;
	persist();
};

const bindResizer = (panel) => {
	const { resizer, button } = els[panel.key];

	resizer.addEventListener('pointerdown', (event) => {
		if (isMobile() || (event.pointerType === 'mouse' && event.button !== 0)) return;

		// No preventDefault() here: it would suppress the compatibility mouse
		// events and with them the dblclick-to-reset handler below. Text
		// selection during the drag is stopped by .is-resizing instead.
		drag = {
			panel,
			startX: event.clientX,
			startWidth: currentWidth(panel),
			next: currentWidth(panel),
			lim: limits(),
		};
		resizer.setPointerCapture(event.pointerId);
		resizer.classList.add('is-dragging');
		document.body.classList.add('is-resizing');
	});

	resizer.addEventListener('pointermove', (event) => {
		if (!drag) return;
		drag.next = drag.startWidth + (event.clientX - drag.startX) * panel.direction * flowSign();
		if (!frame) frame = requestAnimationFrame(flush);
	});

	resizer.addEventListener('pointerup', endDrag);
	resizer.addEventListener('pointercancel', endDrag);
	resizer.addEventListener('lostpointercapture', endDrag);

	resizer.addEventListener('keydown', (event) => {
		if (isMobile()) return;

		const lim = limits();
		const step = (event.shiftKey ? KEY_STEP_FINE : KEY_STEP) * panel.direction * flowSign();
		let next;

		if (event.key === 'ArrowRight') next = currentWidth(panel) + step;
		else if (event.key === 'ArrowLeft') next = currentWidth(panel) - step;
		else if (event.key === 'Home') next = lim[panel.key].min;
		else if (event.key === 'End') next = lim[panel.key].max;
		else return;

		event.preventDefault();
		setWidth(panel, next, lim);
		persist();
	});

	// Snap back to the stylesheet default (20% / 30%).
	resizer.addEventListener('dblclick', () => {
		if (isMobile()) return;
		delete entries[panel.key];
		root.style.removeProperty(panel.prop);
		apply();
		persist();
	});

	button.addEventListener('click', () => {
		const entry = entries[panel.key] ?? {};

		if (entry.collapsed) {
			// Restore the pre-collapse width, or the CSS default if there wasn't one.
			if (isWidth(entry.width)) entries[panel.key] = { width: entry.width };
			else delete entries[panel.key];
		} else {
			entries[panel.key] = {
				width: isWidth(entry.width) ? entry.width : measure(panel),
				collapsed: true,
			};
		}

		apply();
		persist();
	});
};

export const initLayout = () => {
	const missing = PANELS.some((panel) => {
		els[panel.key] = {
			panel: document.getElementById(panel.panelId),
			resizer: document.getElementById(panel.resizerId),
			button: document.getElementById(panel.buttonId),
		};
		return !els[panel.key].panel || !els[panel.key].resizer || !els[panel.key].button;
	});

	if (missing) return;

	entries = readLayout();
	apply();

	PANELS.forEach(bindResizer);

	window.addEventListener('resize', () => {
		if (resizeFrame) return;
		resizeFrame = requestAnimationFrame(() => {
			resizeFrame = 0;
			apply();
		});
	});

	// Re-apply when crossing back above the stacking breakpoint.
	window.matchMedia(MOBILE_QUERY).addEventListener('change', apply);
};
