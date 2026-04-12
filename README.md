# WP REST API Playground

Test and explore the WordPress REST API directly from the frontend.

## Description

WP REST API Playground provides a developer-friendly interface accessible at `/rest-api-playground/` on your WordPress site. It lets you browse every registered REST API endpoint, build requests with a guided form, authenticate with Application Passwords, and inspect responses — all without leaving the browser.

### Features

- **Three-panel layout** — endpoint browser on the left, request builder in the centre, response viewer on the right.
- **Full endpoint discovery** — all registered REST API routes (core and plugin-added) are loaded automatically and grouped by resource type (Posts, Pages, Users, Media, Comments, and more).
- **Live search** — filter endpoints by route path or category as you type.
- **Method tabs** — switch between GET, POST, PUT, PATCH, and DELETE for any route that supports multiple methods.
- **Schema-driven form fields** — path parameters, query parameters, and request body fields are rendered from the endpoint's registered schema, including type hints, descriptions, required markers, default values, and enum dropdowns.
- **Raw JSON body** — toggle between a guided form and a raw JSON textarea for POST/PUT/PATCH requests.
- **Application Password authentication** — enter a username and Application Password once; credentials are saved to `localStorage` and sent as a `Basic` Authorization header on every authenticated request.
- **Syntax-highlighted response** — JSON responses are displayed with colour-coded keys, strings, numbers, booleans, and nulls.
- **Response headers tab** — inspect the full set of response headers alongside the body.
- **Copy to clipboard** — copy the formatted response body with one click.
- **Timing indicator** — each request shows its round-trip duration in milliseconds.

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

Credentials are stored in the browser's `localStorage` and are sent automatically with every subsequent request. Click **Clear** to remove them.

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
├── wp-rest-api-playground.php   # Plugin header and bootstrap
├── composer.json                # PHP autoloading (PSR-4)
├── package.json                 # Node build tooling
├── src/
│   ├── Plugin.php               # Registers all hooks
│   ├── Page.php                 # Serves the /rest-api-playground/ page
│   └── REST_Controller.php      # /wp-json/rest-playground/v1/routes endpoint
├── templates/
│   └── playground.php           # Standalone HTML template
├── assets/
│   ├── css/style.css            # Source stylesheet
│   └── js/script.js             # Source JavaScript
└── dist/                        # Compiled assets (generated by npm run build)
```

### How the endpoint list works

`REST_Controller` hooks into `rest_api_init` and registers a public endpoint at:

```
GET /wp-json/rest-playground/v1/routes
```

It calls `rest_get_server()->get_routes()` to retrieve every registered route, normalises their argument schemas, and groups them into human-readable categories. The frontend fetches this endpoint on page load.

### Building assets

Assets are compiled by [10up-toolkit](https://github.com/10up/10up-toolkit). The entry point is `assets/js/script.js` (which imports `assets/css/style.css`). Compiled output lands in `dist/js/rest-playground.js` and `dist/css/rest-playground.css`.

## Frequently Asked Questions

**The page shows a 404.**
Go to **Settings → Permalinks** and save. This flushes WordPress rewrite rules and registers the `/rest-api-playground/` slug.

**Authenticated requests return 401.**
Make sure you are using an Application Password (not your login password). Application Passwords are generated under **Users → Profile** and require WordPress 5.6 or higher.

**An endpoint returns an error I don't understand.**
Switch to the **Headers** tab in the response panel — the `X-WP-Total`, `X-WP-TotalPages`, and `X-WP-Nonce` headers often give additional context. The response body usually contains a `code`, `message`, and `data` object with details.

**I don't see plugin-registered endpoints.**
Ensure the plugin that registers those endpoints is active. Routes are discovered live, so any active plugin's REST routes will appear automatically.

## AI Disclosure

This plugin was developed with the assistance of [Claude](https://claude.ai) (Anthropic's AI). All code, structure, and documentation were generated through a collaborative session between the author and Claude Code. The implementation has been reviewed and is maintained by the author.

## Changelog

### 1.0.0
- Initial release.

## License

GPL-2.0-or-later — see [https://www.gnu.org/licenses/gpl-2.0.html](https://www.gnu.org/licenses/gpl-2.0.html).
