"use strict";

const { PermissionFlagsBits } = require("discord.js");
const logger = require("../utils/logger");

async function getTargetGuild(client, config) {
  try {
    return await client.guilds.fetch(config.targetGuildId);
  } catch (error) {
    logger.error("Unable to fetch target guild", error);
    return null;
  }
}

async function getControlGuild(client, config) {
  try {
    return await client.guilds.fetch(config.controlGuildId);
  } catch (error) {
    logger.error("Unable to fetch control guild", error);
    return null;
  }
}

function botHasAdministrator(guild) {
  const me = guild.members.me;
  if (!me) return false;
  return me.permissions.has(PermissionFlagsBits.Administrator);
}

function botCanBan(guild) {
  const me = guild.members.me;
  if (!me) return false;
  return me.permissions.has(PermissionFlagsBits.BanMembers) || botHasAdministrator(guild);
}

async function fetchAllMembers(guild) {
  if (!guild.members.cache.size || guild.members.cache.size < guild.memberCount) {
    await guild.members.fetch();
  }
  return [...guild.members.cache.values()];
}

function classifyMembers(guild, members) {
  const me = guild.members.me;
  const eligible = [];
  const excluded = [];
  const exclusionCounts = {};

  const addExcluded = (member, reason) => {
    exclusionCounts[reason] = (exclusionCounts[reason] || 0) + 1;
    excluded.push({
      id: member.id,
      tag: member.user.tag,
      reason,
    });
  };

  for (const member of members) {
    if (member.id === guild.ownerId) {
      addExcluded(member, "Server owner");
      continue;
    }

    if (me && member.id === me.id) {
      addExcluded(member, "Nexus bot account");
      continue;
    }

    if (!me) {
      addExcluded(member, "Nexus member record unavailable");
      continue;
    }

    if (!member.bannable) {
      if (member.roles.highest.comparePositionTo(me.roles.highest) >= 0) {
        addExcluded(member, "Protected by role hierarchy");
      } else {
        addExcluded(member, "Cannot be banned by Discord");
      }
      continue;
    }

    eligible.push({
      id: member.id,
      tag: member.user.tag,
      displayName: member.displayName,
    });
  }

  return {
    examined: members.length,
    eligible,
    excluded,
    exclusionCounts,
    ownerId: guild.ownerId,
  };
}

async function getPanelSnapshot(client, config, lastAction) {
  const targetGuild = await getTargetGuild(client, config);
  if (!targetGuild) {
    return {
      targetGuild: null,
      memberCount: 0,
      hasAdministrator: false,
      connected: false,
      systemStatus: "Target server unreachable",
      lastAction,
    };
  }

  let memberCount = targetGuild.memberCount;
  try {
    const preview = await targetGuild.fetch();
    memberCount = preview.memberCount;
  } catch {
    // keep cached count
  }

  const me = targetGuild.members.me || (await targetGuild.members.fetchMe().catch(() => null));
  const hasAdministrator = Boolean(me && me.permissions.has(PermissionFlagsBits.Administrator));

  return {
    targetGuild,
    memberCount,
    hasAdministrator,
    connected: true,
    systemStatus: hasAdministrator ? "Operational" : "Limited permissions",
    lastAction,
  };
}

module.exports = {
  getTargetGuild,
  getControlGuild,
  botHasAdministrator,
  botCanBan,
  fetchAllMembers,
  classifyMembers,
  getPanelSnapshot,
};
