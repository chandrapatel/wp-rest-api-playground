<?php
/**
 * Main plugin bootstrap class.
 *
 * @package WP_REST_Playground
 */

declare( strict_types=1 );

namespace WP_REST_Playground;

/**
 * Plugin class.
 *
 * Single entry point for registering all plugin hooks.
 */
class Plugin {

	private static ?self $instance = null;

	/**
	 * Initialise the plugin (called once on plugins_loaded).
	 */
	public static function init(): void {
		if ( null !== self::$instance ) {
			return;
		}

		self::$instance = new self();
		self::$instance->setup();
	}

	/**
	 * Register all feature hooks.
	 */
	private function setup(): void {
		( new Page() )->register();
		( new REST_Controller() )->register();
	}

	/**
	 * Flush rewrite rules on activation so the /rest-api-playground/ slug works immediately.
	 */
	public static function activate(): void {
		// Ensure the rewrite rule is added before flushing.
		add_rewrite_rule( '^rest-api-playground/?$', 'index.php?rest_playground=1', 'top' );
		flush_rewrite_rules();
	}

	/**
	 * Clean up rewrite rules on deactivation.
	 */
	public static function deactivate(): void {
		flush_rewrite_rules();
	}
}
