import { describe, expect, mock, test } from "bun:test";
import type { ChannelContext, NotificationEvent } from "@kaged/plugin-types";
import { buildChannel } from "../src/channel.ts";
import type { ValidatedConfig } from "../src/config.ts";

const BASE_CONFIG: ValidatedConfig = {
	server: "https://ntfy.example.com",
	topic: "default-topic",
	priority_attention: "urgent",
	priority_completion: "low",
	timeout_ms: 5000,
	retry_count: 0,
	retry_delay_ms: 10,
};

const EVENT: NotificationEvent = {
	id: "evt_1",
	class: "attention.required",
	session_id: "session-1",
	project_id: "project-1",
	run_id: "run-1",
	summary: "Need operator",
	deep_link: "/projects/project-1/sessions/session-1?attention=checkpoint",
	emitted_at: 1,
	attention_kind: "checkpoint",
};

const CONTEXT: ChannelContext = {
	operatorId: "operator-1",
	config: {},
};

describe("buildChannel", () => {
	test("exposes stable metadata", () => {
		const channel = buildChannel(BASE_CONFIG);
		expect(channel.id).toBe("ntfy");
		expect(channel.label).toBe("ntfy");
	});

	test("returns delivery outcome from send", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(
			async () => new Response("ok", { status: 200, headers: { id: "msg_1" } }),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const channel = buildChannel(BASE_CONFIG);
		const result = await channel.send(EVENT, CONTEXT);
		expect(result).toEqual({
			status: "delivered",
			external_id: "msg_1",
		});

		globalThis.fetch = originalFetch;
	});

	test("merges routing config over plugin config", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(async (input: string | URL | Request) => {
			expect(String(input)).toBe("https://ntfy.example.com/override-topic");
			return new Response("ok", { status: 200 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const channel = buildChannel(BASE_CONFIG);
		await channel.send(EVENT, { ...CONTEXT, config: { topic: "override-topic" } });

		globalThis.fetch = originalFetch;
	});

	test("does not throw on synchronous render errors", async () => {
		const channel = buildChannel(BASE_CONFIG);
		const invalidEvent = {
			...EVENT,
			summary: undefined,
		} as unknown as NotificationEvent;

		const result = await channel.send(invalidEvent, CONTEXT);
		expect(result).toEqual({
			status: "failed",
			reason: "render_error: notification event field summary must be a non-empty string",
			retryable: false,
		});
	});
});
