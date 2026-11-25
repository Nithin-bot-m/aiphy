-- 003_v2_psychometrics.sql — Psychometric V2 schema (SQLite)
-- Supports the 8-module (3,450-item) battery, multi-format items, dual-parent
-- Module 8 mirror sessions, 16 career cluster scoring, and Counsellor Map JSON.

CREATE TABLE IF NOT EXISTS v2_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL,
    external_id TEXT NOT NULL UNIQUE,
    module INTEGER NOT NULL CHECK (module BETWEEN 1 AND 8),
    respondent TEXT NOT NULL DEFAULT 'student' CHECK (respondent IN ('student', 'parent')),
    sub TEXT,
    dim TEXT,
    field_name TEXT,
    item_type TEXT NOT NULL CHECK (item_type IN (
        'single_select', 'multi_select', 'likert5', 'best_worst',
        'forced_choice', 'scenario', 'open_text', 'mcq', 'ranking', 'sjt'
    )),
    grade_scope TEXT NOT NULL DEFAULT 'both',
    difficulty TEXT CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
    time_sec INTEGER,
    scale_name TEXT,
    stem TEXT NOT NULL,
    options_json TEXT,
    answer_key TEXT,
    key_json TEXT,
    explanation TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (version_id) REFERENCES assessment_versions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v2_items_version_mod ON v2_items(version_id, module, is_active);
CREATE INDEX IF NOT EXISTS idx_v2_items_sub ON v2_items(module, sub);

CREATE TABLE IF NOT EXISTS v2_assessment_blueprints (
    assessment_id INTEGER PRIMARY KEY,
    grade INTEGER NOT NULL DEFAULT 10 CHECK (grade IN (9, 10, 11, 12)),
    item_ids_json TEXT NOT NULL,
    pair_links_json TEXT,
    m1_context_json TEXT,
    accommodations_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v2_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    respondent_type TEXT NOT NULL DEFAULT 'student' CHECK (respondent_type IN ('student', 'parent')),
    parent_id INTEGER,
    answer_key TEXT,
    numeric_value REAL,
    response_json TEXT,
    response_text TEXT,
    response_time_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES v2_items(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v2_responses_respondent
    ON v2_responses(assessment_id, item_id, respondent_type, COALESCE(parent_id, 0));

CREATE INDEX IF NOT EXISTS idx_v2_responses_assessment
    ON v2_responses(assessment_id, respondent_type, parent_id);

CREATE TABLE IF NOT EXISTS v2_scoring_results (
    assessment_id INTEGER PRIMARY KEY,
    grade INTEGER NOT NULL,
    norm_status TEXT NOT NULL DEFAULT 'provisional' CHECK (norm_status IN ('provisional', 'final')),
    validity_json TEXT NOT NULL,
    aptitude_json TEXT NOT NULL,
    personality_json TEXT NOT NULL,
    values_json TEXT NOT NULL,
    readiness_json TEXT NOT NULL,
    clusters_json TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v2_parent_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL,
    parent_id INTEGER NOT NULL,
    parent_slot TEXT NOT NULL DEFAULT 'parent_1' CHECK (parent_slot IN ('parent_1', 'parent_2')),
    item_ids_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
    student_consent_sensitive INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
    UNIQUE(assessment_id, parent_id)
);

CREATE TABLE IF NOT EXISTS v2_counsellor_maps (
    assessment_id INTEGER PRIMARY KEY,
    schema_version TEXT NOT NULL DEFAULT 'counsellor_map_v1',
    map_json TEXT NOT NULL,
    model TEXT,
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'fallback', 'failed')),
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v2_grade_norms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade INTEGER NOT NULL CHECK (grade IN (9, 10, 11, 12)),
    metric_key TEXT NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    mean_val REAL NOT NULL DEFAULT 0,
    m2_val REAL NOT NULL DEFAULT 0,
    freq_json TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(grade, metric_key)
);

