# dsh-zsearch

> 版本：**0.2.0** · 许可证：Apache-2.0 · 状态：公开发布准备中
>
> 适用于 DeepSeek Harness **0.2.2-rc.1** 及以上、**0.3.0** 以下。

在 DeepSeek Harness 里做一次「知乎 + 全网」的双源检索：左侧是流式 AI 综述，右侧是它引用的逐字原文。回答里的 `[1]`、`[2]` 角标可以点击，直接定位到对应的证据卡。

## 功能

- **双源检索**：同时查询知乎与全网，候选合并、去重、排序后交给模型。
- **左答右证**：左侧流式回答，右侧按视角分组的引用卡，每张包含 1–2 句原文和来源。
- **引用核对**：回答引用了、但没有被筛进视角分组的候选，会自动摘句补到「其他参考内容」，保证角标有落点。
- **Markdown 回答**：支持标题、列表、表格、代码块、引用、链接和图片；原始 HTML 按文本显示。
- **划词检索**：在对话中选中文本，点击浮层即可带词检索。
- **状态持久化**：切走或刷新页面后恢复上次的检索词、回答和卡片。

## 环境要求

- **DeepSeek Harness** `>=0.2.2-rc.1 <0.3.0`（桌面端或 `dsh web` 均可）。
- **Node.js** `>=24.9.0`（DSH 自身要求）。
- 本机 **`zhihu-cli`** 与知乎 **Access Secret**：首次使用时插件会检测并引导安装/配置。
- DSH 中已配置可用的默认模型：回答、筛选和扩词都通过宿主模型完成。

## 安装

桌面端：打开 **Plugins → Add plugin**，输入 `dsh-zsearch`，或选择本仓库目录进行本地安装。

CLI：

```sh
dsh plugin --profile <profile> add dsh-zsearch
```

安装或更新 Host 代码后需要重启 DSH。卸载：

```sh
dsh plugin --profile <profile> remove dsh-zsearch
```

## 首次使用

插件检测 `zhihu-cli` 与 Access Secret，缺失时显示三步引导：

1. 安装知乎 CLI：读取官方 manifest、下载 Skill、校验 SHA-256 后安装；
2. 配置 Access Secret：提交到 Host，经 `auth set --secret-stdin` 写入系统钥匙串；
3. 完成：`cli.found && auth.configured` 后打勾。

Secret 不会写入仓库或日志；钥匙串不可用时回退到宿主 `credentials`，以进程环境变量传给 CLI。

## 数据与隐私

- 检索通过本机 `zhihu-cli` 的 `search zhihu` / `search global` 完成。
- 回答、筛选和扩词使用 DSH 宿主当前配置的模型；插件本身不保存模型 Key。
- Host 只监听 `127.0.0.1`；无遥测、无外部上报。
- 头像只代理 `zhimg.com` 的 HTTPS 图片，限制 512KB。
- 面板状态存在当前 Web GUI origin 的 `localStorage`（键 `dsh-zsearch:panel.v1`，schema v2），不包含 Access Secret。

## 兼容与已知限制

- 兼容 DSH `0.2.2-rc.1` 起；已在 `0.2.2-rc.3` 上验证。DSH 升级可能带来接口变化，升级前请查看 DSH 的升级指南。
- 回答基于候选原文生成，右栏展示的是筛选摘句，不保证语义上逐字同源；补充区只缓解这一点。
- 回答输入约 1.3 万字符，成本和延迟高于轻量检索。
- 缓存命中时「重新检索」仍可能拿到旧缓存（Client 不发送 `refresh=1`）。
- 同 query 并发不合并；没有分阶段的 token 统计，只有总数与诊断环。
- 回答被 provider 中断或超时时会显示「回答生成中断」，保留已生成部分，不自动续写。

## 开发

```sh
node --check index.js
node --check client.js
node test/integration.mjs
node test/client-smoke.mjs
node test/client-render.mjs

# 或一次跑完
npm run verify
```

- Host 代码（`index.js`）在 DSH 启动时加载，改完必须重启；只改 `client.js` 刷新页面即可。
- 测试使用假 CLI / 假模型，不消耗真实额度；真实模型质量需要单独评估。
- `GET /zsearch/api/diagnostics` 可查看最近 20 次检索的 finish / usage / 耗时（不包含回答正文）。

## 目录

```text
index.js            Host 半：检索、模型调用、SSE、安装引导
client.js           Client 半：面板、结果页、Markdown 渲染
cordis.patch.yml    bundle patch
locale/             插件标题、描述、详情页入口
icon.svg            插件图标
docs/DETAIL.md      插件详情页文档
docs/design.md      视觉规范
docs/flow-and-prompts.md  设计与 prompt 变更日志（历史材料，不是现行接口契约）
test/               集成、Client 注册、渲染测试
```

## 许可证

[Apache-2.0](LICENSE)
