"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { CUSTOM_IDS } = require("../utils/constants");

function panelButtons({ banAllDisabled = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.banAll)
      .setLabel("Ban All")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(banAllDisabled),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.close)
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(banAllDisabled)
  );
}

function selectionButtons(operation) {
  const hasPages = operation.totalPages > 1;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.pagePrev(operation.id))
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPages || operation.page === 0),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.pageNext(operation.id))
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPages || operation.page >= operation.totalPages - 1),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.confirmSelection(operation.id))
      .setLabel(`Confirm Selection (${operation.selected.size})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(operation.selected.size === 0),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.cancel(operation.id))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}

function confirmationButtons(operation) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.execute(operation.id))
      .setLabel(`Execute ${operation.selected.size} Ban(s)`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.abortConfirm(operation.id))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}

function disabledRow(label = "Operation closed") {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("nx:closed")
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function parseCustomId(customId) {
  if (customId === CUSTOM_IDS.banAll) {
    return { action: "banall", opId: null };
  }
  if (customId === CUSTOM_IDS.close) {
    return { action: "close", opId: null };
  }

  const match = /^nx:([a-f0-9]{8}):(msel|prev|next|selok|cancel|exec|abort)$/.exec(customId);
  if (!match) return null;
  return { opId: match[1], action: match[2] };
}

module.exports = {
  panelButtons,
  selectionButtons,
  confirmationButtons,
  disabledRow,
  parseCustomId,
};
