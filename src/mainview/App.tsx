import { useState, useRef, useCallback } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { saveFile } from "./rpc";

type Tool = "uuid" | "base64" | "url" | "jwt" | "hash" | "base32" | "hex" | "qrcode" | "randomkey" | "aes";

const tools: { id: Tool; icon: string; title: string; desc: string }[] = [
	{ id: "uuid", icon: "🔑", title: "UUID 生成", desc: "UUID v4 / v7" },
	{ id: "base64", icon: "📦", title: "Base64 编码/解码", desc: "标准版 & URL 安全版" },
	{ id: "base32", icon: "📮", title: "Base32 编码/解码", desc: "RFC 4648 Base32 互转" },
	{ id: "hex", icon: "🔢", title: "Hex 编码/解码", desc: "文本与十六进制互转" },
	{ id: "url", icon: "🔗", title: "URL 编码/解码", desc: "URL 安全编码与解码" },
	{ id: "hash", icon: "🧬", title: "哈希计算", desc: "MD5 / SHA-1 / SHA-2 / SHA-3" },
	{ id: "jwt", icon: "🪪", title: "JWT 解析", desc: "解析 JWT Token 结构" },
	{ id: "qrcode", icon: "📱", title: "二维码", desc: "生成与解析二维码" },
	{ id: "randomkey", icon: "🎲", title: "随机密钥", desc: "生成随机密钥 (128/192/256 bit)" },
	{ id: "aes", icon: "🔐", title: "AES 加密/解密", desc: "AES-128/192/256 · ECB/CBC/GCM/CTR" },
];

// ---- Helpers ----
function strToBytes(s: string): Uint8Array<ArrayBuffer> { return new TextEncoder().encode(s); }
function bytesToStr(b: Uint8Array): string { return new TextDecoder().decode(b); }
function bytesToHex(b: Uint8Array): string { return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join(""); }
function bytesToBase64(b: Uint8Array): string {
	let s = "";
	for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
	return btoa(s);
}
function base64ToBytes(s: string): Uint8Array<ArrayBuffer> {
	const bin = atob(s.trim().replace(/-/g, "+").replace(/_/g, "/"));
	const b = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
	return b;
}
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
	const c = hex.replace(/\s/g, "");
	if (c.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(c)) throw new Error("无效的十六进制字符串");
	const b = new Uint8Array(c.length / 2);
	for (let i = 0; i < c.length; i += 2) b[i / 2] = parseInt(c.substring(i, i + 2), 16);
	return b;
}
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(data: Uint8Array): string {
	let bits = 0, value = 0, out = "";
	for (const byte of data) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; out += B32[(value >>> bits) & 31]; } }
	if (bits > 0) out += B32[(value << (5 - bits)) & 31];
	while (out.length % 8 !== 0) out += "=";
	return out;
}
function base32Decode(s: string): Uint8Array {
	const clean = s.replace(/=+$/, "").toUpperCase();
	let bits = 0, value = 0; const out: number[] = [];
	for (const c of clean) { const idx = B32.indexOf(c); if (idx === -1) throw new Error(`无效 Base32 字符: ${c}`); value = (value << 5) | idx; bits += 5; if (bits >= 8) { bits -= 8; out.push((value >>> bits) & 255); } }
	return new Uint8Array(out);
}
function uuidv7(): string {
	const now = Date.now();
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[0] = (now / 2 ** 40) & 0xff; bytes[1] = (now / 2 ** 32) & 0xff;
	bytes[2] = (now / 2 ** 24) & 0xff; bytes[3] = (now / 2 ** 16) & 0xff;
	bytes[4] = (now / 2 ** 8) & 0xff; bytes[5] = now & 0xff;
	bytes[6] = (bytes[6] & 0x0f) | 0x70;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const h = bytesToHex(bytes);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- Shared Components ----
function Toggle({ left, right, value, onChange }: { left: string; right: string; value: boolean; onChange: (v: boolean) => void }) {
	return (
		<label className="flex items-center gap-3 cursor-pointer select-none mb-4">
			<span className={`text-sm ${!value ? "text-white font-semibold" : "text-gray-400"}`}>{left}</span>
			<div className="relative" onClick={() => onChange(!value)}>
				<div className={`w-11 h-6 rounded-full transition-colors ${value ? "bg-indigo-500" : "bg-gray-600"}`} />
				<div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? "translate-x-5" : ""}`} />
			</div>
			<span className={`text-sm ${value ? "text-white font-semibold" : "text-gray-400"}`}>{right}</span>
		</label>
	);
}

function ResultBox({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);
	const copy = () => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
	return (
		<div className="relative group">
			<pre className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 whitespace-pre-wrap break-all max-h-48 overflow-auto">{value}</pre>
			<button onClick={copy} className="absolute top-2 right-2 text-xs bg-gray-700 border border-gray-600 text-gray-300 rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600">
				{copied ? "✅ 已复制" : "📋 复制"}
			</button>
		</div>
	);
}

// ---- Tool Pages ----
function UuidPage() {
	const [uuid, setUuid] = useState("");
	return (
		<div>
			<div className="flex gap-2 mb-4">
				<button onClick={() => setUuid(crypto.randomUUID())} className="btn-primary flex-1">UUID v4</button>
				<button onClick={() => setUuid(uuidv7())} className="btn-primary flex-1">UUID v7</button>
			</div>
			{uuid && <ResultBox value={uuid} />}
		</div>
	);
}

function RandomKeyPage() {
	const [bits, setBits] = useState<128 | 192 | 256>(128);
	const [format, setFormat] = useState<"hex" | "base32" | "base64">("hex");
	const [result, setResult] = useState("");
	const generate = () => {
		const bytes = new Uint8Array(bits / 8);
		crypto.getRandomValues(bytes);
		if (format === "hex") setResult(bytesToHex(bytes));
		else if (format === "base32") setResult(base32Encode(bytes));
		else setResult(btoa(String.fromCharCode(...bytes)));
	};
	return (
		<div>
			<div className="mb-3">
				<p className="text-xs text-gray-400 mb-1">长度</p>
				<div className="flex gap-2">
					{([128, 192, 256] as const).map((b) => (
						<button key={b} onClick={() => setBits(b)} className={`flex-1 py-1.5 rounded-lg text-sm transition-colors ${bits === b ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/20"}`}>{b} bit</button>
					))}
				</div>
			</div>
			<div className="mb-4">
				<p className="text-xs text-gray-400 mb-1">格式</p>
				<div className="flex gap-2">
					{(["hex", "base32", "base64"] as const).map((f) => (
						<button key={f} onClick={() => setFormat(f)} className={`flex-1 py-1.5 rounded-lg text-sm transition-colors ${format === f ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/20"}`}>{f}</button>
					))}
				</div>
			</div>
			<button onClick={generate} className="btn-primary w-full mb-4">生成密钥</button>
			{result && <ResultBox value={result} />}
		</div>
	);
}

