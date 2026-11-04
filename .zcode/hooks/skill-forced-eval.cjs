#!/usr/bin/env node
/**
 * UserPromptSubmit Hook - 强制技能评估（Nova 版，ZCode 适配）
 * 功能: 开发场景下，将 Skills 激活率从约 25% 提升到 90% 以上
 *
 * ZCode 适配说明：
 * - 通过 stdout 输出 {"additionalContext": ...} 注入上下文（严格 schema，只允许该键）
 * - 斜杠命令展开检测保留 <command-name> 兼容逻辑，同时兼容 ZCode 的命令注入格式
 */

const fs = require('fs');

// 从 stdin 读取用户输入
let inputData = '';
try {
  inputData = fs.readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(inputData);
} catch {
  process.exit(0);
}

const prompt = (input.prompt || '').trim();

// 检测是否是恢复会话（防止上下文溢出死循环）
const skipPatterns = [
  'continued from a previous conversation',
  'ran out of context',
  'No code restore',
  'Conversation compacted',
  'commands restored',
  'context window',
  'session is being continued'
];

const isRecoverySession = skipPatterns.some(pattern =>
  prompt.toLowerCase().includes(pattern.toLowerCase())
);

if (isRecoverySession) {
  // 恢复会话，跳过技能评估以防止死循环
  process.exit(0);
}

// 检测是否是斜杠命令
// 规则 1：用户直接敲 /xxx（以 / 开头，且后面不包含第二个 /，排除 /iot/device 这样的路径）
const isSlashCommand = /^\/[^\/\s]+$/.test(prompt.split(/\s/)[0]);

// 规则 2：斜杠命令已被 CLI 展开成命令文档注入（含 <command-name> 或 <command> 标签）
const isExpandedCommand = /<command-name>|<command>/.test(prompt);

if (isSlashCommand || isExpandedCommand) {
  // 斜杠命令，跳过技能评估（命令本身已是明确意图，无需再做二次激活）
  process.exit(0);
}

const instructions = `## 强制技能激活流程（必须执行）

### 步骤 1 - 评估（必须在响应中明确展示）

针对用户问题，列出匹配的技能：\`技能名: 理由\`，无匹配则写"无匹配技能"

可用技能：
- tauri-ipc: Tauri IPC/命令注册/invoke/事件/emit/listen/Tauri API/tauri.conf/插件/权限/窗口/托盘
- rust-coding: Rust/后端/unwrap/thiserror/tokio/异步/clippy/Cargo/crate/错误处理
- react-frontend: React/组件/Hooks/Props/TypeScript/strict/前端页面/渲染/状态
- zustand-state: Zustand/store/全局状态/createStore/selector/状态管理/跨组件共享
- shadcn-ui: shadcn/ui 组件/按钮/表单/弹窗/下拉/标签页/TailwindCSS/主题 token/明暗主题/CVA/样式/布局/间距/颜色/Toast/确认交互
- macos-hig: macOS 设计规范/HIG/尺寸/字号/颜色/间距/动效/什么才像 macOS/视觉走查/设计评审基准
- pty-terminal: PTY/xterm/终端/portable-pty/伪终端/会话输出/终端渲染/分屏/共享 PTY
- storage-sqlite: SQLite/rusqlite/数据库/迁移/migrations/JSONL/存储/schema/事务
- security-keychain: Keychain/keyring/凭据/API Key/Token/加密/脱敏/明文/密钥/安全
- cost-tracking: 费用/Token 统计/CostProvider/JSONL 解析/claude/codex/gemini/opencode 适配
- profile: Profile/CLAUDE_CONFIG_DIR/账号隔离/供应商切换/LLM Provider
- project-navigator: 项目结构/文件在哪/定位/目录说明/代码在哪
- git-workflow: Git/提交/commit/分支/PR/合并
- task-tracker: 任务跟踪/记录进度/继续任务/恢复上下文/多步骤开发/进度管理/任务台账
- writing-plans: 写计划/制定计划/实施计划/拆解任务/任务拆解/可执行计划/计划文档/开发计划
- bug-detective: Bug/报错/异常/不工作/排查/修复错误
- test-development: 测试/单元测试/cargo test/tsc/vitest/断言/测试覆盖率/提交前检查

### 步骤 2 - 激活
对每个匹配的技能逐个激活：一次激活一个，等它返回后再激活下一个（不要一次性批量激活）。无匹配则跳过本步。

### 步骤 3 - 实现
所有匹配技能激活完成后，再开始动手实现。

要点：先评估 → 再激活 → 后实现；不要跳过激活直接实现，也不要漏掉匹配的技能。`;

// 双端适配输出（本脚本同时服务 ZCode 与 Claude Code，settings 均指向此文件）：
// - ZCode：stdout 必须为严格 JSON，additionalContext 键注入对话（ZCode 会注入 ZCODE_PROJECT_DIR 环境变量，以此区分）
// - Claude Code：UserPromptSubmit 的纯文本 stdout 直接注入为上下文
if (process.env.ZCODE_PROJECT_DIR) {
  process.stdout.write(JSON.stringify({ additionalContext: instructions }));
} else {
  console.log(instructions);
}
process.exit(0);
