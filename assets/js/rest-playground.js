/**
 * WP REST API Playground — Frontend Script
 *
 * Compiled by 10up-toolkit.  Source: assets/js/script.js
 */

import '../css/style.css';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
	/** @type {Record<string, Array<{route:string, methods:Record<string,Record<string,object>>}>>} */
	routes: {},
	filteredRoutes: {},
	/** Currently selected endpoint descriptor */
	selectedEndpoint: null,
	/** Currently active HTTP method */
	selectedMethod: null,
	/** Categories the user has manually opened */
	expandedCategories: new Set(),
	/** Application-password credentials */
	auth: { username: '', password: '' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters to prevent XSS in innerHTML assignments.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml( value ) {
	return String( value )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' )
		.replace( /'/g, '&#039;' );
}

/**
 * Replace regex-style path param patterns with {name} for display.
 * e.g. /wp/v2/posts/(?P<id>[\d]+) → /wp/v2/posts/{id}
 *
 * @param {string} route
 * @returns {string}
 */
function prettifyRoute( route ) {
	return route.replace( /\(\?P<([^>]+)>[^)]+\)/g, '{$1}' );
}

/**
 * Extract parameter names from a route regex.
 * e.g. /wp/v2/posts/(?P<id>[\d]+) → ['id']
 *
 * @param {string} route
 * @returns {string[]}
 */
function extractPathParams( route ) {
	const params = [];
	const re = /\(\?P<([^>]+)>[^)]+\)/g;
	let m;
	while ( ( m = re.exec( route ) ) !== null ) {
		params.push( m[ 1 ] );
	}
	return params;
}

/**
 * Simple JSON syntax highlighter — assumes the input is already HTML-escaped.
 *
 * @param {unknown} data  Plain JS value (object, array, string, number …)
 * @returns {string}      HTML string with <span> highlighting.
 */
function syntaxHighlight( data ) {
	const json = escapeHtml( JSON.stringify( data, null, 2 ) );
	return json.replace(
		/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
		( match ) => {
			let cls = 'json-number';
			if ( /^"/.test( match ) ) {
				cls = /:$/.test( match ) ? 'json-key' : 'json-string';
			} else if ( /true|false/.test( match ) ) {
				cls = 'json-boolean';
			} else if ( /null/.test( match ) ) {
				cls = 'json-null';
			}
			return `<span class="${ cls }">${ match }</span>`;
		}
	);
}

/**
 * Determine the CSS modifier for an HTTP status code.
 *
 * @param {number} status
 * @returns {'success'|'warning'|'error'}
 */
