<?php
/**
 * Standalone playground template.
 *
 * Rendered as a full HTML page; bypasses the active theme entirely so the
 * playground has complete control over its layout and styles.
 *
 * @package WP_REST_Playground
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="robots" content="noindex, nofollow">
	<title><?php esc_html_e( 'REST API Playground', 'wp-rest-api-playground' ); ?> &mdash; <?php bloginfo( 'name' ); ?></title>
	<?php wp_head(); ?>
</head>
<body class="rest-playground-body">

<div id="rest-playground" class="rest-playground">

	<!-- ── Left Sidebar ──────────────────────────────────────────── -->
	<aside class="rest-playground__sidebar" id="rest-playground-sidebar" aria-label="<?php esc_attr_e( 'API Endpoints', 'wp-rest-api-playground' ); ?>">

		<div class="rest-playground__sidebar-header">
			<div class="rest-playground__brand">
				<svg class="rest-playground__brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path d="M8 9l3 3-3 3M13 15h3M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"/>
				</svg>
				<span class="rest-playground__brand-name"><?php esc_html_e( 'REST API Playground', 'wp-rest-api-playground' ); ?></span>
			</div>
		</div>

		<!-- Authentication -->
		<div class="rest-playground__auth" id="rest-playground-auth">
			<button type="button" class="rest-playground__auth-toggle" id="auth-toggle" aria-expanded="false" aria-controls="auth-form">
				<svg class="rest-playground__auth-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
					<path d="M7 11V7a5 5 0 0110 0v4"/>
				</svg>
				<span class="rest-playground__auth-status" id="auth-status"><?php esc_html_e( 'Authentication', 'wp-rest-api-playground' ); ?></span>
				<svg class="rest-playground__auth-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path d="M4 6l4 4 4-4"/>
				</svg>
			</button>
			<div class="rest-playground__auth-form" id="auth-form" hidden>
				<p class="rest-playground__auth-help">
					<?php esc_html_e( 'Use an Application Password from your WordPress profile to authenticate requests.', 'wp-rest-api-playground' ); ?>
				</p>
				<label class="rest-playground__field-label" for="auth-username"><?php esc_html_e( 'Username', 'wp-rest-api-playground' ); ?></label>
				<input class="rest-playground__text-input" type="text" id="auth-username" autocomplete="username" placeholder="admin">

				<label class="rest-playground__field-label" for="auth-password"><?php esc_html_e( 'Application Password', 'wp-rest-api-playground' ); ?></label>
				<input class="rest-playground__text-input" type="password" id="auth-password" autocomplete="current-password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx">

				<div class="rest-playground__auth-actions">
					<button type="button" class="rest-playground__btn rest-playground__btn--primary" id="auth-save"><?php esc_html_e( 'Save', 'wp-rest-api-playground' ); ?></button>
					<button type="button" class="rest-playground__btn rest-playground__btn--ghost" id="auth-clear"><?php esc_html_e( 'Clear', 'wp-rest-api-playground' ); ?></button>
				</div>
			</div>
		</div>

		<!-- Search -->
		<div class="rest-playground__search">
			<svg class="rest-playground__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="11" cy="11" r="8"/>
				<path d="M21 21l-4.35-4.35"/>
			</svg>
			<input
				class="rest-playground__search-input"
				type="search"
				id="endpoint-search"
				placeholder="<?php esc_attr_e( 'Search endpoints…', 'wp-rest-api-playground' ); ?>"
				aria-label="<?php esc_attr_e( 'Search endpoints', 'wp-rest-api-playground' ); ?>"
			>
		</div>

		<!-- Endpoint list (populated by JS) -->
		<nav class="rest-playground__nav" id="endpoint-nav" aria-label="<?php esc_attr_e( 'Endpoint categories', 'wp-rest-api-playground' ); ?>">
			<div class="rest-playground__nav-loading" id="nav-loading" aria-live="polite">
				<div class="rest-playground__spinner" aria-hidden="true"></div>
				<?php esc_html_e( 'Loading endpoints…', 'wp-rest-api-playground' ); ?>
			</div>
		</nav>

	</aside><!-- /.rest-playground__sidebar -->

	<!-- ── Main Panel ────────────────────────────────────────────── -->
	<main class="rest-playground__main" id="rest-playground-main">

		<!-- Welcome screen (shown until an endpoint is selected) -->
		<div class="rest-playground__welcome" id="rest-playground-welcome">
			<div class="rest-playground__welcome-inner">
				<svg class="rest-playground__welcome-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
					<rect width="64" height="64" rx="16" fill="#6366f1" opacity=".12"/>
					<path d="M20 24l8 8-8 8M36 40h8" stroke="#6366f1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<h1 class="rest-playground__welcome-title"><?php esc_html_e( 'WordPress REST API Playground', 'wp-rest-api-playground' ); ?></h1>
				<p class="rest-playground__welcome-desc"><?php esc_html_e( 'Select an endpoint from the sidebar to explore and test it.', 'wp-rest-api-playground' ); ?></p>
				<ul class="rest-playground__tips">
					<li><?php esc_html_e( 'Browse endpoints by category in the left sidebar.', 'wp-rest-api-playground' ); ?></li>
					<li><?php esc_html_e( 'Use the search box to quickly find a specific route.', 'wp-rest-api-playground' ); ?></li>
					<li><?php esc_html_e( 'Add an Application Password to test authenticated endpoints.', 'wp-rest-api-playground' ); ?></li>
					<li><?php esc_html_e( 'Switch HTTP methods with the tabs above the request form.', 'wp-rest-api-playground' ); ?></li>
				</ul>
			</div>
		</div>

		<!-- Endpoint detail (shown when an endpoint is selected) -->
		<div class="rest-playground__endpoint" id="rest-playground-endpoint" hidden>

			<div class="rest-playground__endpoint-header">
				<div class="rest-playground__method-tabs" id="method-tabs" role="tablist" aria-label="<?php esc_attr_e( 'HTTP method', 'wp-rest-api-playground' ); ?>">
					<!-- Populated by JS -->
				</div>
				<div class="rest-playground__url-bar">
					<span class="rest-playground__url-base" id="url-base"></span><span class="rest-playground__url-route" id="url-route"></span>
				</div>
			</div>

			<div class="rest-playground__request" id="rest-playground-request">

				<!-- Path parameters -->
				<section class="rest-playground__params-section" id="path-params-section" hidden>
					<h2 class="rest-playground__section-title"><?php esc_html_e( 'Path Parameters', 'wp-rest-api-playground' ); ?></h2>
					<div class="rest-playground__params-fields" id="path-params-fields"></div>
				</section>

				<!-- Query parameters (GET/DELETE) -->
				<section class="rest-playground__params-section" id="query-params-section">
					<h2 class="rest-playground__section-title"><?php esc_html_e( 'Query Parameters', 'wp-rest-api-playground' ); ?></h2>
					<div class="rest-playground__params-fields" id="query-params-fields"></div>
				</section>

				<!-- Request body (POST/PUT/PATCH) -->
				<section class="rest-playground__params-section" id="body-section" hidden>
					<h2 class="rest-playground__section-title"><?php esc_html_e( 'Request Body', 'wp-rest-api-playground' ); ?></h2>
					<div id="body-fields"></div>
				</section>

			</div><!-- /.rest-playground__request -->

			<div class="rest-playground__send-bar">
				<button type="button" class="rest-playground__send-btn" id="send-request">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<line x1="22" y1="2" x2="11" y2="13"/>
						<polygon points="22 2 15 22 11 13 2 9 22 2"/>
					</svg>
					<?php esc_html_e( 'Send Request', 'wp-rest-api-playground' ); ?>
				</button>
			</div>

		</div><!-- /#rest-playground-endpoint -->

	</main><!-- /.rest-playground__main -->

	<!-- ── Response Sidebar ──────────────────────────────────────── -->
	<aside class="rest-playground__response-panel" id="rest-playground-response" aria-label="<?php esc_attr_e( 'API Response', 'wp-rest-api-playground' ); ?>">

		<div class="rest-playground__response-header">
			<h2 class="rest-playground__response-title"><?php esc_html_e( 'Response', 'wp-rest-api-playground' ); ?></h2>
			<div class="rest-playground__response-meta" id="response-meta"></div>
		</div>

		<div class="rest-playground__response-body" id="response-body">
			<div class="rest-playground__response-empty">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
					<path d="M9 12h6M9 16h6M7 8h.01M17 4H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z"/>
				</svg>
				<p><?php esc_html_e( 'Send a request to see the response here.', 'wp-rest-api-playground' ); ?></p>
			</div>
		</div>

	</aside><!-- /.rest-playground__response-panel -->

</div><!-- /#rest-playground -->

<?php wp_footer(); ?>
</body>
</html>
