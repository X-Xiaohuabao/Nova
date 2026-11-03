/**
 * 帮助文档 Markdown 渲染共享层（自 HelpModal 提取，供新旧两壳复用）。
 *
 * 插件数组必须是模块级常量：react-markdown 按数组引用判断是否重跑
 * unified 流水线，每次渲染传新字面量会把整棵 markdown 树重新解析+消毒。
 */

import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import readmeRaw from "../../../README.md?raw";
import helpImageDims from "virtual:help-image-dims";
import { openExternal, openMailto } from "@/utils/openExternal";
import { rehypeHeadingIds } from "./docOutline";

export { readmeRaw };

const REPO_URL = "https://github.com/yingcongshaw/teacoder";

/** 从组件自身反推 rehypePlugins 的类型 —— unified 的 Pluggable 元组类型
 *  推不出来(嵌套数组会被当成联合数组),为此单独引 unified 只为拿类型不划算。 */
type RehypePlugins = NonNullable<
  ComponentProps<typeof ReactMarkdown>["rehypePlugins"]
>;

export const REMARK_PLUGINS = [remarkGfm];

/** 默认 schema 不放行 img 的 loading/decoding,截图的懒加载属性会被剥掉 */
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), "loading", "decoding"],
  },
};

export const REHYPE_PLUGINS: RehypePlugins = [
  rehypeRaw,
  rehypeHeadingIds,
  [rehypeSanitize, { schema: SANITIZE_SCHEMA }],
];

/**
 * 把 README 里的仓库内相对链接改写成 GitHub 绝对地址。
 */
function resolveDocLink(href: string): string {
  if (href.startsWith("./")) {
    return `${REPO_URL}/blob/main/${href.slice(2)}`;
  }
  if (href.startsWith("../../")) {
    return `${REPO_URL}/${href.slice(6)}`;
  }
  return href;
}

/**
 * 把 README 里的图片路径改写成应用内可访问的路径。
 */
function resolveDocImage(src: string): string {
  const path = src.startsWith("./") ? src.slice(2) : src;
  return path.startsWith("public/") ? `/${path.slice(7)}` : path;
}

/**
 * 决定图片的显示尺寸（README 给一边时按原图比例补齐，缺省用原图尺寸）。
 */
function resolveDisplaySize(
  width: string | number | undefined,
  height: string | number | undefined,
  intrinsic: [number, number] | undefined,
): { width?: string | number; height?: string | number } {
  if (width && height) return { width, height };
  if (width && intrinsic) {
    const w = Number(width);
    return Number.isFinite(w)
      ? { width, height: Math.round((w * intrinsic[1]) / intrinsic[0]) }
      : { width };
  }
  if (height && intrinsic) {
    const h = Number(height);
    return Number.isFinite(h)
      ? { width: Math.round((h * intrinsic[0]) / intrinsic[1]), height }
      : { height };
  }
  if (intrinsic) return { width: intrinsic[0], height: intrinsic[1] };
  return { width, height };
}

export const MARKDOWN_COMPONENTS: Components = {
  // 桌面 webview 里 window.open 会被静默拦截(返回 null 且不报错),
  // 必须走 Tauri opener 在系统浏览器打开。
  a: ({ href, children }) => {
    const target = resolveDocLink(href ?? "");
    return (
      <a
        href={target}
        title={target}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (target.startsWith("mailto:")) {
            void openMailto(target);
            return;
          }
          void openExternal(target);
        }}
      >
        {children}
      </a>
    );
  },
  // README 的截图动辄几 MB,懒加载避免打开弹窗就拉全量。
  img: ({ src, alt, title, width, height, node, ...props }) => {
    const resolved = src ? resolveDocImage(src) : undefined;
    const intrinsic = resolved ? helpImageDims[resolved] : undefined;
    const size = resolveDisplaySize(width, height, intrinsic);
    return (
      <img
        {...props}
        src={resolved}
        alt={alt ?? ""}
        title={title}
        width={size.width}
        height={size.height}
        loading="lazy"
        decoding="async"
      />
    );
  },
  // 横向滚动必须由 table 外的独立容器承担
  table: ({ children, node, ...props }) => (
    <div className="md-table-wrap">
      <table {...props}>{children}</table>
    </div>
  ),
};