function statusModifier( status ) {
	if ( status >= 200 && status < 300 ) return 'success';
	if ( status >= 400 ) return 'error';
	return 'warning';
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function loadAuthFromStorage() {
	try {
		const stored = localStorage.getItem( 'wp-rest-playground-auth' );
		if ( stored ) {
			state.auth = JSON.parse( stored );
		}
	} catch {
		// ignore
	}
}

function saveAuth() {
	const username = document.getElementById( 'auth-username' )?.value.trim() ?? '';
	const password = document.getElementById( 'auth-password' )?.value.trim() ?? '';
	state.auth = { username, password };
	try {
		localStorage.setItem( 'wp-rest-playground-auth', JSON.stringify( state.auth ) );
	} catch {
		// ignore
	}
	updateAuthStatus();
	setAuthFormVisible( false );
}

function clearAuth() {
	state.auth = { username: '', password: '' };
	localStorage.removeItem( 'wp-rest-playground-auth' );
	const userEl = document.getElementById( 'auth-username' );
	const passEl = document.getElementById( 'auth-password' );
	if ( userEl ) userEl.value = '';
	if ( passEl ) passEl.value = '';
	updateAuthStatus();
}

function setAuthFormVisible( visible ) {
	const form = document.getElementById( 'auth-form' );
	const toggle = document.getElementById( 'auth-toggle' );
	if ( ! form || ! toggle ) return;
	form.hidden = ! visible;
	toggle.setAttribute( 'aria-expanded', String( visible ) );
}

function updateAuthStatus() {
	const statusEl = document.getElementById( 'auth-status' );
	const toggle = document.getElementById( 'auth-toggle' );
	const userEl = document.getElementById( 'auth-username' );
	const passEl = document.getElementById( 'auth-password' );

	if ( userEl ) userEl.value = state.auth.username;
	if ( passEl ) passEl.value = state.auth.password;

	const isAuth = !! ( state.auth.username && state.auth.password );

	if ( statusEl ) {
		statusEl.textContent = isAuth
			? `Authenticated as ${ state.auth.username }`
			: 'Authentication';
	}

	if ( toggle ) {
		toggle.classList.toggle( 'is-authenticated', isAuth );
	}
}

// ---------------------------------------------------------------------------
// Sidebar rendering
// ---------------------------------------------------------------------------

/**
 * Render all categories and their route items into #endpoint-nav.
 *
 * @param {typeof state.routes} routes
 */
function renderSidebar( routes ) {
	const nav = document.getElementById( 'endpoint-nav' );
	if ( ! nav ) return;

	const entries = Object.entries( routes );

	if ( entries.length === 0 ) {
		nav.innerHTML = '<p style="padding:16px;color:var(--rest-playground-chrome-muted);font-size:13px;">No endpoints match your search.</p>';
		return;
	}

	const html = entries.map( ( [ category, endpoints ] ) => {
		const isOpen = state.expandedCategories.has( category );
		const safeId = `cat-${ category.replace( /\W+/g, '-' ).toLowerCase() }`;

		const routesHtml = endpoints.map( ( endpoint ) => {
			const methods = Object.keys( endpoint.methods );
			const badges = methods
				.map( ( m ) => `<span class="rest-playground__badge rest-playground__badge--${ m.toLowerCase() }">${ m }</span>` )
				.join( '' );
			const path = prettifyRoute( endpoint.route );
			const isActive = state.selectedEndpoint?.route === endpoint.route;

			// Encode endpoint data as a base64 JSON string to avoid attribute escaping issues.
			const encoded = btoa( encodeURIComponent( JSON.stringify( endpoint ) ) );

			return `
				<button
					class="rest-playground__route-item${ isActive ? ' is-active' : '' }"
					data-endpoint="${ escapeHtml( encoded ) }"
					title="${ escapeHtml( endpoint.route ) }"
					type="button"
				>
					<span class="rest-playground__route-methods">${ badges }</span>
					<span class="rest-playground__route-path">${ escapeHtml( path ) }</span>
				</button>
			`;
		} ).join( '' );

		return `
			<div class="rest-playground__category" id="${ safeId }">
				<button class="rest-playground__category-header${ isOpen ? ' is-open' : '' }" data-category="${ escapeHtml( category ) }" type="button" aria-expanded="${ isOpen }">
					<span class="rest-playground__category-name">${ escapeHtml( category ) }</span>
					<span class="rest-playground__category-count">${ endpoints.length }</span>
					<svg class="rest-playground__category-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M4 6l4 4 4-4"/>
					</svg>
				</button>
				<div class="rest-playground__category-routes${ isOpen ? ' is-open' : '' }" aria-hidden="${ ! isOpen }">
					${ routesHtml }
				</div>
			</div>
		`;
	} ).join( '' );

	nav.innerHTML = html;

	nav.querySelectorAll( '.rest-playground__category-header' ).forEach( ( btn ) => {
		btn.addEventListener( 'click', onCategoryToggle );
	} );

	nav.querySelectorAll( '.rest-playground__route-item' ).forEach( ( btn ) => {
		btn.addEventListener( 'click', onRouteSelect );
	} );
}

function onCategoryToggle( e ) {
	const btn = /** @type {HTMLElement} */ ( e.currentTarget );
	const category = btn.dataset.category ?? '';
	const routesEl = btn.nextElementSibling;
	const isOpen = state.expandedCategories.has( category );

	if ( isOpen ) {
		state.expandedCategories.delete( category );
		btn.classList.remove( 'is-open' );
		btn.setAttribute( 'aria-expanded', 'false' );
		routesEl?.classList.remove( 'is-open' );
		routesEl?.setAttribute( 'aria-hidden', 'true' );
	} else {
		state.expandedCategories.add( category );
		btn.classList.add( 'is-open' );
		btn.setAttribute( 'aria-expanded', 'true' );
		routesEl?.classList.add( 'is-open' );
		routesEl?.setAttribute( 'aria-hidden', 'false' );
	}
}

function onRouteSelect( e ) {
	const btn = /** @type {HTMLElement} */ ( e.currentTarget );
	const encoded = btn.dataset.endpoint ?? '';
	const endpoint = JSON.parse( decodeURIComponent( atob( encoded ) ) );

	// Update active state in sidebar.
	document.querySelectorAll( '.rest-playground__route-item' ).forEach( ( el ) => el.classList.remove( 'is-active' ) );
	btn.classList.add( 'is-active' );

	state.selectedEndpoint = endpoint;
	state.selectedMethod = Object.keys( endpoint.methods )[ 0 ];

	renderEndpointPanel( endpoint, state.selectedMethod );
}

// ---------------------------------------------------------------------------
// Endpoint panel
// ---------------------------------------------------------------------------

function renderEndpointPanel( endpoint, method ) {
	const welcome = document.getElementById( 'rest-playground-welcome' );
	const panel = document.getElementById( 'rest-playground-endpoint' );
	if ( welcome ) welcome.hidden = true;
	if ( panel ) panel.hidden = false;

	// URL bar.
	const baseUrl = ( window.wpRestPlayground?.restUrl ?? '' ).replace( /\/$/, '' );
	const urlBase = document.getElementById( 'url-base' );
	const urlRoute = document.getElementById( 'url-route' );
	if ( urlBase ) urlBase.textContent = baseUrl;
	if ( urlRoute ) urlRoute.textContent = prettifyRoute( endpoint.route );

	// Method tabs.
	const tabsEl = document.getElementById( 'method-tabs' );
	if ( tabsEl ) {
		tabsEl.innerHTML = Object.keys( endpoint.methods )
			.map( ( m ) => `
				<button
					class="rest-playground__method-tab rest-playground__method-tab--${ m.toLowerCase() }${ m === method ? ' is-active' : '' }"
					data-method="${ m }"
					type="button"
					role="tab"
					aria-selected="${ m === method }"
				>${ m }</button>
			` )
			.join( '' );

		tabsEl.querySelectorAll( '.rest-playground__method-tab' ).forEach( ( tab ) => {
			tab.addEventListener( 'click', ( e ) => {
				const newMethod = /** @type {HTMLElement} */ ( e.currentTarget ).dataset.method ?? '';
				tabsEl.querySelectorAll( '.rest-playground__method-tab' ).forEach( ( t ) => {
					t.classList.remove( 'is-active' );
					t.setAttribute( 'aria-selected', 'false' );
				} );
				/** @type {HTMLElement} */ ( e.currentTarget ).classList.add( 'is-active' );
				/** @type {HTMLElement} */ ( e.currentTarget ).setAttribute( 'aria-selected', 'true' );
				state.selectedMethod = newMethod;
				renderRequestForm( endpoint, newMethod );
			} );
		} );
	}

	renderRequestForm( endpoint, method );
}

// ---------------------------------------------------------------------------
// Request form
// ---------------------------------------------------------------------------

function renderRequestForm( endpoint, method ) {
	const args = endpoint.methods[ method ] ?? {};
	const pathParams = extractPathParams( endpoint.route );
	const isBodyMethod = [ 'POST', 'PUT', 'PATCH' ].includes( method );

	// --- Path parameters ---
	const pathSection = document.getElementById( 'path-params-section' );
	const pathFields = document.getElementById( 'path-params-fields' );

	if ( pathSection && pathFields ) {
		if ( pathParams.length > 0 ) {
			pathSection.hidden = false;
			pathFields.innerHTML = pathParams
				.map( ( name ) => renderField( name, { ...( args[ name ] ?? {} ), required: true }, 'path' ) )
				.join( '' );
		} else {
			pathSection.hidden = true;
			pathFields.innerHTML = '';
		}
	}

	// Non-path args.
	const otherArgs = Object.entries( args ).filter( ( [ name ] ) => ! pathParams.includes( name ) );

	const querySection = document.getElementById( 'query-params-section' );
	const queryFields = document.getElementById( 'query-params-fields' );
	const bodySection = document.getElementById( 'body-section' );
	const bodyFields = document.getElementById( 'body-fields' );

	if ( isBodyMethod ) {
		// Hide query section; show body section.
		if ( querySection ) querySection.hidden = true;
		if ( queryFields ) queryFields.innerHTML = '';

		if ( bodySection && bodyFields ) {
			bodySection.hidden = false;

			if ( otherArgs.length > 0 ) {
				bodyFields.innerHTML = `
					<div class="rest-playground__body-tabs">
						<button class="rest-playground__body-tab is-active" data-tab="form" type="button">Form Fields</button>
						<button class="rest-playground__body-tab" data-tab="raw" type="button">Raw JSON</button>
					</div>
					<div id="body-form-pane" class="rest-playground__body-pane">
						${ otherArgs.map( ( [ name, arg ] ) => renderField( name, arg, 'body' ) ).join( '' ) }
					</div>
					<div id="body-raw-pane" class="rest-playground__body-pane" hidden>
						<textarea id="raw-json-body" class="rest-playground__json-input" placeholder='{\n  "title": "My Post"\n}' rows="10" spellcheck="false"></textarea>
					</div>
				`;
				bodyFields.querySelectorAll( '.rest-playground__body-tab' ).forEach( ( tab ) => {
					tab.addEventListener( 'click', ( e ) => {
						const target = /** @type {HTMLElement} */ ( e.currentTarget ).dataset.tab;
						bodyFields.querySelectorAll( '.rest-playground__body-tab' ).forEach( ( t ) => t.classList.remove( 'is-active' ) );
						/** @type {HTMLElement} */ ( e.currentTarget ).classList.add( 'is-active' );
						const formPane = document.getElementById( 'body-form-pane' );
						const rawPane = document.getElementById( 'body-raw-pane' );
						if ( formPane ) formPane.hidden = target !== 'form';
						if ( rawPane ) rawPane.hidden = target !== 'raw';
					} );
				} );
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
		if ( bodySection ) bodySection.hidden = true;
		if ( bodyFields ) bodyFields.innerHTML = '';

		if ( querySection && queryFields ) {
			querySection.hidden = false;
			queryFields.innerHTML = otherArgs.length > 0
				? otherArgs.map( ( [ name, arg ] ) => renderField( name, arg, 'query' ) ).join( '' )
				: '<p class="rest-playground__no-params">No query parameters defined for this endpoint.</p>';
		}
	}
}

/**
 * Build the HTML for a single request parameter field.
 *
 * @param {string} name
 * @param {Record<string, unknown>} arg
 * @param {'path'|'query'|'body'} context
 * @returns {string}
 */
function renderField( name, arg, context ) {
	const type = ( arg.type ?? 'string' );
	const required = !! arg.required;
	const description = arg.description ? String( arg.description ) : '';
	const defaultVal = arg.default ?? '';
	const enumVals = Array.isArray( arg.enum ) ? arg.enum : null;

	const id = `field-${ context }-${ name }`;

	let inputHtml;

	if ( enumVals ) {
		const options = enumVals
			.map( ( v ) => `<option value="${ escapeHtml( String( v ) ) }"${ v === defaultVal ? ' selected' : '' }>${ escapeHtml( String( v ) ) }</option>` )
			.join( '' );
		inputHtml = `
			<select class="rest-playground__field-select" id="${ id }" name="${ name }" data-context="${ context }">
				<option value="">— Select —</option>
				${ options }
			</select>
		`;
	} else if ( type === 'boolean' ) {
		return `
			<div class="rest-playground__field">
				<div class="rest-playground__checkbox-row">
					<input
						class="rest-playground__checkbox"
						type="checkbox"
						id="${ id }"
						name="${ name }"
						data-context="${ context }"
						data-type="${ type }"
						${ defaultVal === true ? 'checked' : '' }
					>
					<label class="rest-playground__field-name" for="${ id }">
						${ escapeHtml( name ) }
						${ required ? '<span class="rest-playground__field-required">*</span>' : '' }
						<span class="rest-playground__field-type">boolean</span>
					</label>
				</div>
				${ description ? `<p class="rest-playground__field-desc">${ escapeHtml( description ) }</p>` : '' }
			</div>
		`;
	} else if ( type === 'integer' || type === 'number' ) {
		const min = arg.minimum != null ? ` min="${ Number( arg.minimum ) }"` : '';
		const max = arg.maximum != null ? ` max="${ Number( arg.maximum ) }"` : '';
		inputHtml = `
			<input
				class="rest-playground__field-input"
				type="number"
				id="${ id }"
				name="${ name }"
				data-context="${ context }"
				data-type="${ type }"
				placeholder="${ escapeHtml( String( defaultVal ) ) }"
				${ min }${ max }
			>
		`;
	} else if ( type === 'array' || type === 'object' ) {
		inputHtml = `
			<textarea
				class="rest-playground__field-input rest-playground__field-textarea"
				id="${ id }"
				name="${ name }"
				data-context="${ context }"
				data-type="${ type }"
				rows="3"
				spellcheck="false"
				placeholder="${ type === 'array' ? '[]' : '{}' }"
			></textarea>
		`;
	} else {
		inputHtml = `
			<input
				class="rest-playground__field-input"
				type="text"
				id="${ id }"
				name="${ name }"
				data-context="${ context }"
				data-type="${ type }"
				placeholder="${ escapeHtml( String( defaultVal ) ) }"
			>
		`;
	}

	return `
		<div class="rest-playground__field">
			<div class="rest-playground__field-label-row">
				<label class="rest-playground__field-name" for="${ id }">
					${ escapeHtml( name ) }
					${ required ? '<span class="rest-playground__field-required">*</span>' : '' }
				</label>
				<span class="rest-playground__field-type">${ escapeHtml( String( type ) ) }</span>
			</div>
			${ inputHtml }
			${ description ? `<p class="rest-playground__field-desc">${ escapeHtml( description ) }</p>` : '' }
		</div>
	`;
}

// ---------------------------------------------------------------------------
// Request execution
// ---------------------------------------------------------------------------

async function onSendRequest() {
	if ( ! state.selectedEndpoint || ! state.selectedMethod ) return;

	const sendBtn = document.getElementById( 'send-request' );
	if ( sendBtn ) {
		sendBtn.disabled = true;
		sendBtn.textContent = 'Sending…';
	}

	showResponseLoading();

	const startTime = performance.now();

	try {
		const { url, options } = buildRequest();
		const response = await fetch( url, options );
		const duration = Math.round( performance.now() - startTime );

		const contentType = response.headers.get( 'content-type' ) ?? '';
		const isJson = contentType.includes( 'application/json' );

		let data;
		if ( isJson ) {
			data = await response.json();
		} else {
			data = await response.text();
		}

		renderResponse( {
			status: response.status,
			statusText: response.statusText,
			data,
			isJson,
			duration,
			headers: response.headers,
		} );
	} catch ( err ) {
		const duration = Math.round( performance.now() - startTime );
		renderResponseError( err instanceof Error ? err.message : String( err ), duration );
	} finally {
		if ( sendBtn ) {
			sendBtn.disabled = false;
			sendBtn.textContent = 'Send Request';
		}
	}
}

/**
 * Assemble the fetch URL and RequestInit from the current form state.
 *
 * @returns {{ url: string, options: RequestInit }}
 */
function buildRequest() {
	const endpoint = state.selectedEndpoint;
	const method = state.selectedMethod;
	const pathParams = extractPathParams( endpoint.route );

	// Build URL: substitute path params.
	let routePath = endpoint.route;
	pathParams.forEach( ( param ) => {
		const input = /** @type {HTMLInputElement|null} */ ( document.getElementById( `field-path-${ param }` ) );
		const val = input?.value?.trim() ?? '';
		if ( val ) {
			// Replace the named capture group with the actual value.
			routePath = routePath.replace( new RegExp( `\\(\\?P<${ param }>[^)]+\\)` ), encodeURIComponent( val ) );
		}
	} );
	// Strip any leftover unresolved regex patterns.
	routePath = routePath.replace( /\(\?P<[^>]+>[^)]+\)/g, '' );

	const baseUrl = ( window.wpRestPlayground?.restUrl ?? '' ).replace( /\/$/, '' );
	let url = baseUrl + routePath;

	// Headers.
	/** @type {Record<string,string>} */
	const headers = {
		'Content-Type': 'application/json',
		'X-WP-Nonce': window.wpRestPlayground?.nonce ?? '',
	};

	if ( state.auth.username && state.auth.password ) {
		headers[ 'Authorization' ] = `Basic ${ btoa( `${ state.auth.username }:${ state.auth.password }` ) }`;
	}

	const isBodyMethod = [ 'POST', 'PUT', 'PATCH' ].includes( method );
	let body;

	if ( ! isBodyMethod ) {
		// Collect query params from form fields.
		const params = new URLSearchParams();
		document.querySelectorAll( '[data-context="query"]' ).forEach( ( /** @type {HTMLInputElement} */ input ) => {
			const val = input.type === 'checkbox' ? ( input.checked ? '1' : '' ) : input.value.trim();
			if ( val ) params.set( input.name, val );
		} );
		const qs = params.toString();
		if ( qs ) url += '?' + qs;
	} else {
		// Determine whether we're in raw-JSON or form-field mode.
		const rawPane = document.getElementById( 'body-raw-pane' );
		const rawTextarea = /** @type {HTMLTextAreaElement|null} */ ( document.getElementById( 'raw-json-body' ) );
		const isRawMode = rawPane && ! rawPane.hidden;

		if ( isRawMode && rawTextarea?.value.trim() ) {
			const raw = rawTextarea.value.trim();
			try {
				JSON.parse( raw ); // validate before sending
			} catch {
				throw new Error( 'Invalid JSON in request body — please check your syntax.' );
			}
			body = raw;
		} else {
			// Collect form fields.
			const bodyData = /** @type {Record<string, unknown>} */ ( {} );
			document.querySelectorAll( '[data-context="body"]' ).forEach( ( /** @type {HTMLInputElement} */ input ) => {
				if ( input.id === 'raw-json-body' ) return;
				const fieldType = input.dataset.type ?? 'string';
				const raw = input.type === 'checkbox' ? input.checked : input.value.trim();
				if ( raw === '' || raw === false ) return;

				try {
					if ( fieldType === 'array' || fieldType === 'object' ) {
						bodyData[ input.name ] = JSON.parse( String( raw ) );
					} else if ( fieldType === 'integer' ) {
						bodyData[ input.name ] = parseInt( String( raw ), 10 );
					} else if ( fieldType === 'number' ) {
						bodyData[ input.name ] = parseFloat( String( raw ) );
					} else {
						bodyData[ input.name ] = raw;
					}
				} catch {
					bodyData[ input.name ] = raw;
				}
			} );
			body = JSON.stringify( bodyData );
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
}

// ---------------------------------------------------------------------------
// Response rendering
// ---------------------------------------------------------------------------

function showResponseLoading() {
	const meta = document.getElementById( 'response-meta' );
	const body = document.getElementById( 'response-body' );
	if ( meta ) meta.innerHTML = '';
	if ( body ) {
		body.innerHTML = `
			<div class="rest-playground__response-loading">
				<div class="rest-playground__spinner" aria-hidden="true"></div>
				Sending request…
			</div>
		`;
	}
}

/**
 * @param {{
 *   status: number,
 *   statusText: string,
 *   data: unknown,
 *   isJson: boolean,
 *   duration: number,
 *   headers: Headers
 * }} opts
 */
function renderResponse( { status, statusText, data, isJson, duration, headers } ) {
	const metaEl = document.getElementById( 'response-meta' );
	const bodyEl = document.getElementById( 'response-body' );
	const mod = statusModifier( status );

	if ( metaEl ) {
		metaEl.innerHTML = `
			<span class="rest-playground__status-badge rest-playground__status-badge--${ mod }">
				<span>${ status }</span>
			</span>
			<span class="rest-playground__status-text">${ escapeHtml( statusText ) }</span>
			<span class="rest-playground__timing">${ duration }ms</span>
			<button class="rest-playground__copy-btn" id="copy-response" type="button" title="Copy response">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<rect x="9" y="9" width="13" height="13" rx="2"/>
					<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
				</svg>
			</button>
		`;

		document.getElementById( 'copy-response' )?.addEventListener( 'click', () => {
			const text = isJson ? JSON.stringify( data, null, 2 ) : String( data );
			navigator.clipboard?.writeText( text ).then( () => {
				const btn = document.getElementById( 'copy-response' );
				if ( btn ) {
					btn.classList.add( 'is-copied' );
					btn.title = 'Copied!';
					setTimeout( () => {
						btn.classList.remove( 'is-copied' );
						btn.title = 'Copy response';
					}, 2000 );
				}
			} );
		} );
	}

	const formattedBody = isJson ? syntaxHighlight( data ) : `<span class="json-string">${ escapeHtml( String( data ) ) }</span>`;

	// Serialize headers for display.
	const headerObj = /** @type {Record<string,string>} */ ( {} );
	if ( headers ) {
		headers.forEach( ( val, key ) => { headerObj[ key ] = val; } );
	}
	const formattedHeaders = syntaxHighlight( headerObj );

	if ( bodyEl ) {
		bodyEl.innerHTML = `
			<div class="rest-playground__resp-tabs" role="tablist">
				<button class="rest-playground__resp-tab is-active" data-tab="body" type="button" role="tab" aria-selected="true">Body</button>
				<button class="rest-playground__resp-tab" data-tab="headers" type="button" role="tab" aria-selected="false">Headers</button>
			</div>
			<div id="resp-body-pane" class="rest-playground__resp-pane">
				<pre class="rest-playground__json-output">${ formattedBody }</pre>
			</div>
			<div id="resp-headers-pane" class="rest-playground__resp-pane" hidden>
				<pre class="rest-playground__json-output">${ formattedHeaders }</pre>
			</div>
		`;

		bodyEl.querySelectorAll( '.rest-playground__resp-tab' ).forEach( ( tab ) => {
			tab.addEventListener( 'click', ( e ) => {
				const target = /** @type {HTMLElement} */ ( e.currentTarget ).dataset.tab;
				bodyEl.querySelectorAll( '.rest-playground__resp-tab' ).forEach( ( t ) => {
					t.classList.remove( 'is-active' );
					t.setAttribute( 'aria-selected', 'false' );
				} );
				/** @type {HTMLElement} */ ( e.currentTarget ).classList.add( 'is-active' );
				/** @type {HTMLElement} */ ( e.currentTarget ).setAttribute( 'aria-selected', 'true' );
				const bodyPane = document.getElementById( 'resp-body-pane' );
				const headersPane = document.getElementById( 'resp-headers-pane' );
				if ( bodyPane ) bodyPane.hidden = target !== 'body';
				if ( headersPane ) headersPane.hidden = target !== 'headers';
			} );
		} );
	}
}

function renderResponseError( message, duration ) {
	const metaEl = document.getElementById( 'response-meta' );
	const bodyEl = document.getElementById( 'response-body' );

	if ( metaEl ) {
		metaEl.innerHTML = `
			<span class="rest-playground__status-badge rest-playground__status-badge--error">Error</span>
			<span class="rest-playground__timing">${ duration }ms</span>
		`;
	}

	if ( bodyEl ) {
		bodyEl.innerHTML = `
			<div class="rest-playground__response-error">
				<strong>Request Failed</strong>
				<p>${ escapeHtml( message ) }</p>
			</div>
		`;
	}
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function onSearch( e ) {
	const query = /** @type {HTMLInputElement} */ ( e.target ).value.toLowerCase().trim();

	if ( ! query ) {
		state.filteredRoutes = state.routes;
		renderSidebar( state.routes );
		return;
	}

	/** @type {typeof state.routes} */
	const filtered = {};
	Object.entries( state.routes ).forEach( ( [ category, endpoints ] ) => {
		const matches = endpoints.filter( ( ep ) => {
			return (
				prettifyRoute( ep.route ).toLowerCase().includes( query ) ||
				ep.route.toLowerCase().includes( query ) ||
				category.toLowerCase().includes( query )
			);
		} );
		if ( matches.length > 0 ) {
			filtered[ category ] = matches;
			state.expandedCategories.add( category );
		}
	} );

	state.filteredRoutes = filtered;
	renderSidebar( filtered );
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function init() {
	loadAuthFromStorage();
	updateAuthStatus();

	// Fetch routes.
	const nav = document.getElementById( 'endpoint-nav' );
	const routesUrl = window.wpRestPlayground?.routesUrl;

	if ( ! routesUrl ) {
		if ( nav ) nav.innerHTML = '<p style="padding:16px;color:var(--rest-playground-error);">Configuration error: routesUrl not set.</p>';
		return;
	}

	try {
		const res = await fetch( routesUrl, {
			headers: { 'X-WP-Nonce': window.wpRestPlayground?.nonce ?? '' },
		} );

		if ( ! res.ok ) {
			throw new Error( `HTTP ${ res.status } — ${ res.statusText }` );
		}

		const data = await res.json();
		state.routes = data;
		state.filteredRoutes = data;

		const loading = document.getElementById( 'nav-loading' );
		if ( loading ) loading.remove();

		renderSidebar( data );
	} catch ( err ) {
		if ( nav ) {
			nav.innerHTML = `<p style="padding:16px;color:var(--rest-playground-error);font-size:13px;">Failed to load endpoints: ${ escapeHtml( err instanceof Error ? err.message : String( err ) ) }</p>`;
		}
	}

	// Global event listeners.
	document.getElementById( 'send-request' )?.addEventListener( 'click', onSendRequest );
	document.getElementById( 'endpoint-search' )?.addEventListener( 'input', onSearch );

	document.getElementById( 'auth-toggle' )?.addEventListener( 'click', () => {
		const form = document.getElementById( 'auth-form' );
		const isHidden = form?.hidden ?? true;
		setAuthFormVisible( isHidden );
	} );

	document.getElementById( 'auth-save' )?.addEventListener( 'click', saveAuth );
	document.getElementById( 'auth-clear' )?.addEventListener( 'click', clearAuth );
}

document.addEventListener( 'DOMContentLoaded', init );
