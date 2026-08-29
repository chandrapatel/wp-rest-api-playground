/**
 * WP REST API Playground — Shared application state.
 */

/** @type {Record<string, Array<{route:string, methods:Record<string,Record<string,object>>}>>} */
export const state = {
	routes: {},
	filteredRoutes: {},
	/** Currently selected endpoint descriptor */
	selectedEndpoint: null,
	/** Currently active HTTP method */
	selectedMethod: null,
	/** Categories the user has manually opened */
	expandedCategories: new Set(),
	/**
	 * Credential profiles, one active at a time. Hydrated from sessionStorage by
	 * components/auth — see that module for the shape of a profile.
	 *
	 * @type {{ activeProfileId: string|null, profiles: Array<{id: string, name: string, type: string, config: Record<string, any>}>, sendWpCookie: boolean }}
	 */
	auth: { activeProfileId: null, profiles: [], sendWpCookie: false },
	/**
	 * Rows of the Headers tab. Kept out of `auth` because they apply to every
	 * request regardless of which credential is selected.
	 *
	 * @type {Array<{enabled: boolean, name: string, value: string}>}
	 */
	customHeaders: [],
	/** Which request tab is showing: 'params' | 'body' | 'auth' | 'headers' */
	activeRequestTab: 'params',
};
