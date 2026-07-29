/**
 * The sending APIs of the HTTP client libraries the detector recognizes without
 * being configured. A member outside this set inside one of these packages is
 * unclassified, not absent: it is inside the candidate universe.
 */
const SENDING_MEMBERS: ReadonlySet<string> = new Set([
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"head",
	"options",
	"request",
	"send",
]);

const PACKAGES: ReadonlySet<string> = new Set([
	"requests",
	"aiohttp",
	"httpx",
	"urllib3",
]);

/** The constructors that build a request without sending it. */
const BUILDERS: ReadonlySet<string> = new Set(["Request", "PreparedRequest"]);

/**
 * The halves of these packages that serve requests rather than send them. A
 * response the service returns is not an outbound call, so a site inside one
 * of them is outside the candidate universe of project-map:BEH-013.
 */
const SERVER_HALVES: readonly string[] = ["aiohttp.web"];

export function isTransportPackage(origin: string): boolean {
	const root = origin.split(".")[0];
	if (root === undefined || !PACKAGES.has(root)) {
		return false;
	}
	return !SERVER_HALVES.some(
		(half) => origin === half || origin.startsWith(`${half}.`),
	);
}

export function isSendingMember(member: string): boolean {
	return SENDING_MEMBERS.has(member);
}

export function isRequestBuilder(origin: string): boolean {
	const last = origin.split(".").pop();
	return last !== undefined && BUILDERS.has(last) && isTransportPackage(origin);
}
