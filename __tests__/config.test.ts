import { describe, expect, test } from "bun:test";
import { validateConfig } from "../src/config.ts";

function createLogger() {
	const warnings: string[] = [];
	const errors: string[] = [];

	return {
		logger: {
			warn(message: string) {
				warnings.push(message);
			},
			error(message: string) {
				errors.push(message);
			},
		},
		warnings,
		errors,
	};
}

describe("validateConfig", () => {
	test("accepts valid config", () => {
		const result = validateConfig(
			{
				server: "https://ntfy.example.com/",
				topic: "kaged-secret-topic",
				auth_token_env: "NTFY_TOKEN",
				priority_attention: "high",
				priority_completion: "min",
				click_base_url: "https://kaged.example.com/",
			},
			{},
		);

		expect(result).toEqual({
			server: "https://ntfy.example.com",
			topic: "kaged-secret-topic",
			auth_token_env: "NTFY_TOKEN",
			auth_token: undefined,
			priority_attention: "high",
			priority_completion: "min",
			click_base_url: "https://kaged.example.com",
			timeout_ms: 5000,
			retry_count: 2,
			retry_delay_ms: 1000,
		});
	});

	test("rejects missing server", () => {
		expect(validateConfig({ topic: "x" }, {})).toBeNull();
	});

	test("rejects invalid server URL", () => {
		expect(validateConfig({ server: "not-a-url", topic: "x" }, {})).toBeNull();
	});

	test("rejects http server URL", () => {
		expect(validateConfig({ server: "http://ntfy.local", topic: "x" }, {})).toBeNull();
	});

	test("rejects missing topic", () => {
		expect(validateConfig({ server: "https://ntfy.example.com" }, {})).toBeNull();
	});

	test("rejects topic with whitespace", () => {
		expect(
			validateConfig({ server: "https://ntfy.example.com", topic: "bad topic" }, {}),
		).toBeNull();
	});

	test("rejects topic with slash", () => {
		expect(
			validateConfig({ server: "https://ntfy.example.com", topic: "bad/topic" }, {}),
		).toBeNull();
	});

	test("rejects both auth token sources", () => {
		expect(
			validateConfig(
				{
					server: "https://ntfy.example.com",
					topic: "good-topic",
					auth_token: "a",
					auth_token_env: "NTFY_TOKEN",
				},
				{},
			),
		).toBeNull();
	});

	test("falls back for invalid priorities with warnings", () => {
		const { logger, warnings } = createLogger();
		const result = validateConfig(
			{
				server: "https://ntfy.example.com",
				topic: "good-topic",
				priority_attention: "loud",
				priority_completion: "urgent",
			},
			{},
			logger,
		);

		expect(result?.priority_attention).toBe("urgent");
		expect(result?.priority_completion).toBe("low");
		expect(warnings).toHaveLength(2);
	});

	test("clamps numeric values with warnings", () => {
		const { logger, warnings } = createLogger();
		const result = validateConfig(
			{
				server: "https://ntfy.example.com",
				topic: "good-topic",
				timeout_ms: 99,
				retry_count: 99,
				retry_delay_ms: 50_000,
			},
			{},
			logger,
		);

		expect(result?.timeout_ms).toBe(1000);
		expect(result?.retry_count).toBe(5);
		expect(result?.retry_delay_ms).toBe(10000);
		expect(warnings).toHaveLength(3);
	});
});
