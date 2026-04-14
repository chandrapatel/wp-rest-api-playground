# WP REST API Playground

Test and explore the WordPress REST API directly from the frontend.

## Description

WP REST API Playground provides a developer-friendly interface accessible at `/rest-api-playground/` on your WordPress site. It lets you browse every registered REST API endpoint, build requests with a guided form, authenticate with Application Passwords, and inspect responses — all without leaving the browser.

### Features

- **Three-panel layout** — endpoint browser on the left, request builder in the centre, response viewer on the right.
- **Full endpoint discovery** — all registered REST API routes (core and plugin-added) are loaded automatically and grouped alphabetically by resource type (Posts, Pages, Users, Media, Comments, and more).
- **Live search** — filter endpoints by route path or category as you type; matching categories expand automatically.
- **Method tabs** — switch between GET, POST, PUT, PATCH, and DELETE for any route that supports multiple methods.
- **Schema-driven form fields** — path parameters, query parameters, and request body fields are rendered from the endpoint's registered schema, including type hints, descriptions, required markers, default values, enum dropdowns, and numeric min/max constraints.
- **Form/Raw JSON tabs** — switch between a guided form and a raw JSON textarea for POST/PUT/PATCH requests; the raw textarea also appears when no schema is available.
- **Application Password authentication** — enter a username and Application Password once; credentials are saved to `sessionStorage` (cleared when the tab closes) and sent as a `Basic` Authorization header on every authenticated request. Every request also includes the WordPress nonce (`X-WP-Nonce`) for cookie-based sessions.
- **Welcome screen** — a getting-started view with tips is shown before any endpoint is selected.
- **Loading states** — a spinner appears while the endpoint list loads; the Send button shows "Sending…" and is disabled during an in-flight request.
- **Syntax-highlighted response** — JSON responses are displayed with colour-coded keys, strings, numbers, booleans, and nulls. Non-JSON responses are shown as plain text.
- **Response headers tab** — inspect the full set of response headers alongside the body.
- **Copy to clipboard** — copy the formatted response body with one click.
- **Timing indicator** — each request shows its round-trip duration in milliseconds.
- **Administrator-only access** — the playground page is restricted to users with the `manage_options` capability; all other visitors receive a 403 response.

## Requirements

- WordPress 6.0 or higher
- PHP 8.0 or higher

## Installation

1. Copy the `wp-rest-api-playground` folder into your `wp-content/plugins/` directory.
2. Activate the plugin from **Plugins → Installed Plugins** in the WordPress admin.
3. Visit `https://your-site.com/rest-api-playground/` to open the playground.

> **Note:** If the `/rest-api-playground/` URL returns a 404, go to **Settings → Permalinks** and click **Save Changes** to flush rewrite rules.

## Usage

### Browsing endpoints

All registered REST API routes are loaded automatically when the page opens. They are grouped into categories such as Posts, Pages, Users, Media, Comments, Categories, Tags, and any additional routes registered by active plugins.

Use the search box at the top of the sidebar to filter endpoints by route path or category name.

Click a category header to expand or collapse it. Click a route to load its detail view in the centre panel.

### Making requests

1. Select an endpoint from the sidebar.
2. Choose an HTTP method using the tabs at the top of the centre panel.
3. Fill in any **Path Parameters** (e.g. a post `id`) — these replace the `{id}` segment in the URL.
4. For **GET** and **DELETE** requests, fill in the optional **Query Parameters**.
5. For **POST**, **PUT**, and **PATCH** requests, fill in the **Request Body** fields or switch to the **Raw JSON** tab and write the body manually.
6. Click **Send Request**.

The response status, timing, body, and headers appear in the right panel.

### Authentication

Many endpoints (creating posts, accessing user data, changing settings) require authentication.

1. Click the **Authentication** section in the sidebar.
2. Generate an Application Password from your WordPress profile page (**Users → Profile → Application Passwords**).
3. Enter your **Username** and the generated **Application Password**.
4. Click **Save**.

Credentials are stored in the browser's `sessionStorage` and are sent automatically with every subsequent request. They are cleared automatically when the tab or browser window closes. Click **Clear** to remove them immediately.

## Development

> The `vendor/` (Composer autoloader) and `dist/` (compiled assets) folders are included in the repository, so none of the steps below are needed to simply use the plugin. These instructions are for contributors who want to modify the PHP classes or frontend source files.

### Setup

```bash
composer install   # regenerate the autoloader after adding/renaming PHP classes
npm install        # install Node build tooling
```

### Available scripts

| Command | Description |
|---|---|
| `npm run build` | Compile and minify assets for production |
| `npm start` | Start the webpack dev watcher |
| `npm run lint:js` | Lint JavaScript with ESLint |
| `npm run lint:css` | Lint CSS with Stylelint |

### Project structure