function Base64Page() {
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const [isUrlSafe, setIsUrlSafe] = useState(false);
	const encode = () => {
		try {
			let r = btoa(unescape(encodeURIComponent(input)));
			if (isUrlSafe) r = r.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
			setOutput(r);
		} catch { setOutput("⚠️ 无效输入"); }
	};
	const decode = () => {
		try {
			let b = input;
			if (isUrlSafe) { b = b.replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4 !== 0) b += "="; }
			setOutput(decodeURIComponent(escape(atob(b))));
		} catch { setOutput("⚠️ 无效输入"); }
	};
	return (
		<div>
			<Toggle left="标准版" right="URL 安全版" value={isUrlSafe} onChange={setIsUrlSafe} />
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入文本..." className="input-area" rows={4} />
			<div className="flex gap-2 my-4">
				<button onClick={encode} className="btn-primary flex-1">编码</button>
				<button onClick={decode} className="btn-primary flex-1">解码</button>
			</div>
			{output && <ResultBox value={output} />}
		</div>
	);
}

function Base32Page() {
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const encode = () => { try { setOutput(base32Encode(strToBytes(input))); } catch { setOutput("⚠️ 无效输入"); } };
	const decode = () => { try { setOutput(bytesToStr(base32Decode(input))); } catch { setOutput("⚠️ 无效输入"); } };
	return (
		<div>
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入文本..." className="input-area" rows={4} />
			<div className="flex gap-2 my-4">
				<button onClick={encode} className="btn-primary flex-1">编码</button>
				<button onClick={decode} className="btn-primary flex-1">解码</button>
			</div>
			{output && <ResultBox value={output} />}
		</div>
	);
}

function HexPage() {
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const encode = () => { try { setOutput(bytesToHex(strToBytes(input))); } catch (e: any) { setOutput(`⚠️ ${e.message || "无效输入"}`); } };
	const decode = () => { try { setOutput(bytesToStr(hexToBytes(input))); } catch (e: any) { setOutput(`⚠️ ${e.message || "无效输入"}`); } };
	return (
		<div>
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入文本..." className="input-area" rows={4} />
			<div className="flex gap-2 my-4">
				<button onClick={encode} className="btn-primary flex-1">编码</button>
				<button onClick={decode} className="btn-primary flex-1">解码</button>
			</div>
			{output && <ResultBox value={output} />}
		</div>
	);
}

function UrlPage() {
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const encode = () => { try { setOutput(encodeURIComponent(input)); } catch { setOutput("⚠️ 无效输入"); } };
	const decode = () => { try { setOutput(decodeURIComponent(input)); } catch { setOutput("⚠️ 无效输入"); } };
	return (
		<div>
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入文本..." className="input-area" rows={4} />
			<div className="flex gap-2 my-4">
				<button onClick={encode} className="btn-primary flex-1">编码</button>
				<button onClick={decode} className="btn-primary flex-1">解码</button>
			</div>
			{output && <ResultBox value={output} />}
		</div>
	);
}

type HashAlgo = "MD5" | "SHA-1" | "SHA-224" | "SHA-256" | "SHA-384" | "SHA-512" | "SHA3-256" | "SHA3-384" | "SHA3-512";
const HASH_ALGOS: HashAlgo[] = ["MD5", "SHA-1", "SHA-224", "SHA-256", "SHA-384", "SHA-512", "SHA3-256", "SHA3-384", "SHA3-512"];

function HashPage() {
	const [input, setInput] = useState("");
	const [algo, setAlgo] = useState<HashAlgo>("SHA-256");
	const [result, setResult] = useState("");
	const [loading, setLoading] = useState(false);

	const compute = async () => {
		if (!input) return;
		setLoading(true);
		try {
			const data = strToBytes(input);
			let hash = "";
			switch (algo) {
				case "MD5":
					hash = md5(data);
					break;
				case "SHA-1":
				case "SHA-256":
				case "SHA-384":
				case "SHA-512": {
					const buf = await crypto.subtle.digest(algo, new Uint8Array(data));
					hash = bytesToHex(new Uint8Array(buf));
					break;
				}
				case "SHA-224":
					hash = sha224(data);
					break;
				case "SHA3-256":
					hash = sha3(data, 256);
					break;
				case "SHA3-384":
					hash = sha3(data, 384);
					break;
				case "SHA3-512":
					hash = sha3(data, 512);
					break;
			}
			setResult(hash);
		} catch (e: any) {
			setResult(`⚠️ ${e.message || "计算失败"}`);
		}
		setLoading(false);
	};

	return (
		<div>
			<select value={algo} onChange={(e) => setAlgo(e.target.value as HashAlgo)} className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400">
				{HASH_ALGOS.map((a) => <option key={a} value={a}>{a}</option>)}
			</select>
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入要计算哈希的文本..." className="input-area" rows={4} />
			<button onClick={compute} disabled={loading} className="btn-primary w-full my-4">
				{loading ? "计算中..." : "计算哈希"}
			</button>
			{result && <ResultBox value={result} />}
		</div>
	);
}

