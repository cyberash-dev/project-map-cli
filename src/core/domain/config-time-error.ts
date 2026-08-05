export const CONFIG_TIME_ERROR_CODES = [
	"spec_locator_outside_repo",
	"monorepo_root_unresolved",
	"invalid_selector",
	"duplicate_module_id",
	"schema_violation",
	"tool_version_too_old",
] as const;

export type ConfigTimeErrorCode = (typeof CONFIG_TIME_ERROR_CODES)[number];

/**
 * Raised before any build runs. A config-time error is never an artifact
 * diagnostic: the artifact of a rejected configuration does not exist.
 */
export class ConfigTimeError extends Error {
	constructor(
		readonly code: ConfigTimeErrorCode,
		message: string,
	) {
		super(message);
		this.name = "ConfigTimeError";
	}
}
