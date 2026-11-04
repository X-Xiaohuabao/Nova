#!/usr/bin/env node
/**
 * Stop Hook - 回答结束时触发（Nova 版，ZCode 适配）
 * 功能: 清理 Windows `> nul` 误用产生的 nul 文件
 *
 * ZCode 适配说明：
 * - 输出严格 JSON schema，这里不输出任何内容，靠 exit 0 放行
 * - Stop 事件可请求继续（最多 3 次），本 hook 不使用该能力
 */

const fs = require('fs');
const path = require('path');

// 清理可能误创建的 nul 文件（Windows 下 > nul 可能创建该文件）
// 递归查找并删除项目下所有 nul 文件
const findAndDeleteNul = (dir, depth = 0) => {
  if (depth > 5) return; // 限制递归深度
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === 'nul') {
        fs.unlinkSync(fullPath);
        console.error(`🧹 已清理: ${fullPath}`);
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        findAndDeleteNul(fullPath, depth + 1);
      }
    }
  } catch {
    // 访问失败时静默忽略
  }
};
findAndDeleteNul(process.cwd());

process.exit(0);
