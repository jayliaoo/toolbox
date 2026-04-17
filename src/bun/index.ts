import { BrowserWindow, BrowserView, Updater, ApplicationMenu, Utils } from "electrobun/bun";
import type { AppRPC } from "../shared/types";

ApplicationMenu.setApplicationMenu([
	{
		label: "App",
		submenu: [{ label: "Quit", role: "quit", accelerator: "CmdOrCtrl+W" }],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "pasteAndMatchStyle" },
			{ role: "delete" },
			{ role: "selectAll" },
		],
	},
	{
		label: "Window",
		submenu: [
			{ role: "close", accelerator: "CmdOrCtrl+W" },
		],
	},
]);

const rpc = BrowserView.defineRPC<AppRPC>({
	handlers: {
		requests: {
			saveFile: async ({ filename, dataBase64 }) => {
				try {
					const downloadsPath = Utils.paths.downloads;
					const filePath = `${downloadsPath}/${filename}`;
					const binary = Uint8Array.from(atob(dataBase64), (c) => c.charCodeAt(0));
					await Bun.write(filePath, binary);
					return { success: true, path: filePath };
				} catch (e: any) {
					console.error("Save file error:", e);
					return { success: false };
				}
			},
		},
		messages: {},
	},
});

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log("Vite dev server not running. Run 'bun run dev:hmr' for HMR support.");
		}
	}
	return "views://mainview/index.html";
}

const url = await getMainViewUrl();

const win = new BrowserWindow({
	title: "Toolbox",
	url,
	rpc,
	frame: {
		width: 900,
		height: 700,
		x: 200,
		y: 200,
	},
});

// 监听窗口关闭事件
win.on("close", () => {
	// 窗口关闭逻辑
});

// 注册 Cmd+W 快捷键关闭窗口
// 使用 before-input-event 来拦截快捷键
// 注意：electrobun 的 BrowserWindow 可能不支持 webContents
// 所以我们使用菜单来处理快捷键

console.log("React Tailwind Vite app started!");
