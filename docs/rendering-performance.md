# 渲染性能对比

2026-11-16，本机 VS Code 1.146.0 arm64、unifiedjs.vscode-mdx 1.8.18；测试代码对应 MDX WYSIWYG 0.1.4。

结论：本次工作负载中，视口装饰增加了一定绘制成本，未观察到渲染主线程长任务，但记录到了少量 Chromium DroppedFrame 事件，不能据此声称完全不掉帧。该结论仅适用于本次采样，不能作为所有文档和硬件完全无卡顿的保证；同步全文解析仍会占用扩展宿主线程。

## 方法

独立配置启动本机 VS Code，不关闭 GPU 加速；本机回环调试端口在测试窗口退出后关闭。配置、文档、日志、截图和完整 trace 均在项目 temp/ 下。

测试入口将生产 Decorations 类编译进扩展宿主，在真实 TextEditor、MDX 语言服务和 Chromium 渲染器上运行。禁用组不创建装饰管理器，启用组创建同一生产类；不是已安装 VSIX 的 Marketplace 激活测试。

两份 Details 组件内的格式密集文档分别包含 800、2400 段，共 54,316、164,516 个 UTF-16 单元。每种大小按“禁用、启用、启用、禁用”运行，每个条件 2 轮，分别测量：
- 滚动：60 次 editorScroll 命令，每次 5 行，向下 30 次再向上 30 次，间隔至少 40ms。检查中途视口确实移动。驱动命令来自扩展宿主，语言服务及装饰的宿主阻塞可能延长命令间隔，因此并非固定速率的物理鼠标测试。
- 输入：通过 CDP 键盘事件输入 60 个 z，目标间隔 40ms；另测 12 次间隔 220ms 的停顿输入，以反复触发防抖解析及装饰更新；验证每轮文档最终确实出现恰好 72 个 z。
- 每阶段操作完成后多采集 600ms，以覆盖防抖后的更新。每轮重置源文档并等待 1.8 秒，排除初始解析、首次绘制和语言服务预热；截图尺寸 1440×900，关闭自动换行、平滑滚动与光标闪烁。
- 检查页面处于 visible 状态，有足够动画帧样本；最终所有样本均获得窗口焦点。使用截图核对实际编辑器和启用组着色。

数据来自 Chrome DevTools Protocol Tracing（devtools.timeline、toplevel、cc、gpu、frame）、requestAnimationFrame 与 PerformanceObserver longtask。Main thread Layout/Paint 汇总仅统计测试渲染器主线程上的完整事件，不将嵌套 GPU 事件简单相加。

最初尝试的 CDP 滚轮命令出现确认超时、合成 DOM 滚轮未可靠移动视口，相关失败采集已排除。最终测试用 VS Code 的 editorScroll 驱动实际滚动。隐藏页面样本也会被拒绝，不纳入统计。

## 结果

下表的“禁用 → 启用”是两轮累计时间的算术平均值，单位 ms。滚动阶段每轮约 3.18–3.22 秒，连续输入每轮约 3.00 秒，停顿输入每轮约 3.24 秒。P95 合并该条件两轮的动画帧间隔后计算。

| 文档 | 操作 | rAF 间隔 P95 | Layout 累计 | Paint 累计 | GPU 进程调度任务累计时长 |
| --- | --- | ---: | ---: | ---: | ---: |
| 5.4 万字符 | 滚动 | 10.40 → 10.50 | 40.88 → 40.12 | 67.81 → 80.62 | 220.03 → 260.39 |
| 5.4 万字符 | 连续输入 | 10.40 → 10.30 | 13.11 → 13.45 | 26.43 → 28.84 | 104.93 → 118.41 |
| 5.4 万字符 | 停顿输入 | 10.30 → 11.10 | 2.71 → 2.92 | 5.62 → 6.48 | 27.21 → 29.63 |
| 16.5 万字符 | 滚动 | 11.30 → 11.10 | 28.84 → 30.99 | 57.07 → 63.91 | 207.94 → 210.66 |
| 16.5 万字符 | 连续输入 | 11.60 → 11.20 | 13.74 → 13.32 | 27.05 → 28.81 | 116.37 → 118.37 |
| 16.5 万字符 | 停顿输入 | 10.70 → 10.30 | 2.88 → 2.97 | 5.52 → 6.45 | 27.63 → 30.07 |

所有 24 个阶段中：
- rAF 间隔中位数约 10ms，最长约 20ms，无超过 25ms 的样本。
- PerformanceObserver 未记录到超过 50ms 的长任务，trace 中也未发现测试渲染器主线程超过 50ms 的 RunTask。
- Chromium 的 DrawFrame 事件存在，5.4 万字符滚动组的 DroppedFrame 事件为禁用 0 / 启用 3，16.5 万字符滚动组为禁用 1 / 启用 0，其余阶段均为 0。这说明部分合成帧确实被 Chromium 标记丢弃；rAF 平稳不能替代合成管线指标。
- GPU Process 存在，并采集到 Scheduler::RunTask、RasterCHROMIUM、CommitPresentedFrameToCA 等事件。表中 GPU 列仅汇总 GPU 进程的 Scheduler::RunTask 作用域时长（CPU 侧计时，可能含等待），不是物理 GPU 执行时间、忙碌率或利用率。

启用组比禁用组数字更小的地方不代表扩展加速了编辑器，短样本、系统调度和预热波动均可能影响结果。两次重复不足以作统计显著性结论。滚动 Paint 的平均增量约为每轮 7–13ms，说明装饰并非没有渲染成本。

## 边界

rAF 反映渲染主线程调度，不能直接换算为显示器实际呈现 FPS；DrawFrame/DroppedFrame 是 Chromium 的管线事件，不能证明每个合成帧最终在屏幕上准时显示。

已覆盖真实渲染器的样式更新、布局、绘制、长任务、动画帧间隔、合成帧事件及 GPU 进程提交链路。本机 xcrun --find xctrace 返回不可用，未加入 Instruments/Metal 硬件分析。未测物理 GPU shader 执行时间/占用率、按键到光子的端到端延迟、中文输入法、超长单行、自动换行开启、复杂工作区与其他扩展组合、冷启动、持续长时间编辑。每阶段 600ms 尾部采集窗口并非所有场景下更新完成的保证。

长文同步解析发生在扩展宿主中，渲染器保持平稳不代表装饰始终即时跟随输入，也不代表语言服务完全不受影响。不能以本报告宣称完全无卡顿。

## 复现与产物

```sh
npm ci --cache temp/npm-cache
npm run check
npm test
npm run test:renderer
node scripts/summarize-renderer.mjs
```

需要 Node.js 22+（原生 WebSocket）、本机可启动的 VS Code 和 MDX 扩展。可用 VSCODE_EXECUTABLE_PATH、MDX_EXTENSION_PATH 指定路径；默认同 test:host。测试会打开独立窗口并置前，请让它保持可见、避免同时操作该窗口。沙箱环境可能需要允许 GUI 启动及本机调试端口。

原始结果：temp/rendering-results.json；汇总：temp/rendering-summary.json；本次 trace 和截图目录：temp/rmwj46sur/；启动日志：temp/renderer-launch.log。
每次运行创建独立的 temp/r<时间戳>/，不会覆盖旧 trace；汇总 JSON 指向最近成功的完整采集。*.trace.json 可导入 Chromium DevTools Performance 面板进一步检查。测试失败会以非零退出，不以不完整采集生成成功汇总。

协议依据：[Tracing](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/)、[Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/)。
