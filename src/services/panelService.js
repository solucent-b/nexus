"use strict";

const { panelEmbed } = require("../utils/embeds");
const { panelButtons } = require("../components/buttons");
const database = require("../storage/database");
const guildService = require("./guildService");
const logger = require("../utils/logger");

async function snapshot(context) {
  const lastAction = database.getLastAction();
  return guildService.getPanelSnapshot(context.client, context.config, lastAction);
}

async function buildPayload(context, { mode = "idle", operation = null, extraFields = [], components, files } = {}) {
  const view = await snapshot(context);
  const payload = {
    content: null,
    embeds: [
      panelEmbed({
        ...view,
        logs: database.getLogs(),
        mode,
        operation,
        extraFields,
      }),
    ],
    components: components || [
      panelButtons({
        banAllDisabled: mode === "running",
        leaveDisabled: !view.connected,
      }),
    ],
  };
  if (files?.length) payload.files = files;
  return payload;
}

async function fetchStoredMessage(context) {
  const stored = database.getPanel();
  if (!stored?.channelId || !stored?.messageId) return null;

  try {
    const channel = await context.client.channels.fetch(stored.channelId);
    if (!channel?.isTextBased()) return null;
    const message = await channel.messages.fetch(stored.messageId);
    return message;
  } catch {
    return null;
  }
}

async function hasOpenPanel(context) {
  const message = await fetchStoredMessage(context);
  if (message) return { open: true, message };
  if (database.getPanel()) {
    database.clearPanel();
    logger.warn("Stored panel message was missing; panel slot is free");
  }
  return { open: false, message: null };
}

async function createPanel(context, channel, operatorId) {
  database.clearLogs();
  database.appendLog(`Panel opened by <@${operatorId}>`);
  const payload = await buildPayload(context, { mode: "idle" });
  const created = await channel.send(payload);
  database.setPanel({
    channelId: channel.id,
    messageId: created.id,
    operatorId,
  });
  return created;
}

async function updatePanel(context, options = {}) {
  const message = options.message || (await fetchStoredMessage(context));
  if (!message) return null;
  const payload = await buildPayload(context, options);
  try {
    return await message.edit(payload);
  } catch (error) {
    logger.error("Panel update failed", error);
    return null;
  }
}

async function refreshPanel(context) {
  const { open, message } = await hasOpenPanel(context);
  if (!open) return null;
  return updatePanel(context, { message, mode: "idle" });
}

async function closePanel(context, actorId) {
  const stored = database.getPanel();
  const message = await fetchStoredMessage(context);
  if (message) {
    try {
      await message.delete();
    } catch {
      logger.warn("Panel message could not be deleted; clearing stored panel anyway");
    }
  }
  database.clearPanel();
  database.clearLogs();
  if (stored || message) {
    logger.info(`Panel closed by ${actorId || "system"}`);
  }
  return true;
}

function isPanelMessage(interaction) {
  const stored = database.getPanel();
  return Boolean(
    stored &&
      interaction.message &&
      stored.messageId === interaction.message.id &&
      stored.channelId === interaction.channelId
  );
}

module.exports = {
  buildPayload,
  fetchStoredMessage,
  hasOpenPanel,
  createPanel,
  updatePanel,
  refreshPanel,
  closePanel,
  isPanelMessage,
};
