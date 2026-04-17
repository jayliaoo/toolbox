import { useState, useRef, useCallback } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { saveFile } from "./rpc";

type Tool = "uuid" | "base64" | "url" | "jwt" | "hash" | "base32" | "hex" | "qrcode";

const tools: { id: Tool; icon: string; title: string; desc: string }[] = [
	{ id: "uuid", icon: "🔑", title: "UUID 生成", desc: "UUID v4 / v7" },
	{ id: "base64", icon: "📦", title: "Base64 编码/解码", desc: "标准版 & URL 安全版" },
	{ id: "base32", icon: "📮", title: "Base32 编码/解码", desc: "RFC 4648 Base32 互转" },
	{ id: "hex", icon: "🔢", title: "Hex 编码/解码", desc: "文本与十六进制互转" },
	{ id: "url", icon: "🔗", title: "URL 编码/解码", desc: "URL 安全编码与解码" },
	{ id: "hash", icon: "🧬", title: "哈希计算", desc: "MD5 / SHA-1 / SHA-2 / SHA-3" },
	{ id: "jwt", icon: "🪪", title: "JWT 解析", desc: "解析 JWT Token 结构" },
	{ id: "qrcode", icon: "📱", title: "二维码", desc: "生成与解析二维码" },
];

// ---- Helpers ----
function strToBytes(s: string): Uint8Array { return new TextEncoder().encode(s); }
function bytesToStr(b: Uint8Array): string { return new TextDecoder().decode(b); }
function bytesToHex(b: Uint8Array): string { return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(hex: string): Uint8Array {
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
	const [isV7, setIsV7] = useState(false);
	return (
		<div>
			<Toggle left="v4" right="v7" value={isV7} onChange={setIsV7} />
			<button onClick={() => setUuid(isV7 ? uuidv7() : crypto.randomUUID())} className="btn-primary w-full mb-4">生成 UUID {isV7 ? "v7" : "v4"}</button>
			{uuid && <ResultBox value={uuid} />}
		</div>
	);
}

function Base64Page() {
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const [isDecode, setIsDecode] = useState(false);
	const [isUrlSafe, setIsUrlSafe] = useState(false);
	const run = () => {
		try {
			if (!isDecode) {
				let r = btoa(unescape(encodeURIComponent(input)));
				if (isUrlSafe) r = r.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
				setOutput(r);
			} else {
				let b = input;
				if (isUrlSafe) { b = b.replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4 !== 0) b += "="; }
				setOutput(decodeURIComponent(escape(atob(b))));
			}
		} catch { setOutput("⚠️ 无效输入"); }
	};
	return (
		<div>
			<Toggle left="标准版" right="URL 安全版" value={isUrlSafe} onChange={setIsUrlSafe} />
			<Toggle left="编码" right="解码" value={isDecode} onChange={setIsDecode} />
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入文本..." className="input-area" rows={4} />
			<button onClick={run} className="btn-primary w-full my-4">转换</button>
			{output && <ResultBox value={output} />}
		</div>
	);
}

function Base32Page() {
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const [isDecode, setIsDecode] = useState(false);
	const run = () => { try { setOutput(isDecode ? bytesToStr(base32Decode(input)) : base32Encode(strToBytes(input))); } catch { setOutput("⚠️ 无效输入"); } };
	return (
		<div>
			<Toggle left="编码" right="解码" value={isDecode} onChange={setIsDecode} />
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入文本..." className="input-area" rows={4} />
			<button onClick={run} className="btn-primary w-full my-4">转换</button>
			{output && <ResultBox value={output} />}
		</div>
	);
}

function HexPage() {
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const [isDecode, setIsDecode] = useState(false);
	const run = () => { try { setOutput(isDecode ? bytesToStr(hexToBytes(input)) : bytesToHex(strToBytes(input))); } catch (e: any) { setOutput(`⚠️ ${e.message || "无效输入"}`); } };
	return (
		<div>
			<Toggle left="编码" right="解码" value={isDecode} onChange={setIsDecode} />
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={isDecode ? "输入十六进制..." : "输入文本..."} className="input-area" rows={4} />
			<button onClick={run} className="btn-primary w-full my-4">转换</button>
			{output && <ResultBox value={output} />}
		</div>
	);
}

function UrlPage() {
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const [isDecode, setIsDecode] = useState(false);
	const run = () => { try { setOutput(isDecode ? decodeURIComponent(input) : encodeURIComponent(input)); } catch { setOutput("⚠️ 无效输入"); } };
	return (
		<div>
			<Toggle left="编码" right="解码" value={isDecode} onChange={setIsDecode} />
			<textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入文本..." className="input-area" rows={4} />
			<button onClick={run} className="btn-primary w-full my-4">转换</button>
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
const pageMap: Record<Tool, () => JSX.Element> = { uuid: UuidPage, base64: Base64Page, base32: Base32Page, hex: HexPage, url: UrlPage, hash: HashPage, jwt: JwtPage, qrcode: QrCodePage };

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