function JwtPage() {
	const [input, setInput] = useState("");
	const [header, setHeader] = useState("");
	const [payload, setPayload] = useState("");
	const [error, setError] = useState("");
	const parse = () => {
		setError(""); setHeader(""); setPayload("");
		try {
			const parts = input.trim().split(".");
			if (parts.length !== 3) throw new Error("JWT 格式无效，需要三段");
			const decode = (s: string) => { const p = s.replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(p)))); };
			setHeader(JSON.stringify(decode(parts[0]), null, 2));
			setPayload(JSON.stringify(decode(parts[1]), null, 2));
		} catch (e: any) { setError(e.message || "解析失败"); }
	};
	return (
		<div>
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="粘贴 JWT token..." className="input-area" rows={4} />
			<button onClick={parse} className="btn-primary w-full my-4">解析</button>
			{error && <p className="text-red-500 text-sm mb-2">{error}</p>}
			{header && (
				<div className="space-y-3">
					<div><p className="text-xs font-semibold text-gray-400 uppercase mb-1">Header</p><ResultBox value={header} /></div>
					<div><p className="text-xs font-semibold text-gray-400 uppercase mb-1">Payload</p><ResultBox value={payload} /></div>
				</div>
			)}
		</div>
	);
}

function QrCodePage() {
	const [text, setText] = useState("");
	const [qrDataUrl, setQrDataUrl] = useState("");
	const [decoded, setDecoded] = useState("");
	const [error, setError] = useState("");
	const [saveMsg, setSaveMsg] = useState("");
	const [isParse, setIsParse] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const generate = async () => {
		if (!text) return;
		try { setQrDataUrl(await QRCode.toDataURL(text, { width: 300, margin: 2 })); setError(""); } catch { setError("生成失败"); }
	};

	const save = async () => {
		if (!qrDataUrl) return;
		setSaveMsg("");
		try {
			// Extract base64 data from data URL (remove "data:image/png;base64," prefix)
			const base64 = qrDataUrl.split(",")[1];
			const result = await saveFile(`qrcode-${Date.now()}.png`, base64);
			if (result.success) {
				setSaveMsg(`✅ 已保存到 ${result.path}`);
			} else {
				setSaveMsg("⚠️ 保存失败");
			}
		} catch {
			setSaveMsg("⚠️ 保存失败");
		}
		setTimeout(() => setSaveMsg(""), 3000);
	};

	const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const canvas = canvasRef.current;
				if (!canvas) return;
				canvas.width = img.width; canvas.height = img.height;
				const ctx = canvas.getContext("2d")!;
				ctx.drawImage(img, 0, 0);
				const imageData = ctx.getImageData(0, 0, img.width, img.height);
				const code = jsQR(imageData.data, img.width, img.height);
				if (code) { setDecoded(code.data); setError(""); } else { setDecoded(""); setError("未识别到二维码"); }
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}, []);

	return (
		<div>
			<Toggle left="生成" right="解析" value={isParse} onChange={setIsParse} />
			{!isParse ? (
				<div>
					<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="输入要编码的文本或 URL..." className="input-area" rows={3} />
					<button onClick={generate} className="btn-primary w-full my-4">生成二维码</button>
					{qrDataUrl && (
						<div className="text-center">
							<img src={qrDataUrl} alt="QR Code" className="mx-auto rounded-lg border border-gray-700 mb-3" />
							<button onClick={save} className="btn-secondary">💾 保存到下载目录</button>
							{saveMsg && <p className="text-sm mt-2 text-gray-300">{saveMsg}</p>}
						</div>
					)}
				</div>
			) : (
				<div>
					<button onClick={() => fileRef.current?.click()} className="btn-primary w-full mb-4">选择图片</button>
					<input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
					<canvas ref={canvasRef} className="hidden" />
					{decoded && <div><p className="text-xs font-semibold text-gray-400 uppercase mb-1">解析结果</p><ResultBox value={decoded} /></div>}
				</div>
			)}
			{error && <p className="text-red-500 text-sm mt-2">{error}</p>}
		</div>
	);
}

// ---- AES (WebCrypto) ----
type AesVariant = "AES-ECB" | "AES-CBC" | "AES-GCM" | "AES-CTR";
type AesBits = 128 | 192 | 256;
type KeyFormat = "utf8" | "base64" | "hex";
type DataFormat = "text" | "base64" | "hex";

const AES_IV_LEN: Partial<Record<AesVariant, number>> = { "AES-CBC": 16, "AES-GCM": 12, "AES-CTR": 16 };

function aesParams(variant: AesVariant, iv: Uint8Array<ArrayBuffer>): AesCbcParams | AesGcmParams | AesCtrParams {
	if (variant === "AES-GCM") return { name: "AES-GCM", iv, tagLength: 128 };
	if (variant === "AES-CTR") return { name: "AES-CTR", counter: iv, length: 128 };
	return { name: "AES-CBC", iv };
}

function parseAesKey(s: string, bits: AesBits, format: KeyFormat): Uint8Array<ArrayBuffer> {
	let key: Uint8Array<ArrayBuffer>;
	if (format === "utf8") key = strToBytes(s);
	else if (format === "base64") key = base64ToBytes(s);
	else key = hexToBytes(s);
	if (key.length !== bits / 8) throw new Error(`密钥长度需为 ${bits} bit / ${bits / 8} 字节（当前 ${key.length} 字节）`);
	return key;
}

// 按格式解码二进制（密钥/IV/明文的通用输入解码）
function decodeByFmt(s: string, fmt: KeyFormat | DataFormat): Uint8Array<ArrayBuffer> {
	if (fmt === "utf8" || fmt === "text") return strToBytes(s);
	if (fmt === "base64") return base64ToBytes(s);
	return hexToBytes(s);
}

// 生成恰好 length 个字节的 A-Z a-z 0-9 随机字符串（用于 utf8 格式的密钥/IV）
function randomAlnum(length: number): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const r = new Uint32Array(length);
	crypto.getRandomValues(r);
	let s = "";
	for (let i = 0; i < length; i++) s += chars[r[i] % chars.length];
	return s;
}

