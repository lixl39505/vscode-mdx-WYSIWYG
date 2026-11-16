# MDX WYSIWYG

为 MDX 源码提供轻量编辑器装饰：粗体黄色加粗、斜体、删除线、链接青色下划线、图片描述紫色。保留全部源码与语法标记，文件内容不会改变。

支持 ** 与 __ 粗体、* 与 _ 斜体、双波浪线删除线、行内链接、引用链接及定义、行内及引用图片。链接内的粗体保持黄色，斜体叠加显示。引用支持完整、折叠和简写形式，未定义引用按普通文本处理。图片描述整体着色，不解析描述内部的强调。

通过 mdast / micromark 的 MDX 扩展解析语法和 UTF-16 位置。组件内合法 Markdown 可以装饰；JSX 属性、JS 表达式、ESM、行内代码及代码块不会被当作 Markdown。

只监听编辑器和文档事件并设置 TextEditorDecorationType；不注册语言、文件关联、语言服务、语法高亮、快捷键或折叠提供器。建议与 unifiedjs.vscode-mdx 配合使用，由它提供 MDX 语言支持。只有语言 ID 为 mdx 的文档参与装饰。

## 配置

在 VS Code 设置中搜索 MDX WYSIWYG，或编辑 settings.json：

| 设置 | 默认值 | 用途 |
| --- | --- | --- |
| mdxWysiwyg.enabled | true | 启用装饰，可按工作区/资源配置 |
| mdxWysiwyg.boldColor | #E6D5A7 | 粗体颜色 |
| mdxWysiwyg.linkColor | #78DCE8 | 链接文字和引用定义颜色 |
| mdxWysiwyg.imageColor | #AB9DF2 | 图片描述颜色 |

颜色为 #RRGGBB 格式，非法值回退默认值；颜色配置按窗口读取。默认配色适用于深色主题，浅色主题请自行调整。禁用后立即清除装饰。

## 开发、测试和打包

需要 VS Code 1.146.0 或更新版本。开发构建使用 Node.js 22+、TypeScript、esbuild 和 vsce；扩展安装后无需运行 npm。

```sh
npm ci --cache temp/npm-cache
npm run check
npm test
npm run build
npm run package
```

打包产物：artifacts/mdx-wysiwyg-0.1.4.vsix。依赖已打包，不随 VSIX 附带 node_modules。

按 F5 启动 Extension Development Host；打开 examples/demo.mdx 并确认语言为 MDX。npm run watch 可持续构建，修改后重新加载开发窗口。

## 本地安装、卸载

```sh
code --install-extension artifacts/mdx-wysiwyg-0.1.4.vsix --force
code --uninstall-extension lixl39505.mdx-wysiwyg
```

也可以在扩展面板菜单选择“从 VSIX 安装”。安装或卸载后按提示重新加载窗口。

## 性能与已知限制

- **按视口装饰**：只为可见区域及前后各 20 行设置装饰。分栏共用解析缓存，滚动时不重新解析；快速跳转时，文字可能短暂未着色。
- **更新时机**：输入防抖 150ms，保存时立即更新。等待解析期间保留原有装饰，局部样式可能暂时过时。
- **大文件**：使用同步全文解析，长文仍可能短暂占用扩展宿主线程；超过 200,000 个 UTF-16 单元的文档自动停用装饰。
- **无效语法**：JSX、表达式等 MDX 语法未闭合或无效时，暂时清除全篇装饰；语法恢复有效后自动恢复。
- **语法范围**：遵循 MDX 的 Markdown 识别规则，包括组件内的空行要求；不额外支持 frontmatter、数学语法等方言，单波浪线不作为删除线。
- **主题配色**：始终保留源码标记；装饰颜色可能覆盖主题对相同文字的配色，默认颜色适合深色主题。
- **资源管理**：仅缓存可见文档的解析范围，关闭文件或停用扩展时释放相关资源；不访问链接、加载图片或执行表达式。

测试与性能数据见[集成测试记录](docs/test-results.md)和[渲染性能报告](docs/rendering-performance.md)。实测结果仅覆盖报告中的环境与场景，不保证所有文档和硬件均无卡顿。

可运行以下命令复现集成与渲染测试；测试使用独立 VS Code 窗口，日志、trace 和截图保存在 `temp/`：

```sh
npm run test:host
npm run test:renderer
node scripts/summarize-renderer.mjs
```
