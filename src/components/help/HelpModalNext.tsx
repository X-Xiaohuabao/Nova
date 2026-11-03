/**
 * 帮助窗口（新骨架，H2 / T13）。
 *
 * README Markdown 渲染 + 右侧目录（渲染后标题扫描）；渲染配置复用
 * markdownShared（插件数组模块级常量，避免重跑 unified 流水线）。
 * help-* 布局类沿用全局样式。
 */

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { ListTree, PanelRightClose } from "lucide-react";
import {
  MARKDOWN_COMPONENTS,
  REHYPE_PLUGINS,
  REMARK_PLUGINS,
  readmeRaw,
} from "./markdownShared";
import { groupOutline, type OutlineItem } from "./docOutline";
import ResponsiveDialog from "@/components/common/ResponsiveDialog";
import { Button } from "@/components/ui/button";

interface HelpModalNextProps {
  open: boolean;
  onClose: () => void;
}

function HelpContent() {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);

  // 目录直接读渲染出来的标题（layout effect 赶在绘制前建好，目录跟正文同帧出现）
  useLayoutEffect(() => {
    const headings = contentRef.current?.querySelectorAll<HTMLElement>("h2, h3");
    if (!headings) {
      setOutline([]);
      return;
    }
    setOutline(
      [...headings].map((h) => ({
        depth: h.tagName === "H3" ? 3 : 2,
        text: h.textContent ?? "",
        id: h.id,
      })),
    );
  }, [readmeRaw]);

  const scrollToHeading = (id: string) => {
    const target = document.getElementById(id);
    // 只认弹窗内的锚点,免得跟应用别处的 id 撞车
    if (!target || !contentRef.current?.contains(target)) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="help-layout">
      <div className="help-main">
        <div ref={contentRef} className="md-body help-body">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>
            {readmeRaw}
          </ReactMarkdown>
        </div>
      </div>

      {tocOpen && outline.length > 0 && (
        <nav className="help-toc">
          <div className="help-toc-title">{t("help.toc")}</div>
          <div>
            {groupOutline(outline).map((group) => (
              <div key={group.item.id} className="help-toc-group">
                <div className="help-toc-item">
                  <a
                    href={`#${group.item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToHeading(group.item.id);
                    }}
                  >
                    {group.item.text}
                  </a>
                </div>
                {group.children.map((child) => (
                  <div key={child.id} className="help-toc-item help-toc-sub">
                    <a
                      href={`#${child.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToHeading(child.id);
                      }}
                    >
                      {child.text}
                    </a>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </nav>
      )}

      <Button
        variant="outline"
        size="icon-sm"
        className="help-toc-toggle rounded-full"
        aria-label={tocOpen ? t("help.tocCollapse") : t("help.tocExpand")}
        title={tocOpen ? t("help.tocCollapse") : t("help.tocExpand")}
        onClick={() => setTocOpen((v) => !v)}
      >
        {tocOpen ? <PanelRightClose size={14} /> : <ListTree size={14} />}
      </Button>
    </div>
  );
}

export default function HelpModalNext({ open, onClose }: HelpModalNextProps) {
  const { t } = useTranslation();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t("help.title")}
      size="lg"
      contentClassName="sm:max-w-[900px] h-[80vh]"
    >
      <HelpContent />
    </ResponsiveDialog>
  );
}
