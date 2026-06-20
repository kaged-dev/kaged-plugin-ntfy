import type {
	ChannelContext,
	DeliveryOutcome,
	NotificationChannel,
	NotificationEvent,
} from "@kaged/plugin-types";
import type { ValidatedConfig } from "./config.ts";
import { performSend, validateMergedConfig } from "./send.ts";

type Logger = {
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
};

export function buildChannel(config: ValidatedConfig, logger?: Logger): NotificationChannel {
	return {
		id: "ntfy",
		label: "ntfy",
		async send(event: NotificationEvent, context: ChannelContext): Promise<DeliveryOutcome> {
			try {
				const merged = validateMergedConfig(config, context.config, process.env);
				if (!merged) {
					logger?.error("ntfy routing config is invalid");
					return {
						status: "failed",
						reason: "invalid_config: ntfy routing config failed validation",
						retryable: false,
					};
				}

				return await performSend(merged, event, { logger });
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				logger?.error("ntfy send failed before dispatch", { reason });
				return {
					status: "failed",
					reason: `render_error: ${reason}`,
					retryable: false,
				};
			}
		},
	};
}
