#!/usr/bin/env node
/**
 * PreToolUse Hook - 工具使用前触发（Nova 版，ZCode 适配）
 * 功能:
 * 1. 阻止危险命令
 * 2. 阻止写入敏感配置文件
 *
 * ZCode 适配说明（与 Claude Code 版的关键差异）：
 * - 输出 JSON 是严格 schema，多余键（如 updatedInput/systemMessage）会导致校验失败，
 *   因此本版只用「退出码」语义：0 = 放行，2 = 阻止（deny）
 * - 阻止原因写到 stderr，会出现在 ZCode hook 日志里
 * - 移除 PowerShell 工具相关逻辑（ZCode 无此工具）
 */

const fs = require('fs');

const block = (reason) => {
  console.error(reason);
  process.exit(2);
};

const allow = () => process.exit(0);

let inputData = '';
try {
  inputData = fs.readFileSync(0, 'utf8');
} catch {
  allow();
}

let input;
try {
  input = JSON.parse(inputData);
} catch {
  allow();
}

const toolName = input.tool_name;
const toolInput = input.tool_input || {};

// Bash 命令检查
if (toolName === 'Bash') {
  const command = toolInput.command || '';

  // 检测 > nul 错误用法（Windows 会创建名为 nul 的文件）
  const nulPattern = /[12]?\s*>\s*nul\b/i;
  if (nulPattern.test(command)) {
    block(`🚫 **命令被阻止**：检测到 \`> nul\`\n\n**问题**：Windows 下某些 Shell 会创建名为 \`nul\` 的文件\n\n**解决方案**：\n- 移除输出重定向，或\n- 使用 \`> /dev/null 2>&1\`（跨平台）\n\n原命令: \`${command}\``);
  }

  // 危险命令模式
  const dangerousPatterns = [
    { pattern: /rm\s+-rf\s+\/(?!\w)/, reason: '删除根目录' },
    { pattern: /rm\s+-rf\s+\*/, reason: '删除所有文件' },
    // 拦截 rm -rf 后跟 Windows 绝对路径（如 D:/xxx 或 D:\xxx），带或不带引号、带或不带尾部 *
    { pattern: /rm\s+-rf\s+["']?[A-Za-z]:[\/\\][^"'\s]*["']?\s*\*?/i, reason: '删除 Windows 绝对路径下的文件' },
    // 拦截 rm -rf 后跟 Unix 风格绝对路径，但放过当前项目工作目录内的相对路径
    { pattern: /rm\s+-rf\s+["']?\/(home|usr|etc|var|opt|root|tmp|bin|sbin|lib)\b/i, reason: '删除系统关键目录' },
    { pattern: /git\s+push\s+--force\s+(origin\s+)?(main|master)/i, reason: '强制推送到主分支' },
    { pattern: /git\s+reset\s+--hard\s+HEAD~\d+/, reason: '硬重置多个提交' },
    { pattern: />\s*\/dev\/sd[a-z]/, reason: '直接写入磁盘设备' },
    { pattern: /mkfs\./, reason: '格式化文件系统' },
    { pattern: /:(){ :|:& };:/, reason: 'Fork 炸弹' },
    { pattern: /cargo\s+publish/, reason: '意外发布 crate' },
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(command)) {
      block(`⚠️ **危险操作被阻止**\n\n命令: \`${command}\`\n原因: ${reason}\n\n如确需执行，请手动在终端运行`);
    }
  }

  // 警告但不阻止的命令（写 stderr 提示，正常放行）
  const warningPatterns = [
    { pattern: /git\s+push\s+--force/, warning: 'Force push 可能覆盖他人代码' },
    { pattern: /pnpm\s+publish|npm\s+publish/, warning: '即将发布到 npm registry' },
    { pattern: /docker\s+system\s+prune/, warning: '将清理所有未使用的 Docker 资源' },
  ];

  for (const { pattern, warning } of warningPatterns) {
    if (pattern.test(command)) {
      console.error(`⚠️ **注意**: ${warning}`);
      allow();
    }
  }
}

// Write/Edit 工具检查：是否写入敏感配置文件
if (toolName === 'Write' || toolName === 'Edit') {
  const filePath = toolInput.file_path || '';

  const sensitiveFiles = [
    '.env.production',
    'credentials.json',
    'secrets.json',
    'tauri.conf.json.bak',
    'keyring-test'
  ];

  for (const sensitive of sensitiveFiles) {
    if (filePath.endsWith(sensitive) || filePath.includes(sensitive)) {
      block(`🔒 **写入被阻止**：\`${filePath}\` 疑似敏感配置/凭据文件\n\nNova 规范：\n- API Key / OAuth Token 必须通过系统 Keychain（keyring crate）存储\n- 禁止将凭据明文写入任何文件\n\n如确需修改，请手动编辑`);
    }
  }

  // 防止把 API Key 明文写进代码/配置（粗粒度检测）
  const content = String(toolInput.content || toolInput.new_string || '');
  const keyLeak = /(sk-[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})/.test(content);
  if (keyLeak) {
    block(`🔒 **写入被阻止**：内容疑似包含明文 API Key\n\nNova 规范：凭据走系统 Keychain，代码/配置/日志中只允许 \`sk-***\` 脱敏格式`);
  }
}

allow();
