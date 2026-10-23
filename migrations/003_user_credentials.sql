-- Migration 003: user-linked app credentials
-- Stores which n8n credential belongs to which app for each user.
-- Secrets are never stored here; n8n holds the actual credential data.

CREATE TABLE IF NOT EXISTS user_credentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    app VARCHAR(50) NOT NULL,
    credential_type VARCHAR(100) NOT NULL,
    credential_name VARCHAR(255) NOT NULL,
    n8n_credential_id VARCHAR(64) NOT NULL,
    managed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_credentials_user_app (user_id, app),
    INDEX idx_user_credentials_n8n_id (n8n_credential_id)
);
