
CREATE TABLE IF NOT EXISTS user_credentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    app VARCHAR(100) NOT NULL,
    credential_type VARCHAR(100) NOT NULL,
    credential_name VARCHAR(255) NOT NULL,
    n8n_credential_id VARCHAR(255) NOT NULL,
    managed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_credentials_user_app (user_id, app),
    INDEX idx_user_credentials_user_id (user_id),
    CONSTRAINT fk_user_credentials_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);
