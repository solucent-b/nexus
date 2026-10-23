"use strict";

const { BAN_REASON, PROGRESS_MIN_INTERVAL_MS } = require("../utils/constants");
const guildService = require("./guildService");
const logger = require("../utils/logger");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeBans(context, operation, onProgress) {
  const guild = await guildService.getTargetGuild(context.client, context.config);
  if (!guild) {
    throw new Error("Target server is unreachable");
  }

  if (!guildService.botCanBan(guild)) {
    throw new Error("Nexus is missing Ban Members / Administrator permission on the target server");
  }

  const selectedIds = [...operation.selected];
  const successful = [];
  const failed = [];
  const started = Date.now();

  await onProgress({
    status: "Processing",
    completed: 0,
    total: selectedIds.length,
    successful: 0,
    failed: 0,
  });

  for (let index = 0; index < selectedIds.length; index += 1) {
    const userId = selectedIds[index];
    const memberRecord = operation.eligible.find((entry) => entry.id === userId);
    const tag = memberRecord?.tag || userId;

    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member && !member.bannable) {
        failed.push({
          id: userId,
          tag,
          reason: member.id === guild.ownerId ? "Server owner" : "Protected by role hierarchy",
        });
      } else {
        await guild.members.ban(userId, {
          deleteMessageSeconds: 0,
          reason: BAN_REASON,
        });
        successful.push({
          id: userId,
          tag,
          reason: BAN_REASON,
        });
      }
    } catch (error) {
      failed.push({
        id: userId,
        tag,
        reason: sanitizeError(error),
      });
      logger.warn(`Ban failed for ${userId}`, error);
    }

    const completed = index + 1;
    const shouldPulse =
      completed === selectedIds.length ||
      completed % 5 === 0 ||
      Date.now() - (operation.lastProgressEdit || 0) >= PROGRESS_MIN_INTERVAL_MS;

    if (shouldPulse) {
      operation.lastProgressEdit = Date.now();
      await onProgress({
        status: "Processing",
        completed,
        total: selectedIds.length,
        successful: successful.length,
        failed: failed.length,
      });
    }

    await delay(250);
  }

  return {
    successful,
    failed,
    durationMs: Date.now() - started,
  };
}

function sanitizeError(error) {
  const code = error?.code;
  if (code === 50013) return "Missing permissions";
  if (code === 50007) return "Cannot message this user";
  if (code === 10007) return "Unknown member";
  if (code === 10013) return "Unknown user";
  if (code === 50035) return "Invalid form body";
  if (typeof error?.message === "string" && error.message.length < 180) {
    return error.message.replace(contextSafeRegex(), "[redacted]");
  }
  return "Discord API error";
}

function contextSafeRegex() {
  return /(Bot\s)?[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g;
}

module.exports = { executeBans, sanitizeError };
