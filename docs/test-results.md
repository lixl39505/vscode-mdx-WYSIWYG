# 本机集成测试记录

日期：2026-11-16。VS Code 1.146.0 arm64，unifiedjs.vscode-mdx 1.8.18。
使用本机 VS Code，独立配置、测试文档及日志均放在 temp/ 中，不修改日常用户配置。

## 覆盖范围

集成测试将生产 Decorations 类打包进测试入口，在真实 VS Code 扩展宿主和真实 TextEditor API 上运行；MDX 语言及折叠提供器来自已安装的 unifiedjs.vscode-mdx。
不是对已安装 VSIX 的 UI 点击测试；自动激活和 VSIX 安装流程不包含在本项测试内。

测试文档为 54,316 个 UTF-16 单元，800 段格式密集的 Markdown，包在 Details 组件中，共解析出 6,400 个样式范围。

| 项目 | 结果 |
| --- | --- |
| 初始提交的装饰范围 | 248 个，少于全文范围的 4% |
| 5 次跨段滚动 | 通过；解析缓存对象保持不变 |
| 分栏 | 通过；共用解析缓存，分别计算视口装饰 |
| 编辑后范围更新 | 通过 |
| 保存后源码 | 通过；只有测试主动插入的换行，无额外修改 |
| MDX 折叠提供器 | 通过；装饰管理器释放前后结果相同 |
| 实际折叠/展开命令 | 通过；foldAll 后可见范围为 0–1 和 1604–1606，unfoldAll 后恢复 |
| 装饰处理及 API 提交时间中位数 | 0.35ms |
| 装饰处理及 API 提交时间最大值 | 0.56ms |
| 编辑到缓存及装饰范围更新 | 约 251ms，包含 150ms 防抖 |

行号从 0 开始。时间为一次测试运行中多次 render 调用的观测值，不是跨硬件性能保证；不包含启动时首次 render 的耗时。折叠模型需要就绪，因此命令测试在执行前等待 1.5 秒；提前执行曾出现命令未改变可见范围的测试超时。

## 限制

本节描述早期扩展宿主测试的边界；后来新增的真实渲染器采集见 rendering-performance.md。

未测渲染器完成绘制的时间、GPU paint、FPS、键盘到屏幕显示延迟，也未通过截图确认颜色和嵌套样式。调用 TextEditor.setDecorations 返回不代表绘制完成。
因此可确认装饰提交量降低、真实编辑器 API 行为和该示例的折叠展开正常；不能据此宣称完全无卡顿或所有 MDX 组件折叠均通过。

同步全文解析和较长文档的扩展宿主阻塞风险仍存在。

## 复现

安装开发依赖后执行：

```sh
npm run check
npm test
npm run test:host
```

test:host 默认使用本机 VS Code 和 /Users/july/.vscode/extensions/unifiedjs.vscode-mdx-1.8.18；可通过 VSCODE_EXECUTABLE_PATH 和 MDX_EXTENSION_PATH 指定其他绝对路径。测试会打开独立 VS Code 窗口并在结束后退出。沙箱限制下可能需要允许启动 GUI 进程。

原始结果：temp/host-results.json；日志：temp/host-launch.log。均为临时文件，不纳入版本控制。
