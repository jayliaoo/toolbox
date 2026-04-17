import type { RPCSchema } from "electrobun/bun";

export type AppRPC = {
	bun: RPCSchema<{
		requests: {
			saveFile: {
				params: { filename: string; dataBase64: string };
				response: { success: boolean; path?: string };
			};
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {};
	}>;
};