// ---- AES block cipher (pure JS): WebCrypto omits ECB, so implement the primitive ----
const AES_SBOX = new Uint8Array([
	0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
	0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
	0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
	0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
	0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
	0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
	0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
	0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
	0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
	0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
	0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
	0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
	0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
	0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
	0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
	0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]);
const AES_INV_SBOX = new Uint8Array([
	0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
	0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
	0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
	0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
	0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
	0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
	0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
	0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
	0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
	0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
	0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
	0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
	0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
	0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
	0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
	0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d,
]);
const AES_RCON = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];

function aesKeyExpansion(key: Uint8Array): Uint32Array {
	const Nk = key.length / 4;
	const Nr = Nk + 6;
	const w = new Uint32Array(4 * (Nr + 1));
	for (let i = 0; i < Nk; i++) w[i] = (key[4*i]<<24)|(key[4*i+1]<<16)|(key[4*i+2]<<8)|key[4*i+3];
	for (let i = Nk; i < w.length; i++) {
		let t = w[i-1];
		if (i % Nk === 0) {
			t = (t<<8)|(t>>>24);
			t = (AES_SBOX[(t>>>24)&255]<<24)|(AES_SBOX[(t>>>16)&255]<<16)|(AES_SBOX[(t>>>8)&255]<<8)|AES_SBOX[t&255];
			t ^= AES_RCON[i/Nk - 1]<<24;
		} else if (Nk > 6 && i % Nk === 4) {
			t = (AES_SBOX[(t>>>24)&255]<<24)|(AES_SBOX[(t>>>16)&255]<<16)|(AES_SBOX[(t>>>8)&255]<<8)|AES_SBOX[t&255];
		}
		w[i] = w[i-Nk] ^ t;
	}
	return w;
}

function aesGmul(a: number, b: number): number {
	let p = 0;
	for (let i = 0; i < 8; i++) {
		if (b & 1) p ^= a;
		const hi = a & 0x80;
		a = (a << 1) & 0xff;
		if (hi) a ^= 0x1b;
		b >>= 1;
	}
	return p;
}

// 单个 16 字节块加/解密，state 索引 r + 4c（列主序）
function aesBlock(w: Uint32Array, Nr: number, encrypt: boolean, block: Uint8Array, off: number, state: Uint8Array) {
	for (let i = 0; i < 16; i++) state[i] = block[off + i];
	const addRK = (round: number) => {
		for (let c = 0; c < 4; c++) {
			const word = w[round*4+c];
			state[4*c]   ^= (word>>>24)&255;
			state[4*c+1] ^= (word>>>16)&255;
			state[4*c+2] ^= (word>>>8)&255;
			state[4*c+3] ^= word&255;
		}
	};
	if (encrypt) {
		addRK(0);
		for (let round = 1; round < Nr; round++) {
			for (let i = 0; i < 16; i++) state[i] = AES_SBOX[state[i]];
			const prev = state.slice();
			for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) state[r+4*c] = prev[r+4*((c+r)%4)];
			for (let c = 0; c < 4; c++) {
				const a0=state[4*c],a1=state[4*c+1],a2=state[4*c+2],a3=state[4*c+3];
				state[4*c]   = aesGmul(a0,2)^aesGmul(a1,3)^a2^a3;
				state[4*c+1] = a0^aesGmul(a1,2)^aesGmul(a2,3)^a3;
				state[4*c+2] = a0^a1^aesGmul(a2,2)^aesGmul(a3,3);
				state[4*c+3] = aesGmul(a0,3)^a1^a2^aesGmul(a3,2);
			}
			addRK(round);
		}
		for (let i = 0; i < 16; i++) state[i] = AES_SBOX[state[i]];
		const prev = state.slice();
		for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) state[r+4*c] = prev[r+4*((c+r)%4)];
		addRK(Nr);
	} else {
		addRK(Nr);
		for (let round = Nr-1; round >= 1; round--) {
			const prev = state.slice();
			for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) state[r+4*c] = prev[r+4*((c-r+4)%4)];
			for (let i = 0; i < 16; i++) state[i] = AES_INV_SBOX[state[i]];
			addRK(round);
			for (let c = 0; c < 4; c++) {
				const a0=state[4*c],a1=state[4*c+1],a2=state[4*c+2],a3=state[4*c+3];
				state[4*c]   = aesGmul(a0,14)^aesGmul(a1,11)^aesGmul(a2,13)^aesGmul(a3,9);
				state[4*c+1] = aesGmul(a0,9)^aesGmul(a1,14)^aesGmul(a2,11)^aesGmul(a3,13);
				state[4*c+2] = aesGmul(a0,13)^aesGmul(a1,9)^aesGmul(a2,14)^aesGmul(a3,11);
				state[4*c+3] = aesGmul(a0,11)^aesGmul(a1,13)^aesGmul(a2,9)^aesGmul(a3,14);
			}
		}
		const prev = state.slice();
		for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) state[r+4*c] = prev[r+4*((c-r+4)%4)];
		for (let i = 0; i < 16; i++) state[i] = AES_INV_SBOX[state[i]];
		addRK(0);
	}
}

// ECB + PKCS#7
function aesEcbEncrypt(key: Uint8Array, data: Uint8Array): Uint8Array<ArrayBuffer> {
	const Nr = key.length / 4 + 6;
	const w = aesKeyExpansion(key);
	const state = new Uint8Array(16);
	const pad = 16 - (data.length % 16);
	const out = new Uint8Array(data.length + pad);
	const padded = new Uint8Array(data.length + pad);
	padded.set(data);
	for (let i = data.length; i < padded.length; i++) padded[i] = pad;
	for (let off = 0; off < padded.length; off += 16) {
		aesBlock(w, Nr, true, padded, off, state);
		out.set(state, off);
	}
	return out;
}

