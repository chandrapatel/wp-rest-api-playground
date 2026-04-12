<?php
/**
 * Custom REST endpoint that exposes all registered WP REST routes in a
 * categorised, schema-enriched format for the playground UI.
 *
 * @package WP_REST_Playground
 */

declare( strict_types=1 );

namespace WP_REST_Playground;

/**
 * REST_Controller class.
 */
class REST_Controller {

	/**
	 * Register WordPress hooks.
	 */
	public function register(): void {
		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
	}

	/**
	 * Register the /rest-playground/v1/routes endpoint.
	 */
	public function register_routes(): void {
		register_rest_route(
			'rest-playground/v1',
			'/routes',
			[
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => [ $this, 'get_routes' ],
				'permission_callback' => '__return_true',
			]
		);
	}

	/**
	 * Return all registered REST routes, grouped by UI category.
	 *
	 * Each category contains an array of route descriptors:
	 *   { route, methods: { METHOD: { argName: argSchema } } }
	 *
	 * @param \WP_REST_Request $request Incoming request (unused).
	 * @return \WP_REST_Response
	 */
	public function get_routes( \WP_REST_Request $request ): \WP_REST_Response {
		$server = rest_get_server();
		$routes = $server->get_routes();

		$categorized = [];

		foreach ( $routes as $route => $handlers ) {
			// Skip the root index and our own internal endpoints.
			if ( '/' === $route || str_starts_with( $route, '/rest-playground/' ) ) {
				continue;
			}

			$methods_data = [];

			foreach ( $handlers as $handler ) {
				foreach ( $handler['methods'] as $method => $enabled ) {
					if ( ! $enabled ) {
						continue;
					}

					$args = [];

					if ( ! empty( $handler['args'] ) ) {
						foreach ( $handler['args'] as $arg_name => $arg_schema ) {
							$args[ $arg_name ] = $this->normalize_arg( $arg_schema );
						}
					}

					// Multiple handlers can share the same method; merge args.
					if ( isset( $methods_data[ $method ] ) ) {
						$methods_data[ $method ] = array_merge( $methods_data[ $method ], $args );
					} else {
						$methods_data[ $method ] = $args;
					}
				}
			}

			if ( empty( $methods_data ) ) {
				continue;
			}

			$category = $this->categorize( $route );

			if ( ! isset( $categorized[ $category ] ) ) {
				$categorized[ $category ] = [];
			}

			$categorized[ $category ][] = [
				'route'   => $route,
				'methods' => $methods_data,
			];
		}

		ksort( $categorized );

		return rest_ensure_response( $categorized );
	}

	/**
	 * Reduce a raw arg schema to only the fields the UI needs.
	 *
	 * @param mixed $schema Raw arg schema from the route registration.
	 * @return array<string, mixed>
	 */
	private function normalize_arg( mixed $schema ): array {
		if ( ! is_array( $schema ) ) {
			return [ 'type' => 'string' ];
		}

		return array_filter(
			[
				'type'        => $schema['type'] ?? 'string',
				'description' => $schema['description'] ?? '',
				'required'    => $schema['required'] ?? false,
				'default'     => $schema['default'] ?? null,
				'enum'        => isset( $schema['enum'] ) && is_array( $schema['enum'] ) ? $schema['enum'] : null,
				'minimum'     => $schema['minimum'] ?? null,
				'maximum'     => $schema['maximum'] ?? null,
				'items'       => isset( $schema['items'] ) ? $schema['items'] : null,
			],
			static fn( $value ) => null !== $value
		);
	}

	/**
	 * Derive a human-readable category label from a route string.
	 *
	 * @param string $route The raw route pattern, e.g. /wp/v2/posts/(?P<id>[\d]+).
	 * @return string
	 */
	private function categorize( string $route ): string {
		// Core WP v2 routes — map the first resource segment to a friendly label.
		if ( preg_match( '#^/wp/v2/([^/(?]+)#', $route, $m ) ) {
			$labels = [
				'posts'             => 'Posts',
				'pages'             => 'Pages',
				'users'             => 'Users',
				'media'             => 'Media',
				'comments'          => 'Comments',
				'categories'        => 'Categories',
				'tags'              => 'Tags',
				'taxonomies'        => 'Taxonomies',
				'types'             => 'Post Types',
				'statuses'          => 'Post Statuses',
				'settings'          => 'Settings',
				'themes'            => 'Themes',
				'plugins'           => 'Plugins',
				'blocks'            => 'Reusable Blocks',
				'block-types'       => 'Block Types',
				'block-patterns'    => 'Block Patterns',
				'block-directory'   => 'Block Directory',
				'block-renderer'    => 'Block Renderer',
				'templates'         => 'Templates',
				'template-parts'    => 'Template Parts',
				'navigation'        => 'Navigation',
				'menus'             => 'Menus',
				'menu-items'        => 'Menu Items',
				'menu-locations'    => 'Menu Locations',
				'search'            => 'Search',
				'batch'             => 'Batch Processing',
				'widgets'           => 'Widgets',
				'widget-types'      => 'Widget Types',
				'sidebars'          => 'Sidebars',
				'global-styles'     => 'Global Styles',
				'font-families'     => 'Font Families',
				'pattern-directory' => 'Pattern Directory',
				'application-passwords' => 'Application Passwords',
			];

			return $labels[ $m[1] ] ?? ucwords( str_replace( '-', ' ', $m[1] ) );
		}

		// Non-core namespaces: use "Namespace Version" as the category.
		if ( preg_match( '#^/([^/]+/[^/]+)#', $route, $m ) ) {
			return ucwords( str_replace( [ '/', '-', '_' ], ' ', $m[1] ) );
		}

		return 'Other';
	}
}
