-- 002_notification_outbox.sql (SQLite) — OTP delivery audit trail.
-- Records every OTP delivery attempt WITHOUT ever storing the code itself
-- (only a masked recipient, provider and outcome). Supports ops debugging
-- and the data-retention job.
CREATE TABLE IF NOT EXISTS notification_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'webhook')),
    recipient_masked TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_created ON notification_outbox(created_at);
