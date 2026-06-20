import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { NotificationEvent } from "@kaged/plugin-types";
import type { ValidatedConfig } from "../src/config.ts";
import { performSend } from "../src/send.ts";

function getHeader(init: RequestInit | undefined, key: string): string | undefined {
	if (!init?.headers || Array.isArray(init.headers)) {
		return undefined;
	}

	if (init.headers instanceof Headers) {
		return init.headers.get(key) ?? undefined;
	}

	const value = init.headers[key as keyof typeof init.headers];
	return typeof value === "string" ? value : undefined;
}

const ORIGINAL_FETCH = globalThis.fetch;

const BASE_CONFIG: ValidatedConfig = {
	server: "https://ntfy.example.com",
	topic: "default-topic",
	priority_attention: "urgent",
	priority_completion: "low",
	timeout_ms: 5000,
	retry_count: 2,
	retry_delay_ms: 10,
};

const ATTENTION_EVENT: NotificationEvent = {
	id: "evt_1",
	class: "attention.required",
	session_id: "session-1",
	project_id: "project-1",
	run_id: "run-1",
	summary: "Need operator",
	deep_link: "/projects/project-1/sessions/session-1?attention=ask",
	emitted_at: 1,
	attention_kind: "ask",
};

beforeEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
});

describe("performSend", () => {
	test("returns delivered outcome on 200 with external id", async () => {
		const fetchMock = mock(async (input: string | URL | Request, init?: RequestInit) => {
			expect(String(input)).toBe("https://ntfy.example.com/default-topic");
			expect(init?.method).toBe("POST");
			expect(getHeader(init, "Title")).toBe("kaged ⚑ project-1: Need operator");
			expect(getHeader(init, "Tags")).toBe("kaged,attention,project-1");
			expect(getHeader(init, "Priority")).toBe("urgent");
			expect(init?.body).toBe('Session "session-1" needs you: ask');
			return new Response("ok", { status: 200, headers: { id: "msg_123" } });
		});

		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT);
		expect(result).toEqual({
			status: "delivered",
			external_id: "msg_123",
		});
	});

	test("returns non-retryable failure for 4xx without retry", async () => {
		const fetchMock = mock(async () => new Response("bad", { status: 403 }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT);
		expect(result).toEqual({
			status: "failed",
			reason: "client_error: 403",
			retryable: false,
		});
		expect(fetchMock.mock.calls).toHaveLength(1);
	});

	test("retries on 429 and respects Retry-After", async () => {
		const delays: number[] = [];
		let attempts = 0;
		const fetchMock = mock(async () => {
			attempts += 1;
			if (attempts === 1) {
				return new Response("slow down", { status: 429, headers: { "Retry-After": "0.05" } });
			}

			return new Response("ok", { status: 202, headers: { id: "msg_429" } });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT, {
			sleep: async (ms) => {
				delays.push(ms);
			},
		});

		expect(result).toEqual({ status: "delivered", external_id: "msg_429" });
		expect(fetchMock.mock.calls).toHaveLength(2);
		expect(delays).toEqual([50]);
	});

	test("retries on 5xx", async () => {
		let attempts = 0;
		const fetchMock = mock(async () => {
			attempts += 1;
			if (attempts === 1) {
				return new Response("oops", { status: 503 });
			}

			return new Response("ok", { status: 200, headers: { id: "msg_503" } });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT, {
			sleep: async () => {},
		});

		expect(result).toEqual({ status: "delivered", external_id: "msg_503" });
		expect(fetchMock.mock.calls).toHaveLength(2);
	});

	test("retries on network errors", async () => {
		let attempts = 0;
		const fetchMock = mock(async () => {
			attempts += 1;
			if (attempts === 1) {
				throw new Error("socket hang up");
			}

			return new Response("ok", { status: 200, headers: { id: "msg_net" } });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT, {
			sleep: async () => {},
		});

		expect(result).toEqual({ status: "delivered", external_id: "msg_net" });
		expect(fetchMock.mock.calls).toHaveLength(2);
	});

	test("returns retryable transient failure after retries exhausted", async () => {
		const fetchMock = mock(async () => {
			throw new Error("network down");
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend({ ...BASE_CONFIG, retry_count: 1 }, ATTENTION_EVENT, {
			sleep: async () => {},
		});
		expect(result).toEqual({
			status: "failed",
			reason: "transient: network down",
			retryable: true,
		});
		expect(fetchMock.mock.calls).toHaveLength(2);
	});

	test("uses auth token and click url when configured", async () => {
		const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
			expect(getHeader(init, "Authorization")).toBe("Bearer secret-token");
			expect(getHeader(init, "Click")).toBe(
				"https://kaged.example.com/projects/project-1/sessions/session-1?attention=ask",
			);
			return new Response("ok", { status: 200 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await performSend(
			{
				...BASE_CONFIG,
				auth_token_env: "NTFY_TOKEN",
				click_base_url: "https://kaged.example.com",
			},
			ATTENTION_EVENT,
			{ env: { NTFY_TOKEN: "secret-token" } },
		);
	});
});