function aesEcbDecrypt(key: Uint8Array, data: Uint8Array): Uint8Array<ArrayBuffer> {
	if (data.length === 0 || data.length % 16 !== 0) throw new Error("ECB 密文长度必须为 16 字节的整数倍");
	const Nr = key.length / 4 + 6;
	const w = aesKeyExpansion(key);
	const state = new Uint8Array(16);
	const out = new Uint8Array(data.length);
	for (let off = 0; off < data.length; off += 16) {
		aesBlock(w, Nr, false, data, off, state);
		out.set(state, off);
	}
	const pad = out[out.length - 1];
	if (pad < 1 || pad > 16) throw new Error("PKCS#7 填充无效：密钥错误或密文已损坏");
	for (let i = out.length - pad; i < out.length; i++) {
		if (out[i] !== pad) throw new Error("PKCS#7 填充无效：密钥错误或密文已损坏");
	}
	return out.slice(0, out.length - pad);
}

function AesPage() {
	const [mode, setMode] = useState<"encrypt" | "decrypt">("encrypt");
	const [variant, setVariant] = useState<AesVariant>("AES-CBC");
	const [bits, setBits] = useState<AesBits>(256);
	const [keyFmt, setKeyFmt] = useState<KeyFormat>("utf8");
	const [outFmt, setOutFmt] = useState<DataFormat>("base64");
	const [inFmt, setInFmt] = useState<DataFormat>("text");
	const [keyText, setKeyText] = useState("");
	const [ivText, setIvText] = useState("");
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const ivLen = variant === "AES-ECB" ? 0 : AES_IV_LEN[variant]!;
	const isEcb = variant === "AES-ECB";
	const segBtn = (active: boolean) => `flex-1 py-1.5 rounded-lg text-sm transition-colors ${active ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/20"}`;

	const genKey = () => {
		if (keyFmt === "utf8") { setKeyText(randomAlnum(bits / 8)); return; }
		const k = new Uint8Array(bits / 8);
		crypto.getRandomValues(k);
		setKeyText(keyFmt === "base64" ? bytesToBase64(k) : bytesToHex(k));
	};
	const genIv = () => {
		if (ivLen === 0) return;
		if (keyFmt === "utf8") { setIvText(randomAlnum(ivLen)); return; }
		const iv = new Uint8Array(ivLen);
		crypto.getRandomValues(iv);
		setIvText(keyFmt === "base64" ? bytesToBase64(iv) : bytesToHex(iv));
	};

	const switchMode = (m: "encrypt" | "decrypt") => {
		setMode(m);
		if (m === "encrypt") setOutFmt((o) => (o === "text" ? "base64" : o));
		else setInFmt((f) => (f === "text" ? "base64" : f));
	};

	const run = async () => {
		setError(""); setOutput("");
		setBusy(true);
		try {
			if (!keyText.trim()) throw new Error("请输入密钥");
			if (!isEcb && !ivText.trim()) throw new Error("请输入 IV/Nonce，或点击「随机 IV」");
			if (!input.trim()) throw new Error(mode === "encrypt" ? "请输入明文" : "请输入密文");
			const rawKey = parseAesKey(keyText, bits, keyFmt);
			if (mode === "encrypt") {
				const plain = decodeByFmt(input, inFmt);
				if (isEcb) {
					const buf = aesEcbEncrypt(rawKey, plain);
					setOutput(outFmt === "hex" ? bytesToHex(buf) : bytesToBase64(buf));
				} else {
					const iv = decodeByFmt(ivText, keyFmt);
					if (iv.length !== ivLen) throw new Error(`IV/Nonce 需为 ${ivLen} 字节（当前 ${iv.length} 字节）`);
					const cryptoKey = await crypto.subtle.importKey("raw", rawKey, variant, false, ["encrypt", "decrypt"]);
					const buf = await crypto.subtle.encrypt(aesParams(variant, iv), cryptoKey, plain);
					setOutput(outFmt === "hex" ? bytesToHex(new Uint8Array(buf)) : bytesToBase64(new Uint8Array(buf)));
				}
			} else {
				const encodeOut = (pt: Uint8Array) => outFmt === "text" ? bytesToStr(pt) : outFmt === "hex" ? bytesToHex(pt) : bytesToBase64(pt);
				const cipher = decodeByFmt(input, inFmt);
				if (isEcb) {
					setOutput(encodeOut(aesEcbDecrypt(rawKey, cipher)));
				} else {
					const iv = decodeByFmt(ivText, keyFmt);
					if (iv.length !== ivLen) throw new Error(`IV/Nonce 需为 ${ivLen} 字节（当前 ${iv.length} 字节）`);
					const cryptoKey = await crypto.subtle.importKey("raw", rawKey, variant, false, ["encrypt", "decrypt"]);
					const params = aesParams(variant, iv);
					const buf = await crypto.subtle.decrypt(params, cryptoKey, cipher);
					setOutput(encodeOut(new Uint8Array(buf)));
				}
			}
		} catch (e: any) {
			if (e?.name === "OperationError") setError("操作失败：密钥、IV/Nonce 或密文不正确（GCM 还会校验认证标签）");
			else setError(e?.message ? `⚠️ ${e.message}` : "⚠️ 操作失败");
		}
		setBusy(false);
	};

	return (
		<div>
			<div className="mb-3">
				<p className="text-xs text-gray-400 mb-1">操作</p>
				<div className="flex gap-2">
					<button onClick={() => switchMode("encrypt")} className={segBtn(mode === "encrypt")}>加密</button>
					<button onClick={() => switchMode("decrypt")} className={segBtn(mode === "decrypt")}>解密</button>
				</div>
			</div>
			<div className="mb-3">
				<p className="text-xs text-gray-400 mb-1">算法模式</p>
				<div className="flex gap-2">
					{(["AES-ECB", "AES-CBC", "AES-GCM", "AES-CTR"] as const).map((v) => (
						<button key={v} onClick={() => setVariant(v)} className={segBtn(variant === v)}>{v.replace("AES-", "")}</button>
					))}
				</div>
			</div>
			<div className="mb-3">
				<p className="text-xs text-gray-400 mb-1">密钥长度</p>
				<div className="flex gap-2">
					{([128, 192, 256] as const).map((b) => (
						<button key={b} onClick={() => setBits(b)} className={segBtn(bits === b)}>{b} bit</button>
					))}
				</div>
			</div>
			<div className="mb-3">
				<p className="text-xs text-gray-400 mb-1">密钥格式</p>
				<div className="flex gap-2">
					{(["utf8", "base64", "hex"] as const).map((f) => (
						<button key={f} onClick={() => setKeyFmt(f)} className={segBtn(keyFmt === f)}>{f === "utf8" ? "UTF-8 文本" : f.toUpperCase()}</button>
					))}
				</div>
			</div>
			<div className="mb-3">
				<p className="text-xs text-gray-400 mb-1">密钥{keyFmt === "utf8" ? `（恰好 ${bits / 8} 字节）` : `（${bits} bit）`}</p>
				<div className="flex gap-2">
					<input value={keyText} onChange={(e) => setKeyText(e.target.value)} className="input-area flex-1" placeholder={keyFmt === "utf8" ? `输入 ${bits / 8} 字节密钥` : `输入 ${bits} bit 密钥（${keyFmt}）`} />
					<button onClick={genKey} className="px-3 rounded-lg text-sm bg-white/10 text-gray-300 hover:bg-white/20 whitespace-nowrap">🎲 随机密钥</button>
				</div>
			</div>
			{!isEcb && (
				<div className="mb-3">
					<p className="text-xs text-gray-400 mb-1">IV / Nonce（{ivLen} 字节，{keyFmt === "utf8" ? "UTF-8 文本" : keyFmt.toUpperCase()} 格式）</p>
					<div className="flex gap-2">
						<input value={ivText} onChange={(e) => setIvText(e.target.value)} className="input-area flex-1" placeholder={`输入 ${ivLen} 字节 IV/Nonce`} />
						<button onClick={genIv} className="px-3 rounded-lg text-sm bg-white/10 text-gray-300 hover:bg-white/20 whitespace-nowrap">🎲 随机 IV</button>
					</div>
				</div>
			)}
			<div className="mb-4">
				<p className="text-xs text-gray-400 mb-1">输入格式</p>
				<div className="flex gap-2">
					{(mode === "encrypt" ? (["text", "base64", "hex"] as const) : (["base64", "hex"] as const)).map((f) => (
						<button key={f} onClick={() => setInFmt(f)} className={segBtn(inFmt === f)}>{f === "text" ? "UTF-8 文本" : f.toUpperCase()}</button>
					))}
				</div>
			</div>
			<div className="mb-4">
				<p className="text-xs text-gray-400 mb-1">输出格式</p>
				<div className="flex gap-2">
					{(mode === "encrypt" ? (["base64", "hex"] as const) : (["text", "base64", "hex"] as const)).map((f) => (
						<button key={f} onClick={() => setOutFmt(f)} className={segBtn(outFmt === f)}>{f === "text" ? "UTF-8 文本" : f.toUpperCase()}</button>
					))}
				</div>
			</div>
			<textarea value={input} onChange={(e) => setInput(e.target.value)} className="input-area" rows={4} placeholder={mode === "encrypt" ? (inFmt === "text" ? "输入明文..." : `输入明文（${inFmt.toUpperCase()}）...`) : `输入密文（${inFmt.toUpperCase()}）...`} />
			<button onClick={run} disabled={busy} className="btn-primary w-full my-4">{busy ? "处理中..." : mode === "encrypt" ? "🔒 加密" : "🔓 解密"}</button>
			{error && <p className="text-red-500 text-sm mb-2">{error}</p>}
			{output && <ResultBox value={output} />}
			<p className={`text-xs mt-3 leading-relaxed ${isEcb ? "text-amber-500/90" : "text-gray-500"}`}>
				{isEcb
					? "⚠️ ECB 无 IV，相同明文块会产生相同密文块，会泄露数据规律（如加密图片可见轮廓），仅用于兼容旧协议/测试，请勿用于新系统。所有模式统一使用 PKCS#7 填充。"
					: "说明：CBC 使用 PKCS#7 填充；GCM 为认证加密，128 bit Tag 附在密文尾部，篡改即解密失败；CTR 计数器为 128 bit。IV/Nonce 可随密文公开，但切勿在同一密钥下重复使用。"}
			</p>
		</div>
	);
}

