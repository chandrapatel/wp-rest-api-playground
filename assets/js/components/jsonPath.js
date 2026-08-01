/**
 * WP REST API Playground — JSONPath subset evaluator.
 *
 * Dependency-free. Covers the slice of JSONPath that is actually useful against
 * WP REST payloads:
 *
 * `$.name` `$['name']` `name` — object key.
 * `$[0]` `$[-1]` `$[1:3]` — index, index from the end, slice.
 * `$.*` `$[*]` — every child.
 * `$..name` `$..*` — recursive descent.
 * `$[?(@.status == 'publish')]` — filter children by comparison.
 * `$[?(@.id > 10 && @.slug =~ /hello/)]` — `&&` / `||`, regex match.
 * `$[?(@.featured_media)]` — filter by key existence.
 *
 * Deliberately unsupported: script expressions, unions (`[0,2]`), root/parent
 * references inside a filter, and filters nested inside a filter's own path.
 * Anything unrecognised throws a SyntaxError so the UI can tell the user what
 * went wrong instead of silently returning no matches.
 *
 * Parsing happens in two passes — parseQuery() emits filter segments carrying
 * their raw source, then compileSegments() turns that source into predicates.
 * Filters need to evaluate relative paths, so the single-pass version would
 * have made the parser and the evaluator mutually recursive.
 */

/**
 * @typedef {object} JsonNode
 * @property {Array<string|number>} path Keys and indices from the document root.
 * @property {unknown} value The value at that path.
 */

const isContainer = (value) => value !== null && typeof value === 'object';

/**
 * Own-property test. A plain `in` check would also match inherited members, so
 * `$.toString` or `[?(@.constructor)]` would report a hit against data that
 * contains no such key.
 *
 * @param {object} target - Object to test.
 * @param {string} key    - Property name.
 * @returns {boolean}
 */
const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);

/**
 * List a container's children as [key, value] pairs. Scalars have none.
 *
 * @param {unknown} value - Value to inspect.
 * @returns {Array<[string|number, unknown]>}
 */
const childEntries = (value) => {
	if (Array.isArray(value)) return value.map((item, index) => [index, item]);
	if (isContainer(value)) return Object.keys(value).map((key) => [key, value[key]]);
	return [];
};

// ---------------------------------------------------------------------------
// Tokenising helpers
// ---------------------------------------------------------------------------

/**
 * Read a single- or double-quoted string starting at `i`.
 *
 * @param {string} src - Full query source.
 * @param {number} i   - Index of the opening quote.
 * @returns {{ value: string, next: number }}
 */
const readQuoted = (src, i) => {
	const quote = src[i];
	let out = '';
	let j = i + 1;

	while (j < src.length && src[j] !== quote) {
		if (src[j] === '\\' && j + 1 < src.length) {
			out += src[j + 1];
			j += 2;
		} else {
			out += src[j];
			j += 1;
		}
	}

	if (j >= src.length) throw new SyntaxError('Unterminated quoted string.');
	return { value: out, next: j + 1 };
};

/**
 * Read a bare key name up to the next `.` or `[`.
 *
 * @param {string} src - Full query source.
 * @param {number} i   - Index to start reading from.
 * @returns {{ value: string, next: number }}
 */
const readName = (src, i) => {
	let j = i;
	while (j < src.length && src[j] !== '.' && src[j] !== '[') j += 1;
	const value = src.slice(i, j);
	if (!value) throw new SyntaxError('Expected a property name.');
	return { value, next: j };
};

/**
 * Split on a top-level operator, ignoring occurrences inside quotes or
 * parentheses.
 *
 * @param {string} src - Expression source.
 * @param {string} op  - Two-character operator, e.g. `&&`.
 * @returns {string[]}
 */
const splitTop = (src, op) => {
	const parts = [];
	let depth = 0;
	let start = 0;
	let i = 0;

	while (i < src.length) {
		const ch = src[i];

		if (ch === "'" || ch === '"') {
			i = readQuoted(src, i).next;
		} else if (depth === 0 && src.startsWith(op, i)) {
			parts.push(src.slice(start, i));
			i += op.length;
			start = i;
		} else {
			if (ch === '(') depth += 1;
			else if (ch === ')') depth -= 1;
			i += 1;
		}
	}

	parts.push(src.slice(start));
	return parts;
};

