// Seeds Assessment Version 'V2' with all 3,450 banked items across M1-M8 from seeds/v2/.
// Safe to run repeatedly: skips item insertion once V2 items are already present.

const fs = require('fs');
const path = require('path');
const { db, transaction } = require('../src/config/db');

const V2_DIR = path.join(__dirname, 'v2');

const BANK_FILES = [
  'M1_Profile_Batch01.jsonl',
  'M2_Interests_Passion_Batch01.jsonl',
  'M3_Personality_Thinking_Batch01.jsonl',
  'M4_Aptitude_Batch01.jsonl',
  'M5_Values_Batch01.jsonl',
  'M6_EQ_SoftSkills_Batch01.jsonl',
  'M7_Academic_Confidence_Readiness_Batch01.jsonl',
  'M8_Parent_Observation_Batch01.jsonl',
  'M8_Parent_Mirror_Items_Batch02.jsonl'
];

function loadJsonlItems() {
  const items = [];
  let order = 0;
  for (const file of BANK_FILES) {
    const fullPath = path.join(V2_DIR, file);
    if (!fs.existsSync(fullPath)) continue;
    const lines = fs.readFileSync(fullPath, 'utf8').trim().split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      const obj = JSON.parse(line);
      if (obj._meta) continue;
      order += 1;
      items.push({
        external_id: obj.id,
        module: Number(obj.module),
        respondent: obj.respondent === 'parent' ? 'parent' : 'student',
        sub: obj.sub || null,
        dim: obj.dim || null,
        field_name: obj.field || null,
        item_type: obj.type,
        grade_scope: String(obj.grade || 'both'),
        difficulty: obj.difficulty || null,
        time_sec: obj.time_sec != null ? Number(obj.time_sec) : null,
        scale_name: obj.scale || null,
        stem: obj.stem,
        options_json: obj.options ? JSON.stringify(obj.options) : null,
        answer_key: obj.answer != null ? String(obj.answer) : null,
        key_json: obj.key ? JSON.stringify(obj.key) : null,
        explanation: obj.explanation || null,
        display_order: order
      });
    }
  }
  return items;
}

async function seedV2Bank({ logger = console } = {}) {
  let version = await db.prepare("SELECT * FROM assessment_versions WHERE version_code = 'V2'").get();
  if (!version) {
    const info = await db.prepare(`
      INSERT INTO assessment_versions (version_code, name, description, is_active)
      VALUES ('V2', 'Grade 10 & 12 Comprehensive Battery V2',
        '8-module career & psychometric guidance battery (3,450 banked items): Profile, 16-Cluster Interests & Passion, Personality & Thinking, Aptitude & Creativity, Work Values, EQ SJTs, Confidence & Readiness, Dual-Parent Mirror M8.', 0)
    `).run();
    version = { id: Number(info.lastInsertRowid), version_code: 'V2' };
  }

  const existingRow = await db.prepare('SELECT COUNT(*) AS c FROM v2_items WHERE version_id = ?').get(version.id);
  const items = loadJsonlItems();
  if (Number(existingRow?.c || 0) >= items.length && items.length > 0) {
    return version.id;
  }

  // Batch insert in chunks of 50 (18 cols * 50 = 900 vars — safely below SQLite's 999 legacy cap & PG's 65535 cap).
  const CHUNK_SIZE = 50;
  await transaction(async () => {
    if (Number(existingRow?.c || 0) > 0) {
      await db.prepare('DELETE FROM v2_items WHERE version_id = ?').run(version.id);
    }
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const rowSql = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)';
      const placeholders = chunk.map(() => rowSql).join(', ');
      const params = [];
      for (const it of chunk) {
        params.push(
          version.id, it.external_id, it.module, it.respondent, it.sub, it.dim,
          it.field_name, it.item_type, it.grade_scope, it.difficulty, it.time_sec,
          it.scale_name, it.stem, it.options_json, it.answer_key, it.key_json,
          it.explanation, it.display_order
        );
      }
      await db.prepare(`
        INSERT INTO v2_items (
          version_id, external_id, module, respondent, sub, dim,
          field_name, item_type, grade_scope, difficulty, time_sec,
          scale_name, stem, options_json, answer_key, key_json,
          explanation, display_order, is_active
        ) VALUES ${placeholders}
      `).run(...params);
    }
  });

  logger.log(`[seed] battery V2: ${items.length} banked items across M1-M8`);
  return version.id;
}

module.exports = { seedV2Bank, loadJsonlItems, V2_DIR };
