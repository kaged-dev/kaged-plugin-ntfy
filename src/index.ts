import type { NotificationChannel, SystemPlugin, SystemPluginContext } from "@kaged/plugin-types";
import { buildChannel } from "./channel.ts";
import { validateConfig } from "./config.ts";

const plugin = {
	name: "ntfy",
	version: "0.1.0",
	description: "Reference tier-3 notification channel (ntfy)",
	setup(ctx: SystemPluginContext) {
		const config = validateConfig(ctx.config, process.env, ctx.log);
		if (!config) {
			ctx.log.error("ntfy plugin failed config validation");
			return;
		}

		const channel: NotificationChannel = buildChannel(config, ctx.log);
		ctx.on("notification.channel.register", (registrar) => {
			registrar.register(channel);
		});
	},
} satisfies SystemPlugin;

export default plugin;