// ---------------------------------------------------------------------------
// Literals and comparison semantics
// ---------------------------------------------------------------------------

/**
 * Turn a filter's right-hand side into a JS value. Bare words fall through as
 * strings so `@.status == publish` behaves like the quoted form.
 *
 * @param {string} raw - Literal source text.
 * @returns {unknown}
 */
const parseLiteral = (raw) => {
	const text = raw.trim();
	const quoted = text.length > 1 && (text[0] === "'" || text[0] === '"');

	if (quoted && text[text.length - 1] === text[0]) return text.slice(1, -1);
	if (text === 'true') return true;
	if (text === 'false') return false;
	if (text === 'null') return null;
	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) return Number(text);

	const regex = text.match(/^\/(.*)\/([gimsuy]*)$/);
	if (regex) {
		try {
			return new RegExp(regex[1], regex[2]);
		} catch {
			throw new SyntaxError(`Invalid regular expression: ${text}`);
		}
	}

	return text;
};

/**
 * Compare loosely enough that `@.id == '5'` matches a numeric 5, which is how
 * people actually type these queries.
 *
 * @param {unknown} left  - Value from the document.
 * @param {unknown} right - Literal from the query.
 * @returns {boolean}
 */
const looseEquals = (left, right) => {
	if (left === right) return true;
	if (left === null || right === null) return false;
	if (left === undefined || right === undefined) return false;
	if (isContainer(left)) return false;
	return String(left) === String(right);
};

/**
 * Apply a relational operator, preferring a numeric comparison when both sides
 * look numeric and falling back to string ordering otherwise.
 *
 * @param {string} op     - One of `>`, `>=`, `<`, `<=`.
 * @param {unknown} left  - Value from the document.
 * @param {unknown} right - Literal from the query.
 * @returns {boolean}
 */
const relational = (op, left, right) => {
	const numLeft = Number(left);
	const numRight = Number(right);
	const numeric =
		left !== null &&
		left !== '' &&
		right !== null &&
		right !== '' &&
		!Number.isNaN(numLeft) &&
		!Number.isNaN(numRight);

	const a = numeric ? numLeft : String(left);
	const b = numeric ? numRight : String(right);

	if (op === '>') return a > b;
	if (op === '>=') return a >= b;
	if (op === '<') return a < b;
	return a <= b;
};

// ---------------------------------------------------------------------------
// Query parsing (pass 1)
// ---------------------------------------------------------------------------

/**
 * Parse the contents of a `[...]` accessor.
 *
 * @param {string} src - Full query source.
 * @param {number} i   - Index of the opening bracket.
 * @returns {{ seg: object, next: number }}
 */
const parseBracket = (src, i) => {
	let j = i + 1;

	if (src[j] === '?') {
		j += 1;
		if (src[j] !== '(') throw new SyntaxError('Expected "(" after "?" in filter.');

		const start = j;
		let depth = 0;
		let closed = false;

		while (j < src.length && !closed) {
			const ch = src[j];
			if (ch === "'" || ch === '"') {
				j = readQuoted(src, j).next;
			} else {
				if (ch === '(') depth += 1;
				else if (ch === ')') depth -= 1;
				j += 1;
				closed = ch === ')' && depth === 0;
			}
		}
		if (!closed) throw new SyntaxError('Unbalanced parentheses in filter.');

		const body = src.slice(start + 1, j - 1);
		while (src[j] === ' ') j += 1;
		if (src[j] !== ']') throw new SyntaxError('Expected "]" to close the filter.');

		return { seg: { type: 'filter', source: body }, next: j + 1 };
	}

	if (src[j] === "'" || src[j] === '"') {
		const quoted = readQuoted(src, j);
		j = quoted.next;
		while (src[j] === ' ') j += 1;
		if (src[j] !== ']') throw new SyntaxError('Expected "]" after a quoted key.');
		return { seg: { type: 'key', name: quoted.value }, next: j + 1 };
	}

	const close = src.indexOf(']', j);
	if (close === -1) throw new SyntaxError('Missing "]" in query.');

	const inner = src.slice(j, close).trim();
	if (!inner) throw new SyntaxError('Empty "[]" in query.');
	if (inner === '*') return { seg: { type: 'wildcard' }, next: close + 1 };

	if (inner.includes(':')) {
		const parts = inner.split(':');
		if (parts.length > 3) throw new SyntaxError(`Invalid slice: [${inner}]`);
		const bound = (part) => {
			const trimmed = part.trim();
			if (!trimmed) return null;
			if (!/^-?\d+$/.test(trimmed)) throw new SyntaxError(`Invalid slice bound: ${trimmed}`);
			return Number(trimmed);
		};
		return {
			seg: {
				type: 'slice',
				start: bound(parts[0]),
				end: bound(parts[1]),
				step: parts.length === 3 ? bound(parts[2]) : null,
			},
			next: close + 1,
		};
	}

	if (/^-?\d+$/.test(inner)) {
		return { seg: { type: 'index', index: Number(inner) }, next: close + 1 };
	}

	return { seg: { type: 'key', name: inner }, next: close + 1 };
};

