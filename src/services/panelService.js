"use strict";

const { panelEmbed } = require("../utils/embeds");
const { panelButtons } = require("../components/buttons");
const database = require("../storage/database");
const guildService = require("./guildService");
const logger = require("../utils/logger");

async function buildPayload(context) {
  const lastAction = database.getLastAction();
  const snapshot = await guildService.getPanelSnapshot(context.client, context.config, lastAction);
  return {
    embeds: [panelEmbed(snapshot)],
    components: [panelButtons()],
  };
}

async function upsertPanel(context) {
  const channel = await context.client.channels.fetch(context.config.controlChannelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Control channel is missing or is not a text channel");
  }

  const payload = await buildPayload(context);
  const stored = database.getPanel();

  if (stored?.messageId) {
    try {
      const existing = await channel.messages.fetch(stored.messageId);
      const edited = await existing.edit(payload);
      database.setPanel({
        channelId: channel.id,
        messageId: edited.id,
      });
      return edited;
    } catch {
      logger.warn("Stored panel message was missing; creating a new panel");
    }
  }

  const created = await channel.send(payload);
  database.setPanel({
    channelId: channel.id,
    messageId: created.id,
  });
  return created;
}

async function refreshPanel(context) {
  try {
    return await upsertPanel(context);
  } catch (error) {
    logger.error("Panel refresh failed", error);
    return null;
  }
}

module.exports = { upsertPanel, refreshPanel, buildPayload };
