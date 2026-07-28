import { describe, expect, it } from "vitest";
import { canonicalPath } from "../../src/features/detect/openapi/path-grammar.js";

describe("canonical path grammar", () => {
	/* @covers project-map:CTR-007 */
	it("joins components with exactly one slash and collapses duplicates", () => {
		expect(canonicalPath(["/v2/", "/orders//by-id"])).toBe("/v2/orders/by-id");
	});

	/* @covers project-map:CTR-007 */
	it("contributes no segment for an empty component", () => {
		expect(canonicalPath(["", "/v2", "", "orders"])).toBe("/v2/orders");
	});

	/* @covers project-map:CTR-007 */
	it("strips one trailing slash but keeps the root", () => {
		expect(canonicalPath(["/v2/orders/"])).toBe("/v2/orders");
		expect(canonicalPath(["/"])).toBe("/");
		expect(canonicalPath([])).toBe("/");
	});

	/* @covers project-map:CTR-007 */
	it("drops the query string and the fragment", () => {
		expect(canonicalPath(["/orders?merchant=1#top"])).toBe("/orders");
	});

	/* @covers project-map:CTR-007 */
	it("decodes an unreserved escape and leaves a reserved one alone", () => {
		expect(canonicalPath(["/a%7Eb/c%2Fd"])).toBe("/a~b/c%2Fd");
	});

	/* @covers project-map:CTR-007 */
	it("normalizes the hex digits of a retained escape to upper case", () => {
		expect(canonicalPath(["/a%2fb"])).toBe(canonicalPath(["/a%2Fb"]));
	});

	/* @covers project-map:CTR-007 */
	it("reduces a path parameter of any syntax to one positional hole", () => {
		expect(canonicalPath(["/orders/{order_id}/items"])).toBe(
			"/orders/{}/items",
		);
		expect(canonicalPath(["/orders/:orderId/items"])).toBe("/orders/{}/items");
		expect(canonicalPath(["/orders/{order_id:[^/]+}/items"])).toBe(
			"/orders/{}/items",
		);
		expect(canonicalPath(["/orders/<int:order_id>/items"])).toBe(
			"/orders/{}/items",
		);
	});

	/* @covers project-map:CTR-007 */
	it("reduces a wildcard to a distinct hole", () => {
		expect(canonicalPath(["/static/*"])).toBe("/static/{*}");
		expect(canonicalPath(["/static/**"])).toBe("/static/{*}");
		expect(canonicalPath(["/static/{rest:.*}"])).toBe("/static/{*}");
	});

	/* @covers project-map:CTR-007 */
	it("keeps a parameter and a wildcard distinguishable", () => {
		expect(canonicalPath(["/a/{id}"])).not.toBe(canonicalPath(["/a/*"]));
	});

	/* @covers project-map:CTR-007 */
	/* @covers project-map:BEH-007 */
	it("applies each component exactly once without de-duplicating a repeat", () => {
		expect(canonicalPath(["/v2", "/v2/orders"])).toBe("/v2/v2/orders");
	});
});