```
wp-rest-api-playground/
├── wp-rest-api-playground.php      # Plugin header and bootstrap
├── composer.json                   # PHP autoloading (PSR-4)
├── package.json                    # Node build tooling
├── src/
│   ├── Plugin.php                  # Registers all hooks; handles activation/deactivation
│   ├── Page.php                    # Serves the /rest-api-playground/ page (admin-only)
│   └── REST_Controller.php         # /wp-json/rest-playground/v1/routes endpoint
├── templates/
│   └── playground.php              # Standalone HTML template (bypasses theme)
├── assets/
│   ├── fonts/                      # Self-hosted Fira Sans and Fira Mono font files
│   ├── css/
│   │   ├── rest-playground.css     # CSS entry point — imports all partials
│   │   └── components/             # Partial stylesheets (variables, base, sidebar,
│   │       └── …                   #   navigation, main-panel, request-form,
│   │                               #   buttons, response-panel, utilities, fonts)
│   └── js/
│       ├── rest-playground.js      # JS entry point
│       └── components/             # Feature modules
│           ├── state.js            # Shared application state
│           ├── auth.js             # Application Password authentication
│           ├── api.js              # Request building and execution
│           ├── search.js           # Sidebar search/filter
│           ├── utils.js            # Shared utilities (escapeHtml, syntaxHighlight, …)
│           └── render/
│               ├── sidebar.js      # Category and route list renderer
│               ├── form.js         # Endpoint panel and request form renderer
│               ├── fields.js       # Individual parameter field renderer
│               └── response.js     # Response panel renderer
└── dist/                           # Compiled assets (generated by npm run build)
```

### How the endpoint list works

`REST_Controller` hooks into `rest_api_init` and registers an administrator-only endpoint at:

```
GET /wp-json/rest-playground/v1/routes
```

It calls `rest_get_server()->get_routes()` to retrieve every registered route, normalises their argument schemas (preserving `type`, `description`, `required`, `default`, `enum`, `minimum`, `maximum`, and `items`), and groups them into human-readable categories sorted alphabetically. The frontend fetches this endpoint on page load using the WordPress nonce for authentication.

### Access control

The playground page (`Page.php`) checks `current_user_can('manage_options')` before rendering. Any visitor who does not meet this condition receives a WordPress 403 error page. The page template also sets `noindex, nofollow` so search engines ignore it.

The `/wp-json/rest-playground/v1/routes` endpoint enforces the same `manage_options` capability check, so the route list is never exposed to unauthenticated or non-admin visitors.

### Building assets

Assets are compiled by [10up-toolkit](https://github.com/10up/10up-toolkit). The JS entry point is `assets/js/rest-playground.js` (which imports `assets/css/rest-playground.css`). Compiled output lands in `dist/js/rest-playground.js` and `dist/css/rest-playground.css`.

## Frequently Asked Questions

**The page shows a 404.**
Go to **Settings → Permalinks** and save. This flushes WordPress rewrite rules and registers the `/rest-api-playground/` slug. Plugin activation also flushes rules automatically, so deactivating and reactivating the plugin is another option.

**The page shows a 403 "Access Denied" error.**
The playground is restricted to users with the `manage_options` capability (administrators by default). Log in to WordPress with an administrator account before visiting the playground URL.

**Authenticated requests return 401.**
Make sure you are using an Application Password (not your login password). Application Passwords are generated under **Users → Profile** and require WordPress 5.6 or higher.

**An endpoint returns an error I don't understand.**
Switch to the **Headers** tab in the response panel — the `X-WP-Total`, `X-WP-TotalPages`, and `X-WP-Nonce` headers often give additional context. The response body usually contains a `code`, `message`, and `data` object with details.

**I don't see plugin-registered endpoints.**
Ensure the plugin that registers those endpoints is active. Routes are discovered live, so any active plugin's REST routes will appear automatically.

**The endpoint list says "Configuration error: routesUrl not set."**
This means the compiled JavaScript could not read the runtime configuration injected by `wp_localize_script`. Ensure `npm run build` has been run and that `dist/js/rest-playground.js` exists.

## AI Disclosure

This plugin was developed with the assistance of [Claude](https://claude.ai) (Anthropic's AI). All code, structure, and documentation were generated through a collaborative session between the author and Claude Code. The implementation has been reviewed and is maintained by the author.

## Changelog

### 1.0.0
- Three-panel layout with endpoint browser, request builder, and response viewer.
- Full endpoint discovery grouped by resource category.
- Application Password authentication with `sessionStorage` persistence (cleared on tab close).
- Schema-driven form fields with syntax-highlighted response output.
- Administrator-only access restriction (`manage_options` capability required for both the page and the routes API endpoint).
- Welcome screen shown before an endpoint is selected.
- Loading spinner while the endpoint list and requests are in flight.
- Self-hosted Fira Sans and Fira Mono fonts.
- Form / Raw JSON tab toggle for POST/PUT/PATCH request bodies.
- Auto-expanding search — matching categories open automatically as you type.
- Non-JSON response support — plain-text bodies are displayed safely.
- Numeric field min/max constraints sourced from the endpoint schema.
- Modular JavaScript and CSS source split into per-feature component files.
- Activation hook flushes rewrite rules immediately so `/rest-api-playground/` works without a Permalinks save.

## License

GPL-2.0-or-later — see [https://www.gnu.org/licenses/gpl-2.0.html](https://www.gnu.org/licenses/gpl-2.0.html).
