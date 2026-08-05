export type Release = {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
};

const RELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RUNNING =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[^+]+)?(?:\+.+)?$/;

/** The grammar a declared floor must match, shared with the configuration schema. */
export const RELEASE_PATTERN = RELEASE;

export function parseRelease(value: string): Release | null {
	return releaseFrom(RELEASE.exec(value));
}

/**
 * The running version, which unlike a floor carries a prerelease or a build
 * suffix. Both are dropped: a candidate of X emits what X emits.
 */
export function parseRunning(value: string): Release | null {
	return releaseFrom(RUNNING.exec(value));
}

function releaseFrom(match: RegExpExecArray | null): Release | null {
	if (match === null) {
		return null;
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
	};
}

export function isPrerelease(value: string): boolean {
	return value.includes("-");
}

export function compareReleases(left: Release, right: Release): number {
	if (left.major !== right.major) {
		return left.major - right.major;
	}
	if (left.minor !== right.minor) {
		return left.minor - right.minor;
	}
	return left.patch - right.patch;
}

/**
 * The floor a run raises the repository to, or null where it raises nothing.
 * A patch carries the format of its minor, so raising to the running patch
 * would let one invocation lock a team out over a difference no emission
 * reflects.
 */
export function raisedFloorFor(
	running: Release,
	declared: Release,
): string | null {
	const isHigher =
		running.major > declared.major ||
		(running.major === declared.major && running.minor > declared.minor);
	return isHigher ? `${running.major}.${running.minor}.0` : null;
}