/**
 * Parse a query string into an ordered list of segments. Filter segments still
 * hold their raw source at this point; compileSegments() finishes the job.
 *
 * @param {string} query - The JSONPath expression.
 * @returns {object[]}
 * @throws {SyntaxError} When the expression cannot be parsed.
 */
const parseQuery = (query) => {
	const src = String(query).trim();
	const segments = [];
	let i = src[0] === '$' ? 1 : 0;

	while (i < src.length) {
		const ch = src[i];

		if (ch === '.' && src[i + 1] === '.') {
			i += 2;
			if (src[i] === '*') {
				segments.push({ type: 'descend', name: null });
				i += 1;
			} else if (src[i] === '[' || i >= src.length) {
				segments.push({ type: 'descend', name: null });
			} else {
				const name = readName(src, i);
				segments.push({ type: 'descend', name: name.value });
				i = name.next;
			}
		} else if (ch === '.') {
			i += 1;
			if (src[i] === '*') {
				segments.push({ type: 'wildcard' });
				i += 1;
			} else {
				const name = readName(src, i);
				segments.push({ type: 'key', name: name.value });
				i = name.next;
			}
		} else if (ch === '[') {
			const bracket = parseBracket(src, i);
			segments.push(bracket.seg);
			i = bracket.next;
		} else if (segments.length === 0) {
			// Leading bare name, so `items[0].id` works without the `$.` prefix.
			const name = readName(src, i);
			segments.push({ type: 'key', name: name.value });
			i = name.next;
		} else {
			throw new SyntaxError(`Unexpected "${ch}" at position ${i}.`);
		}
	}

	return segments;
};

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Collect every descendant of `node`, optionally only those under a given key.
 *
 * @param {JsonNode} node    - Node to walk.
 * @param {string|null} name - Key to match, or null for every descendant.
 * @param {JsonNode[]} out   - Accumulator, filled in document order.
 */
const descend = (node, name, out) => {
	childEntries(node.value).forEach(([key, value]) => {
		const child = { path: [...node.path, key], value };
		if (name === null || String(key) === name) out.push(child);
		descend(child, name, out);
	});
};

/**
 * Apply one compiled segment to the current node set.
 *
 * @param {JsonNode[]} nodes - Current matches.
 * @param {object} seg       - Compiled segment.
 * @returns {JsonNode[]}
 */
const applySegment = (nodes, seg) => {
	const out = [];

	nodes.forEach((node) => {
		const { value } = node;

		if (seg.type === 'key') {
			if (Array.isArray(value) && /^\d+$/.test(seg.name)) {
				const index = Number(seg.name);
				if (index < value.length)
					out.push({ path: [...node.path, index], value: value[index] });
			} else if (isContainer(value) && !Array.isArray(value) && hasOwn(value, seg.name)) {
				out.push({ path: [...node.path, seg.name], value: value[seg.name] });
			}
		} else if (seg.type === 'index') {
			if (Array.isArray(value)) {
				const index = seg.index < 0 ? value.length + seg.index : seg.index;
				if (index >= 0 && index < value.length) {
					out.push({ path: [...node.path, index], value: value[index] });
				}
			}
		} else if (seg.type === 'slice') {
			if (Array.isArray(value)) {
				const step = seg.step === null || seg.step === 0 ? 1 : seg.step;
				const bound = (raw, fallback) => {
					if (raw === null) return fallback;
					return raw < 0 ? Math.max(value.length + raw, 0) : Math.min(raw, value.length);
				};
				const to = bound(seg.end, value.length);
				for (let k = bound(seg.start, 0); k < to; k += step) {
					out.push({ path: [...node.path, k], value: value[k] });
				}
			}
		} else if (seg.type === 'wildcard') {
			childEntries(value).forEach(([key, child]) => {
				out.push({ path: [...node.path, key], value: child });
			});
		} else if (seg.type === 'descend') {
			descend(node, seg.name, out);
		} else if (seg.type === 'filter') {
			childEntries(value).forEach(([key, child]) => {
				if (seg.test(child)) out.push({ path: [...node.path, key], value: child });
			});
		}
	});

	return out;
};

