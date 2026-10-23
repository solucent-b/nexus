"use strict";

const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return String(value).trim();
}

function snowflake(name) {
  const value = required(name);
  if (!/^\d{17,20}$/.test(value)) {
    throw new Error(`${name} must be a Discord snowflake ID`);
  }
  return value;
}

function loadConfig() {
  const ownerRaw = required("OWNER_USER_ID");
  const ownerUserIds = ownerRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  for (const id of ownerUserIds) {
    if (!/^\d{17,20}$/.test(id)) {
      throw new Error(`OWNER_USER_ID contains an invalid Discord ID: ${id}`);
    }
  }

  const token = required("DISCORD_TOKEN");
  const controlGuildId = snowflake("CONTROL_GUILD_ID");
  const targetGuildId = snowflake("TARGET_GUILD_ID");

  if (controlGuildId === targetGuildId) {
    throw new Error("CONTROL_GUILD_ID and TARGET_GUILD_ID must be different servers");
  }

  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, "..", "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  return {
    token,
    controlGuildId,
    targetGuildId,
    controlChannelId: snowflake("CONTROL_CHANNEL_ID"),
    logChannelId: snowflake("LOG_CHANNEL_ID"),
    ownerUserIds,
    dataDir,
    databasePath: path.join(dataDir, "nexus.db"),
  };
}

module.exports = { loadConfig };
