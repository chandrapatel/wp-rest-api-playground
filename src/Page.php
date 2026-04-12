<?php
/**
 * Handles the virtual /rest-api-playground/ frontend page.
 *
 * @package WP_REST_Playground
 */

declare( strict_types=1 );

namespace WP_REST_Playground;

/**
 * Page class.
 *
 * Registers a rewrite rule for /rest-api-playground/, intercepts the request,
 * enqueues assets, and renders the standalone playground template.
 */
class Page {

	/**
	 * Register WordPress hooks.
	 */
	public function register(): void {
		add_action( 'init', [ $this, 'add_rewrite_rule' ] );
		add_filter( 'query_vars', [ $this, 'add_query_vars' ] );
		add_action( 'template_redirect', [ $this, 'maybe_render' ] );
	}

	/**
	 * Add a top-priority rewrite rule for /rest-api-playground/.
	 */
	public function add_rewrite_rule(): void {
		add_rewrite_rule( '^rest-api-playground/?$', 'index.php?rest_playground=1', 'top' );
	}

	/**
	 * Expose the rest_playground query var to WordPress.
	 *
	 * @param string[] $vars Registered query vars.
	 * @return string[]
	 */
	public function add_query_vars( array $vars ): array {
		$vars[] = 'rest_playground';
		return $vars;
	}

	/**
	 * If the current request is for the playground, enqueue assets and render
	 * the standalone template — then bail out of normal WordPress rendering.
	 */
	public function maybe_render(): void {
		if ( ! get_query_var( 'rest_playground' ) ) {
			return;
		}

		$this->enqueue_assets();

		$template = WP_REST_PLAYGROUND_PLUGIN_DIR . 'templates/playground.php';

		if ( file_exists( $template ) ) {
			include $template;
		}

		exit;
	}

	/**
	 * Enqueue compiled CSS and JS, and pass runtime config to the script.
	 *
	 * Assets are compiled by 10up-toolkit into dist/js/script.js and
	 * dist/css/script.css.  Run `npm run build` to generate them.
	 */
	private function enqueue_assets(): void {
		$dist_dir = WP_REST_PLAYGROUND_PLUGIN_DIR . 'dist/';
		$dist_url = WP_REST_PLAYGROUND_PLUGIN_URL . 'dist/';

		if ( file_exists( $dist_dir . 'css/rest-playground.css' ) ) {
			wp_enqueue_style(
				'wp-rest-playground',
				$dist_url . 'css/rest-playground.css',
				[],
				WP_REST_PLAYGROUND_VERSION
			);
		}

		if ( file_exists( $dist_dir . 'js/rest-playground.js' ) ) {
			wp_enqueue_script(
				'wp-rest-playground',
				$dist_url . 'js/rest-playground.js',
				[],
				WP_REST_PLAYGROUND_VERSION,
				true
			);
		}

		wp_localize_script(
			'wp-rest-playground',
			'wpRestPlayground',
			[
				'restUrl'   => esc_url_raw( rest_url() ),
				'nonce'     => wp_create_nonce( 'wp_rest' ),
				'routesUrl' => esc_url_raw( rest_url( 'rest-playground/v1/routes' ) ),
				'siteUrl'   => esc_url_raw( get_site_url() ),
			]
		);
	}
}
