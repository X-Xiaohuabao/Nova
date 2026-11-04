/**
 * 旧版 Nova 持久化键（nova_ / nova- 前缀）一次性迁移到 Nova 键（nova_ / nova-）。
 * 作为副作用模块在 main.tsx 首位导入：zustand persist 在模块顶层 rehydrate，
 * 必须在任何 store 模块执行前完成搬运。新键已有值时不覆盖。
 */
const LEGACY_PREFIX = "teacoder";

for (let i = 0; i < localStorage.length; ) {
  const key = localStorage.key(i);
  if (key === null) break;
  if (key.startsWith(LEGACY_PREFIX)) {
    // 保留第 9 位的分隔符（_ 或 -）：nova_open_tabs → nova_open_tabs
    const newKey = `nova${key.slice(LEGACY_PREFIX.length)}`;
    if (localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, localStorage.getItem(key) as string);
    }
    localStorage.removeItem(key);
    // removeItem 后剩余键索引前移，不自增 i
  } else {
    i += 1;
  }
}