/**
 * Run a compiled segment list against a node set.
 *
 * @param {JsonNode[]} nodes  - Starting nodes, usually the document root.
 * @param {object[]} segments - Compiled segments.
 * @returns {JsonNode[]}
 */
const evaluateSegments = (nodes, segments) =>
	segments.reduce(
		(current, seg) => (current.length ? applySegment(current, seg) : current),
		nodes,
	);

// ---------------------------------------------------------------------------
// Filter compilation (pass 2)
// ---------------------------------------------------------------------------

/**
 * Compile one comparison, or a bare existence check, into a predicate.
 *
 * @param {string} src - Comparison source, e.g. `@.status == 'publish'`.
 * @returns {(value: unknown) => boolean}
 */
const parseComparison = (src) => {
	const text = src.trim();
	if (!text) throw new SyntaxError('Empty condition in filter.');

	const match = text.match(/^(@[^\s=!<>~]*)\s*(==|!=|>=|<=|=~|>|<)\s*(.+)$/);
	const lhs = match ? match[1] : text;

	if (lhs[0] !== '@') {
		throw new SyntaxError(`Filter conditions must start with "@", got: ${text}`);
	}

	// `@` alone means the child itself; anything after it is a relative path.
	const relative = parseQuery(lhs.slice(1));
	if (relative.some((seg) => seg.type === 'filter')) {
		throw new SyntaxError('A filter cannot contain another filter.');
	}

	const resolve = (value) => {
		const found = evaluateSegments([{ path: [], value }], relative);
		return found.length ? found[0].value : undefined;
	};

	if (!match) return (value) => resolve(value) !== undefined;

	const op = match[2];
	const expected = parseLiteral(match[3]);

	return (value) => {
		const actual = resolve(value);
		if (op === '==') return looseEquals(actual, expected);
		if (op === '!=') return !looseEquals(actual, expected);
		if (op === '=~') {
			return (
				expected instanceof RegExp && typeof actual === 'string' && expected.test(actual)
			);
		}
		if (actual === undefined) return false;
		return relational(op, actual, expected);
	};
};

/**
 * Compile a full filter body, honouring `&&` binding tighter than `||`.
 *
 * @param {string} src - Filter source between `?(` and `)`.
 * @returns {(value: unknown) => boolean}
 */
const parseFilter = (src) => {
	const groups = splitTop(src, '||').map((clause) => splitTop(clause, '&&').map(parseComparison));
	return (value) => groups.some((group) => group.every((test) => test(value)));
};

/**
 * Replace each filter segment's raw source with its compiled predicate.
 *
 * @param {object[]} segments - Segments from parseQuery().
 * @returns {object[]}
 */
const compileSegments = (segments) =>
	segments.map((seg) =>
		seg.type === 'filter' ? { type: 'filter', test: parseFilter(seg.source) } : seg,
	);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a JSONPath expression against a value.
 *
 * @param {unknown} data - The parsed response body.
 * @param {string} query - The JSONPath expression.
 * @returns {JsonNode[]} Matches in document order.
 * @throws {SyntaxError} When the expression cannot be parsed.
 */
export const queryJson = (data, query) =>
	evaluateSegments([{ path: [], value: data }], compileSegments(parseQuery(query)));

/**
 * Render a path array back into a JSONPath string.
 *
 * @param {Array<string|number>} path - Keys and indices from the root.
 * @returns {string}
 */
export const formatPath = (path) =>
	path.reduce((acc, key) => {
		if (typeof key === 'number') return `${acc}[${key}]`;
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `${acc}.${key}`;
		return `${acc}['${key.replace(/'/g, "\\'")}']`;
	}, '$');
