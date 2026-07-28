import {
	POSITIONAL_HOLE,
	WILDCARD_HOLE,
} from "../../../core/domain/facts/value-ir.js";

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
const PERCENT_ESCAPE = /%([0-9A-Fa-f]{2})/g;
const BRACED = /^\{.*\}$/s;
const ANGLED = /^<.*>$/s;
const COLON_PREFIXED = /^:.+$/s;
const WILDCARD_REGEX_SUFFIX = /:\s*\.\s*[*+]\s*\}$/;

/**
 * Reduces the ordered components of a route to the canonical form two
 * repositories can be joined on. Each component is applied exactly once: a
 * repeated prefix stays repeated, because guessing that `/v2` + `/v2/orders`
 * meant `/v2/orders` would silently invent a route nobody declared.
 */
export function canonicalPath(components: readonly string[]): string {
	const segments = components
		.map(stripQueryAndFragment)
		.flatMap(splitSegments)
		.filter((segment) => segment.length > 0)
		.map(canonicalSegment);
	return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function stripQueryAndFragment(component: string): string {
	const cut = component.search(/[?#]/);
	return cut < 0 ? component : component.slice(0, cut);
}

/**
 * A separator inside a parameter group is not a separator: the aiohttp form
 * `{order_id:[^/]+}` carries a slash inside its character class.
 */
function splitSegments(component: string): string[] {
	const segments: string[] = [];
	let depth = 0;
	let current = "";
	for (const character of component) {
		if (character === "{" || character === "<") {
			depth++;
		} else if (character === "}" || character === ">") {
			depth = Math.max(0, depth - 1);
		}
		if (character === "/" && depth === 0) {
			segments.push(current);
			current = "";
			continue;
		}
		current += character;
	}
	segments.push(current);
	return segments;
}

function canonicalSegment(segment: string): string {
	if (isWildcard(segment)) {
		return WILDCARD_HOLE;
	}
	if (isParameter(segment)) {
		return POSITIONAL_HOLE;
	}
	return normalizeEscapes(segment);
}

function isWildcard(segment: string): boolean {
	if (segment === "*" || segment === "**") {
		return true;
	}
	return BRACED.test(segment) && WILDCARD_REGEX_SUFFIX.test(segment);
}

function isParameter(segment: string): boolean {
	return (
		BRACED.test(segment) || ANGLED.test(segment) || COLON_PREFIXED.test(segment)
	);
}

/**
 * Percent-decoding is limited to unreserved characters: decoding a reserved
 * one would change what the path means. Retained escapes are upper-cased so
 * that `%2f` and `%2F` cannot split one route into two.
 */
function normalizeEscapes(segment: string): string {
	return segment.replace(PERCENT_ESCAPE, (_match, hex: string) => {
		const decoded = String.fromCharCode(Number.parseInt(hex, 16));
		return UNRESERVED.test(decoded) ? decoded : `%${hex.toUpperCase()}`;
	});
}
