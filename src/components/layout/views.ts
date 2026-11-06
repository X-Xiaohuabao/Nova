/**
 * 主视图标识。
 * M1（布局先行）：由 AppNext 本地 state 驱动；
 * M2（路由化）：改由 react-router HashRouter 驱动，本类型对应路由表。
 */
export type MainView = "panes" | "settings" | "cost" | "help";