// ---- MD5 (pure JS) ----
function md5(data: Uint8Array): string {
	const K = [0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
	const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
	const len = data.length;
	const padLen = ((56 - (len + 1) % 64) + 64) % 64;
	const msg = new Uint8Array(len + 1 + padLen + 8);
	msg.set(data); msg[len] = 0x80;
	const view = new DataView(msg.buffer);
	view.setUint32(msg.length - 8, (len * 8) >>> 0, true);
	view.setUint32(msg.length - 4, Math.floor((len * 8) / 0x100000000) >>> 0, true);
	let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
	for (let i = 0; i < msg.length; i += 64) {
		const M = new Uint32Array(16);
		for (let j = 0; j < 16; j++) M[j] = view.getUint32(i + j * 4, true);
		let A = a0, B = b0, C = c0, D = d0;
		for (let j = 0; j < 64; j++) {
			let F: number, g: number;
			if (j < 16) { F = (B & C) | (~B & D); g = j; }
			else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
			else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16; }
			else { F = C ^ (B | ~D); g = (7 * j) % 16; }
			F = (F + A + K[j] + M[g]) >>> 0;
			A = D; D = C; C = B; B = (B + ((F << S[j]) | (F >>> (32 - S[j])))) >>> 0;
		}
		a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
	}
	const r = new Uint8Array(16); const rv = new DataView(r.buffer);
	rv.setUint32(0, a0, true); rv.setUint32(4, b0, true); rv.setUint32(8, c0, true); rv.setUint32(12, d0, true);
	return bytesToHex(r);
}

