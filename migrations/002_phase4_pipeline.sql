-- Migration 002: Phase 4 - Automated Workflow Pipeline
-- Adds persistence for workflows deployed to n8n + richer execution records

ALTER TABLE workflows ADD COLUMN n8n_workflow_id VARCHAR(64) NULL AFTER is_active;
ALTER TABLE workflows ADD COLUMN prompt TEXT NULL AFTER description;
ALTER TABLE workflows ADD INDEX idx_workflows_n8n_workflow_id (n8n_workflow_id);

ALTER TABLE workflow_executions ADD COLUMN n8n_execution_id VARCHAR(64) NULL AFTER user_id;
ALTER TABLE workflow_executions ADD COLUMN error_analysis TEXT NULL AFTER error_message;
ALTER TABLE workflow_executions ADD INDEX idx_workflow_executions_n8n_execution_id (n8n_execution_id);
