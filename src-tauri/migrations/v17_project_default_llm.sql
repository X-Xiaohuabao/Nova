-- Schema v17: projects 表添加项目级默认模型配置（三层配置：会话 > 项目 > 全局）
--
-- 四个新列全部 nullable，空 = 未设置（继续向上回退到全局默认 llm_providers.is_default）。
-- default_llm_provider_id 引用 llm_providers.id（TEXT/uuid，设计文档初稿误写 INTEGER，
-- 以现有表结构为准）；default_claude_models 与 sessions.claude_models 同构
-- （JSON 字符串，由前端 serializeClaudeModels() 产出）。
-- 只加列不删列；无存量回填（项目默认是显式配置，不猜初始值）。

ALTER TABLE projects ADD COLUMN default_tool_type TEXT;
ALTER TABLE projects ADD COLUMN default_llm_provider_id TEXT;
ALTER TABLE projects ADD COLUMN default_model_name TEXT;
ALTER TABLE projects ADD COLUMN default_claude_models TEXT;

INSERT INTO schema_version (version, applied_at) VALUES (17, strftime('%s','now') * 1000);
