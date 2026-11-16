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

本机检查版本为 VS Code 1.146.0 arm64，engines.vscode 为 ^1.146.0。开发构建使用 Node.js 22 或更新版本。参考相邻 mdx-image-paste 项目的 TypeScript + esbuild + vsce 结构；扩展运行时只有一个打包后的 CommonJS 文件，无需运行 npm。

```sh
npm ci --cache temp/npm-cache
npm run check
npm test
npm run build
npm run package
```

打包产物：artifacts/mdx-wysiwyg-0.1.4.vsix。依赖已打包，不随 VSIX 附带 node_modules。无 Marketplace 发布流程及凭据。

按 F5 启动 Extension Development Host；打开 examples/demo.mdx 并确认语言为 MDX。npm run watch 可持续构建，修改后重新加载开发窗口。

## 本地安装、卸载

发布者和作者为 lixl39505，与 MDX Image Paste 一致；扩展 ID 为 lixl39505.mdx-wysiwyg。升级自 local-mdx 版本时请先卸载旧 ID，避免两个扩展重复装饰：

```sh
code --uninstall-extension local-mdx.mdx-wysiwyg
```

默认粗体使用浅暖黄 #E6D5A7，比初版的鲜黄色更柔和，并提高旧版灰黄的明度。若曾手动设置 mdxWysiwyg.boldColor，请重置该项以使用新默认值。

```sh
code --install-extension artifacts/mdx-wysiwyg-0.1.4.vsix --force
code --uninstall-extension lixl39505.mdx-wysiwyg
```

也可以在扩展面板菜单选择“从 VSIX 安装”。安装或卸载后按提示重新加载窗口。

## 性能与已知限制

只为可见 MDX 文档保存版本号和范围，同一文档的分栏共用解析结果；AST 解析后释放。输入防抖 150ms，编辑时保留已有装饰，由 VS Code 跟随文本移动范围，解析完成后一次替换，避免全篇先消失再出现。保存立即更新。装饰仅提交每个编辑器可见区域及前后各 20 行，分栏分别计算；跨行范围裁剪至该区域，重叠缓冲区合并。滚动和折叠导致的视口变化只使用缓存，不重新解析；未变化的装饰类型不重复提交。文本修改后重新提交视口内非空类型，避免 VS Code 自动移动的旧范围与缓存坐标不一致。切换和关闭释放缓存及定时器，停用时释放装饰及全部监听器。不会读取链接、网络、图片或执行表达式。

当前使用同步整文解析，超过 200,000 个 UTF-16 单元的文档自动不装饰，以限制阻塞和内存；普通文件仍存在一次整文解析的开销，不提供增量解析或后台线程解析；视口优化减少范围构造、传输及待绘制装饰数量，不能消除解析阻塞。新增或移除的格式会在防抖结束后更新；等待期间局部样式可能暂时过时。

MDX 语法不完整（例如尚未关闭的 JSX、表达式）或无效时，全篇暂时不装饰，恢复有效语法后自动恢复，不回退到可能误识别代码的正则。JSX 中 Markdown 的具体识别遵循 MDX 语法，包括空行要求。没有额外扩展 frontmatter、数学语法或其他方言。单波浪线不视为删除线。源码标记始终显示，装饰也可能覆盖主题对相同文字的配色。

测试覆盖语法、嵌套、引用、代码、组件、UTF-16 范围和编辑后更新；事件测试使用模拟 VS Code API，覆盖防抖、保存、配置、可见编辑器切换、关闭和释放，以及视口裁剪、滚动不解析、不重复提交和分栏独立装饰。这些模拟测试本身不能证明 GUI 性能；另有真实扩展宿主及渲染器对比测试，分别记录在 docs/test-results.md 和 docs/rendering-performance.md。

已在本机扩展宿主中验证滚动缓存、分栏、编辑后更新，以及与 unifiedjs.vscode-mdx 1.8.18 的示例组件折叠/展开，详见 集成测试记录（docs/test-results.md）。实际颜色显示及更广泛的组件用法仍需手工验证：在两个扩展同时启用时打开示例，检查颜色和嵌套样式，折叠/展开 Details，编辑文本、保存、切换分栏及文件、关闭重开，并切换启用设置。实测仅覆盖测试记录列出的示例及命令，不代表所有 GUI 行为均已验证。

视口优化手工验证：在长文中快速滚动、拖动滚动条、分栏定位到不同段落，确认进入视口的粗体和链接及时着色；折叠后再展开组件、修改可见区前的文本，检查范围是否正确。缓冲区外不设置装饰，快速跳转时可能短暂看到尚未着色的文字；截图或复制源码不受影响。已在本机 Chromium 渲染器中采集输入、滚动时的布局、绘制、长任务、帧间隔和 GPU 进程 trace；实测范围与结果见 docs/rendering-performance.md。该测试不作为所有场景的流畅度保证。

本机集成测试：npm run test:host，会使用 temp/ 下的隔离配置打开并退出 VS Code；环境路径及测量边界见 集成测试记录（docs/test-results.md）。

渲染对比测试：npm run test:renderer；随后 node scripts/summarize-renderer.mjs 汇总。会将独立测试窗口置前、模拟输入和滚动，并在 temp/ 保存原始 trace 与截图。详情及测量边界见 docs/rendering-performance.md。
