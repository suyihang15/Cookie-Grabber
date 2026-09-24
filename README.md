# Cookie Grabber

Edge 浏览器扩展，一键采集当前网站的完整 Cookie，支持多站点记录和多格式导出。

## 功能

- **完整采集** — 四路并发采集，不遗漏任何 Cookie
  - URL 匹配
  - 域名匹配（含父域）
  - 页面 JS 上下文读取（document.cookie）
- **多站点记录** — 采集后按站点域名持久化存储，随时切换查看
- **多格式导出** — JSON / Header 字符串 / 一键复制到剪贴板
- **过滤搜索** — 按名称、域名、值快速定位
- **属性标记** — 显示 Secure、HttpOnly、来源等属性

## 采集原理

点击采集后，同时通过以下方式获取 Cookie 并去重合并：

| 方式 | 说明 |
|------|------|
| `chrome.cookies.getAll({ url })` | 匹配当前页面 URL 的 Cookie |
| `chrome.cookies.getAll({ domain })` | 按完整域名获取 |
| `chrome.cookies.getAll({ domain: 顶级域 })` | 获取父域 Cookie |
| `document.cookie`（脚本注入） | 读取页面 JS 可见的 Cookie |

## 安装

1. 下载本项目文件夹
2. 打开 Edge，地址栏输入 `edge://extensions/`
3. 打开左下角 **开发人员模式** 开关
4. 点击 **加载解压缩的扩展**
5. 选择本项目文件夹（包含 `manifest.json` 的那个）

## 使用

1. 打开目标网站
2. 点击浏览器工具栏的 Cookie Grabber 图标
3. 点击 **采集** 按钮
4. 查看采集结果，支持过滤搜索
5. 点击 **JSON** / **Header** / **复制** 导出

## 导出格式

**JSON** — 完整结构化数据，包含 name、value、domain、path、expires、secure、httpOnly 等字段

```json
{
  "site": "example.com",
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123...",
      "domain": ".example.com",
      "path": "/",
      "expires": "2026-12-31T23:59:59.000Z",
      "secure": true,
      "httpOnly": true,
      "sameSite": "Lax"
    }
  ]
}
```

**Header** — 直接用于请求头的格式

```
session_id=abc123; token=xyz789; uid=10086
```

## 文件结构

```
cookie-ext/
├── manifest.json    # 扩展配置
├── popup.html       # 弹窗页面
├── popup.css        # 样式
├── popup.js         # 逻辑
├── icons/           # 图标
└── README.md        # 本文件
```

## 权限说明

| 权限 | 用途 |
|------|------|
| `cookies` | 读取浏览器 Cookie |
| `tabs` | 获取当前标签页 URL |
| `storage` | 持久化存储采集记录 |
| `scripting` | 注入脚本读取 document.cookie |
| `activeTab` | 仅在用户点击扩展时激活 |
| `<all_urls>` | 允许访问任意网站的 Cookie |   

   ## 效果展示    
   <img width="344" height="472" alt="屏幕截图 2026-09-24 231139" src="https://github.com/user-attachments/assets/acd8e064-2dfd-4666-ac84-3c5e4494638b" />

