import base from "@cyberash-dev/dev-tooling/eslint.base.mjs";

export default [
	{ ignores: ["dist", "node_modules", "tests/fixtures"] },
	...base,
];