// ---- SHA-224 (pure JS, SHA-256 variant with different IV, truncated to 224 bits) ----
function sha224(data: Uint8Array): string {
	const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
	let h0=0xc1059ed8,h1=0x367cd507,h2=0x3070dd17,h3=0xf70e5939,h4=0xffc00b31,h5=0x68581511,h6=0x64f98fa7,h7=0xbefa4fa4;
	const len = data.length;
	const bitLen = len * 8;
	const padLen = ((56 - (len + 1) % 64) + 64) % 64;
	const msg = new Uint8Array(len + 1 + padLen + 8);
	msg.set(data); msg[len] = 0x80;
	const dv = new DataView(msg.buffer);
	dv.setUint32(msg.length - 4, bitLen >>> 0);
	for (let off = 0; off < msg.length; off += 64) {
		const W = new Array<number>(64);
		for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
		for (let i = 16; i < 64; i++) {
			const s0 = (((W[i-15]>>>7)|(W[i-15]<<25))^((W[i-15]>>>18)|(W[i-15]<<14))^(W[i-15]>>>3))>>>0;
			const s1 = (((W[i-2]>>>17)|(W[i-2]<<15))^((W[i-2]>>>19)|(W[i-2]<<13))^(W[i-2]>>>10))>>>0;
			W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
		}
		let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
		for (let i = 0; i < 64; i++) {
			const S1 = (((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)))>>>0;
			const ch = ((e&f)^(~e&g))>>>0;
			const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
			const S0 = (((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)))>>>0;
			const mj = ((a&b)^(a&c)^(b&c))>>>0;
			const t2 = (S0 + mj) >>> 0;
			h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
		}
		h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0; h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
	}
	const out = new Uint8Array(28);
	const ov = new DataView(out.buffer);
	ov.setUint32(0,h0); ov.setUint32(4,h1); ov.setUint32(8,h2); ov.setUint32(12,h3); ov.setUint32(16,h4); ov.setUint32(20,h5); ov.setUint32(24,h6);
	return bytesToHex(out);
}

// ---- SHA-512/t (pure JS) ----
function sha512t(data: Uint8Array, t: number): string {
	const K: bigint[] = [
		0x428a2f98d728ae22n,0x7137449123ef65cdn,0xb5c0fbcfec4d3b2fn,0xe9b5dba58189dbdcn,0x3956c25bf348b538n,0x59f111f1b605d019n,0x923f82a4af194f9bn,0xab1c5ed5da6d8118n,
		0xd807aa98a3030242n,0x12835b0145706fben,0x243185be4ee4b28cn,0x550c7dc3d5ffb4e2n,0x72be5d74f27b896fn,0x80deb1fe3b1696b1n,0x9bdc06a725c71235n,0xc19bf174cf692694n,
		0xe49b69c19ef14ad2n,0xefbe4786384f25e3n,0x0fc19dc68b8cd5b5n,0x240ca1cc77ac9c65n,0x2de92c6f592b0275n,0x4a7484aa6ea6e483n,0x5cb0a9dcbd41fbd4n,0x76f988da831153b5n,
		0x983e5152ee66dfabn,0xa831c66d2db43210n,0xb00327c898fb213fn,0xbf597fc7beef0ee4n,0xc6e00bf33da88fc2n,0xd5a79147930aa725n,0x06ca6351e003826fn,0x142929670a0e6e70n,
		0x27b70a8546d22ffcn,0x2e1b21385c26c926n,0x4d2c6dfc5ac42aedn,0x53380d139d95b3dfn,0x650a73548baf63den,0x766a0abb3c77b2a8n,0x81c2c92e47edaee6n,0x92722c851482353bn,
		0xa2bfe8a14cf10364n,0xa81a664bbc423001n,0xc24b8b70d0f89791n,0xc76c51a30654be30n,0xd192e819d6ef5218n,0xd69906245565a910n,0xf40e35855771202an,0x106aa07032bbd1b8n,
		0x19a4c116b8d2d0c8n,0x1e376c085141ab53n,0x2748774cdf8eeb99n,0x34b0bcb5e19b48a8n,0x391c0cb3c5c95a63n,0x4ed8aa4ae3418acbn,0x5b9cca4f7763e373n,0x682e6ff3d6b2b8a3n,
		0x748f82ee5defb2fcn,0x78a5636f43172f60n,0x84c87814a1f0ab72n,0x8cc702081a6439ecn,0x90befffa23631e28n,0xa4506cebde82bde9n,0xbef9a3f7b2c67915n,0xc67178f2e372532bn,
		0xca273eceea26619cn,0xd186b8c721c0c207n,0xeada7dd6cde0eb1en,0xf57d4f7fee6ed178n,0x06f067aa72176fban,0x0a637dc5a2c898a6n,0x113f9804bef90daen,0x1b710b35131c471bn,
		0x28db77f523047d84n,0x32caab7b40c72493n,0x3c9ebe0a15c9bebcn,0x431d67c49c100d4cn,0x4cc5d4becb3e42b6n,0x597f299cfc657e2an,0x5fcb6fab3ad6faecn,0x6c44198c4a475817n,
	];
	const mask = 0xffffffffffffffffn;
	const rotr = (x: bigint, n: number) => ((x >> BigInt(n)) | (x << BigInt(64 - n))) & mask;
	const ch = (x: bigint, y: bigint, z: bigint) => (x & y) ^ (~x & mask & z);
	const maj = (x: bigint, y: bigint, z: bigint) => (x & y) ^ (x & z) ^ (y & z);
	const sigma0 = (x: bigint) => rotr(x, 28) ^ rotr(x, 34) ^ rotr(x, 39);
	const sigma1 = (x: bigint) => rotr(x, 14) ^ rotr(x, 18) ^ rotr(x, 41);
	const gamma0 = (x: bigint) => rotr(x, 1) ^ rotr(x, 8) ^ (x >> 7n);
	const gamma1 = (x: bigint) => rotr(x, 19) ^ rotr(x, 61) ^ (x >> 6n);
	const iv512: bigint[] = [0x6a09e667f3bcc908n,0xbb67ae8584caa73bn,0x3c6ef372fe94f82bn,0xa54ff53a5f1d36f1n,0x510e527fade682d1n,0x9b05688c2b3e6c1fn,0x1f83d9abfb41bd6bn,0x5be0cd19137e2179n];
	let H = iv512.map(v => (v ^ 0xa5a5a5a5a5a5a5a5n) & mask);

	function compress(block: bigint[], h: bigint[]): bigint[] {
		const W = new Array<bigint>(80);
		for (let i = 0; i < 16; i++) W[i] = block[i];
		for (let i = 16; i < 80; i++) W[i] = (gamma1(W[i-2]) + W[i-7] + gamma0(W[i-15]) + W[i-16]) & mask;
		let [a,b,c,d,e,f,g,hh] = h;
		for (let i = 0; i < 80; i++) {
			const T1 = (hh + sigma1(e) + ch(e,f,g) + K[i] + W[i]) & mask;
			const T2 = (sigma0(a) + maj(a,b,c)) & mask;
			hh = g; g = f; f = e; e = (d + T1) & mask; d = c; c = b; b = a; a = (T1 + T2) & mask;
		}
		return [a,b,c,d,e,f,g,hh].map((v, i) => (h[i] + v) & mask);
	}
	function hashBytes(msg: Uint8Array, initH: bigint[]): bigint[] {
		const len = msg.length;
		const bitLen = BigInt(len) * 8n;
		const padLen = ((112 - (len + 1) % 128) + 128) % 128;
		const padded = new Uint8Array(len + 1 + padLen + 16);
		padded.set(msg); padded[len] = 0x80;
		const pv = new DataView(padded.buffer);
		pv.setBigUint64(padded.length - 8, bitLen);
		let h = [...initH];
		for (let off = 0; off < padded.length; off += 128) {
			const block: bigint[] = [];
			for (let i = 0; i < 16; i++) block.push(pv.getBigUint64(off + i * 8));
			h = compress(block, h);
		}
		return h;
	}
	H = hashBytes(strToBytes(`SHA-512/${t}`), H);
	const result = hashBytes(data, H);
	let hex = "";
	for (const v of result) hex += v.toString(16).padStart(16, "0");
	return hex.slice(0, (t / 8) * 2);
}

