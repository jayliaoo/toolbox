# 开发者工具箱

一个基于 Electrobun 的 macOS 桌面应用，提供常用开发工具集合。

## 功能

- **UUID 生成**：支持 UUID v4（随机）和 v7（基于时间戳）
- **Base64 编码/解码**：支持标准版和 URL 安全版
- **Base32 编码/解码**：RFC 4648 标准实现
- **Hex 编码/解码**：文本与十六进制互转
- **URL 编码/解码**：encodeURIComponent / decodeURIComponent
- **哈希计算**：支持 MD5、SHA-1、SHA-224、SHA-256、SHA-384、SHA-512、SHA-512/224、SHA-512/256、SHA3-256、SHA3-512、SHA3-512/224、SHA3-512/256
- **JWT 解析**：解析 JWT Token 的 Header 和 Payload
- **二维码**：生成二维码、从图片解析二维码、保存到下载目录

## 安装

```bash
bun install
```

## 开发

```bash
# 开发模式（推荐，支持热更新）
bun run dev:hmr

# 开发模式（不支持热更新，使用打包后的资源）
bun run dev

# 构建生产版本
bun run build
```

## 项目结构

```
├── src/
│   ├── bun/
│   │   └── index.ts        # 主进程（Electrobun/Bun）
│   ├── mainview/
│   │   ├── App.tsx         # React 应用组件
│   │   ├── main.tsx        # React 入口
│   │   ├── index.html      # HTML 模板
│   │   ├── index.css       # Tailwind CSS
│   │   └── rpc.ts          # RPC 通信（Bun ↔ 浏览器）
│   └── shared/
│       └── types.ts        # RPC 类型定义
├── electrobun.config.ts    # Electrobun 配置
├── vite.config.ts          # Vite 配置
├── tailwind.config.js      # Tailwind 配置
└── package.json
```

## 技术栈

- **Electrobun**：超快的桌面应用框架（Bun + WebKit）
- **React 18**：用户界面
- **Tailwind CSS**：样式
- **Vite**：构建工具和 HMR
- **qrcode**：二维码生成
- **jsqr**：二维码解析

## 快捷键

- **Cmd+C / Cmd+V / Cmd+X**：复制 / 粘贴 / 剪切
- **Cmd+Z / Cmd+Shift+Z**：撤销 / 重做

## 构建发布

```bash
# 构建当前平台
bunx electrobun build

# 构建指定平台
bunx electrobun build --targets macos-arm64,macos-x64,win-x64,linux-x64
```

## 许可证

MIT
