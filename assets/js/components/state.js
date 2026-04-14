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
	/** Application-password credentials */
	auth: { username: '', password: '' },
};
