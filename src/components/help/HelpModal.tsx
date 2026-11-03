import { useLayoutEffect, useRef, useState } from "react";
import { Button, Modal, Tooltip } from "antd";
import { MenuFoldOutlined, UnorderedListOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import {
  MARKDOWN_COMPONENTS,
  REHYPE_PLUGINS,
  REMARK_PLUGINS,
  readmeRaw,
} from "./markdownShared";
import { groupOutline, type OutlineItem } from "./docOutline";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 弹窗正文:README 渲染结果 + 右侧目录。
 *
 * 目录和正文必须放在同一个组件里 —— AntD 的 Modal 是把内容挂到 Portal 上的,
 * 正文那棵子树要晚于 open 翻真才进 DOM。父组件的 effect 跑的时候正文还没到,
 * 只有跟正文一起挂载的这个组件才扫得到标题。
 */
function HelpContent() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);

  // 目录直接读渲染出来的标题,id 和文字都用渲染后的真实值,
  // 免得再从 README 原文推一遍 —— 推错一个字目录就跳不过去。
  // 用 layout effect 是为了赶在浏览器绘制前建好,目录跟正文同帧出现。
  // 依赖 README 原文:开发时改了 README 会热更新,标题跟着变,目录要重扫。
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
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            components={MARKDOWN_COMPONENTS}
          >
            {readmeRaw}
          </ReactMarkdown>
        </div>
      </div>

      {tocOpen && outline.length > 0 && (
        <nav className="help-toc">
          <div className="help-toc-title">目录</div>
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

      <Tooltip title={tocOpen ? "收起目录" : "展开目录"}>
        <Button
          type="default"
          shape="circle"
          className="help-toc-toggle"
          aria-label={tocOpen ? "收起目录" : "展开目录"}
          icon={tocOpen ? <MenuFoldOutlined /> : <UnorderedListOutlined />}
          onClick={() => setTocOpen((v) => !v)}
        />
      </Tooltip>
    </div>
  );
}

/**
 * 帮助窗口:以 Markdown 渲染仓库根目录的 README.md。
 *
 * README 通过 Vite 的 ?raw 在构建期内联 —— 改 README 后 dev 有热更新,
 * 发布版重新构建即同步,运行时不需要额外的文件读取通道。
 */
export default function HelpModal({ open, onClose }: HelpModalProps) {
  return (
    <Modal
      title="帮助"
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      styles={{
        body: {
          // 滚动交给正文列和目录列各自处理,弹窗本身不滚
          padding: 0,
          overflow: "hidden",
        },
      }}
    >
      <HelpContent />
    </Modal>
  );
}