// ---- SHA-3 / Keccak (pure JS) ----
function sha3(data: Uint8Array, bits: number): string {
	const rateBytes = (1600 - bits * 2) / 8;
	const state = new BigUint64Array(25);
	const RC: bigint[] = [0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n];
	const ROT = [[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]];
	function keccakF() {
		for (let round = 0; round < 24; round++) {
			const C = new BigUint64Array(5);
			for (let x = 0; x < 5; x++) C[x] = state[x] ^ state[x+5] ^ state[x+10] ^ state[x+15] ^ state[x+20];
			for (let x = 0; x < 5; x++) { const D = C[(x+4)%5] ^ ((C[(x+1)%5] << 1n) | (C[(x+1)%5] >> 63n)); for (let y = 0; y < 25; y += 5) state[y+x] ^= D; }
			const B = new BigUint64Array(25);
			for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) { const r = BigInt(ROT[x][y]); B[y*5+((2*x+3*y)%5)] = (state[x+y*5] << r) | (state[x+y*5] >> (64n - r)); }
			for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) state[y+x] = B[y+x] ^ (~B[y+(x+1)%5] & B[y+(x+2)%5]);
			state[0] ^= RC[round];
		}
	}
	const padded = new Uint8Array(Math.ceil((data.length + 1) / rateBytes) * rateBytes);
	padded.set(data); padded[data.length] = 0x06; padded[padded.length - 1] |= 0x80;
	const view = new DataView(padded.buffer);
	for (let off = 0; off < padded.length; off += rateBytes) { for (let i = 0; i < rateBytes / 8; i++) state[i] ^= view.getBigUint64(off + i * 8, true); keccakF(); }
	const hashBytes = bits / 8;
	const out = new Uint8Array(hashBytes);
	const sv = new DataView(new ArrayBuffer(200));
	for (let i = 0; i < 25; i++) sv.setBigUint64(i * 8, state[i], true);
	out.set(new Uint8Array(sv.buffer, 0, hashBytes));
	return bytesToHex(out);
}

// ---- Page Map & App ----
const pageMap: Record<Tool, () => JSX.Element> = { uuid: UuidPage, base64: Base64Page, base32: Base32Page, hex: HexPage, url: UrlPage, hash: HashPage, jwt: JwtPage, qrcode: QrCodePage, randomkey: RandomKeyPage, aes: AesPage };

function App() {
	const [active, setActive] = useState<Tool | null>(null);
	if (active) {
		const tool = tools.find((t) => t.id === active)!;
		const Page = pageMap[active];
		return (
			<div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
				<div className="container mx-auto px-4 py-8 max-w-2xl">
					<button onClick={() => setActive(null)} className="flex items-center gap-1 text-indigo-300 hover:text-white transition-colors mb-6 text-sm"><span>←</span> 返回工具箱</button>
					<div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10">
						<h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><span className="text-2xl">{tool.icon}</span> {tool.title}</h2>
						<Page />
					</div>
				</div>
			</div>
		);
	}
	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
			<div className="container mx-auto px-4 py-10 max-w-4xl">
				<h1 className="text-4xl font-bold text-center text-white mb-2">🧰 开发者工具箱</h1>
				<p className="text-center text-indigo-300 mb-10">常用编码、解码、生成工具集合</p>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					{tools.map((t) => (
						<button key={t.id} onClick={() => setActive(t.id)} className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-5 text-left hover:bg-white/20 transition-colors group">
							<span className="text-3xl block mb-2">{t.icon}</span>
							<h2 className="text-sm font-bold text-white mb-1">{t.title}</h2>
							<p className="text-xs text-indigo-300">{t.desc}</p>
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

export default App;
