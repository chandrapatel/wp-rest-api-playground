<?php
/**
 * Plugin Name: WP REST API Playground
 * Description: Test and explore the WordPress REST API directly from the frontend at /rest-api-playground/.
 * Version:     1.1.0
 * Author:      Chandra Patel
 * Plugin URI:  https://github.com/chandrapatel/wp-rest-api-playground
 * License:     GPL-2.0-or-later
 * Text Domain: wp-rest-api-playground
 *
 * @package WP_REST_Playground
 */

declare( strict_types=1 );

namespace WP_REST_Playground;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WP_REST_PLAYGROUND_VERSION', '1.1.0' );
define( 'WP_REST_PLAYGROUND_PLUGIN_FILE', __FILE__ );
define( 'WP_REST_PLAYGROUND_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'WP_REST_PLAYGROUND_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

if ( file_exists( __DIR__ . '/vendor/autoload.php' ) ) {
	require_once __DIR__ . '/vendor/autoload.php';
}

add_action( 'plugins_loaded', [ Plugin::class, 'init' ] );

register_activation_hook( __FILE__, [ Plugin::class, 'activate' ] );
register_deactivation_hook( __FILE__, [ Plugin::class, 'deactivate' ] );
