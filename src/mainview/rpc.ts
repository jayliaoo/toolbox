import { Electroview } from "electrobun/view";
import type { AppRPC } from "../shared/types";

const rpc = Electroview.defineRPC<AppRPC>({
	handlers: {
		requests: {},
		messages: {},
	},
});

const electroview = new Electroview({ rpc });

export async function saveFile(filename: string, dataBase64: string): Promise<{ success: boolean; path?: string }> {
	return electroview.rpc.request.saveFile({ filename, dataBase64 });
}
