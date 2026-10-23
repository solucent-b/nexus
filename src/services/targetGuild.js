"use strict";

const database = require("../storage/database");
const logger = require("../utils/logger");

function envTarget(config) {
  return config.targetGuildId || null;
}

function inferOtherGuild(client, config) {
  const others = [...client.guilds.cache.values()].filter(
    (guild) => guild.id !== config.controlGuildId
  );
  if (others.length === 1) return others[0].id;
  return null;
}

function getTargetGuildId(client, config) {
  const fromEnv = envTarget(config);
  if (fromEnv) return fromEnv;

  const stored = database.getAutoTargetGuildId();
  if (stored && client.guilds.cache.has(stored) && stored !== config.controlGuildId) {
    return stored;
  }

  return inferOtherGuild(client, config);
}

function bindAutoTarget(client, config, guildId, reason) {
  if (envTarget(config)) return false;
  if (!guildId || guildId === config.controlGuildId) return false;
  if (database.getAutoTargetGuildId() === guildId) return false;

  database.setAutoTargetGuildId(guildId);
  logger.info(`Auto-bound target server ${guildId} (${reason})`);
  return true;
}

function syncFromGuilds(client, config) {
  if (envTarget(config)) {
    logger.info(`Target server locked by TARGET_GUILD_ID=${config.targetGuildId}`);
    return getTargetGuildId(client, config);
  }

  const stored = database.getAutoTargetGuildId();
  if (stored && !client.guilds.cache.has(stored)) {
    database.setAutoTargetGuildId(null);
    logger.warn(`Dropped stale auto-bound target ${stored}`);
  }

  const inferred = inferOtherGuild(client, config);
  if (inferred) {
    bindAutoTarget(client, config, inferred, "only non-control server present");
  } else if (!getTargetGuildId(client, config)) {
    logger.info("No target server yet. Invite Nexus to a second server to auto-bind it.");
  }

  return getTargetGuildId(client, config);
}

function onGuildJoin(client, config, guild) {
  if (envTarget(config)) return false;
  if (guild.id === config.controlGuildId) {
    const inferred = inferOtherGuild(client, config);
    if (inferred) return bindAutoTarget(client, config, inferred, "control server joined while already in another");
    return false;
  }

  const stored = database.getAutoTargetGuildId();
  if (stored && client.guilds.cache.has(stored) && stored !== guild.id) {
    return false;
  }

  const others = [...client.guilds.cache.values()].filter((entry) => entry.id !== guild.id);
  const alreadyInOne = others.length === 1;
  if (!alreadyInOne) return false;

  return bindAutoTarget(client, config, guild.id, "second server joined");
}

function onGuildLeave(client, config, guildId) {
  if (envTarget(config)) return false;
  if (database.getAutoTargetGuildId() !== guildId) return false;
  database.setAutoTargetGuildId(null);
  logger.info(`Cleared auto-bound target server ${guildId} after leave`);
  const inferred = inferOtherGuild(client, config);
  if (inferred) bindAutoTarget(client, config, inferred, "rebound after previous target left");
  return true;
}

module.exports = {
  getTargetGuildId,
  syncFromGuilds,
  onGuildJoin,
  onGuildLeave,
};
