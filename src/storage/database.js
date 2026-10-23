"use strict";

const { DatabaseSync } = require("node:sqlite");
const logger = require("../utils/logger");

let db;

function open(databasePath) {
  db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  logger.info("SQLite persistence ready");
  return db;
}

function getKv(key) {
  const row = db.prepare("SELECT v FROM kv WHERE k = ?").get(key);
  return row ? row.v : null;
}

function setKv(key, value) {
  db.prepare(
    "INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v"
  ).run(key, value);
}

function getPanel() {
  const raw = getKv("panel");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setPanel(panel) {
  setKv("panel", JSON.stringify(panel));
}

function getAutoTargetGuildId() {
  return getKv("auto_target_guild_id");
}

function setAutoTargetGuildId(guildId) {
  if (!guildId) {
    db.prepare("DELETE FROM kv WHERE k = ?").run("auto_target_guild_id");
    return;
  }
  setKv("auto_target_guild_id", guildId);
}

function setLastAction(summary) {
  setKv("last_action", JSON.stringify({ ...summary, at: new Date().toISOString() }));
}

function getLastAction() {
  const raw = getKv("last_action");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveOperation(operation) {
  db.prepare(
    `INSERT INTO operations (id, status, payload, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       payload = excluded.payload,
       updated_at = excluded.updated_at`
  ).run(
    operation.id,
    operation.status,
    JSON.stringify({
      id: operation.id,
      userId: operation.userId,
      status: operation.status,
      startedAt: operation.startedAt,
      selectedCount: operation.selected ? operation.selected.size : 0,
    }),
    new Date().toISOString()
  );
}

function markIncompleteOperationsInterrupted() {
  const rows = db
    .prepare(
      "SELECT id, status FROM operations WHERE status IN ('selecting', 'confirming', 'running')"
    )
    .all();

  if (!rows.length) return 0;

  const now = new Date().toISOString();
  const update = db.prepare(
    "UPDATE operations SET status = ?, payload = ?, updated_at = ? WHERE id = ?"
  );

  for (const row of rows) {
    update.run(
      "interrupted",
      JSON.stringify({ id: row.id, previousStatus: row.status, interruptedAt: now }),
      now,
      row.id
    );
  }

  logger.warn(`Marked ${rows.length} incomplete operation(s) as interrupted (will not resume)`);
  return rows.length;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  open,
  getPanel,
  setPanel,
  getAutoTargetGuildId,
  setAutoTargetGuildId,
  setLastAction,
  getLastAction,
  saveOperation,
  markIncompleteOperationsInterrupted,
  close,
};
