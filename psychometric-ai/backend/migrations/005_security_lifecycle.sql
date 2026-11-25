-- Security, email verification, password reset, and DPDP deletion lifecycle fields

ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN login_locked_until DATETIME;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN verification_expires_at DATETIME;
ALTER TABLE users ADD COLUMN reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN reset_expires_at DATETIME;
ALTER TABLE users ADD COLUMN deletion_requested_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token_hash);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token_hash);

-- Pre-seeded demo accounts and admin accounts are trusted/verified by default
UPDATE users SET email_verified = 1 WHERE is_demo = 1 OR role = 'admin';

