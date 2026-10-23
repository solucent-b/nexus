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

function optionalSnowflake(name) {
  const raw = process.env[name];
  if (!raw || !String(raw).trim()) return null;
  const value = String(raw).trim();
  if (!/^\d{17,20}$/.test(value)) {
    throw new Error(`${name} must be a Discord snowflake ID`);
  }
  return value;
}

function resolveDataDir() {
  if (fs.existsSync("/data")) return "/data";
  return path.join(__dirname, "..", "..", "data");
}

function loadConfig() {
  const token = required("DISCORD_TOKEN");
  const controlGuildId = snowflake("CONTROL_GUILD_ID");
  const targetGuildId = optionalSnowflake("TARGET_GUILD_ID");

  if (targetGuildId && controlGuildId === targetGuildId) {
    throw new Error("CONTROL_GUILD_ID and TARGET_GUILD_ID must be different servers");
  }

  const dataDir = resolveDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  return {
    token,
    controlGuildId,
    targetGuildId,
    dataDir,
    databasePath: path.join(dataDir, "nexus.db"),
  };
}

module.exports = { loadConfig };
