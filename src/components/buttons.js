"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { CUSTOM_IDS } = require("../utils/constants");

function botInviteUrl(client) {
  const clientId = client.application?.id || client.user?.id;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: "8",
    scope: "bot applications.commands",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function panelButtons({ banAllDisabled = false, leaveDisabled = true } = {}) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.banAll)
      .setLabel("Ban All")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(banAllDisabled),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.invite)
      .setLabel("Invite")
      .setStyle(ButtonStyle.Secondary)
  );

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.leave)
      .setLabel("Leave Server")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(leaveDisabled || banAllDisabled),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.close)
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(banAllDisabled)
  );

  return row;
}

function leaveConfirmButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.leaveYes)
      .setLabel("Confirm Leave")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.leaveNo)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
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
  if (customId === CUSTOM_IDS.invite) {
    return { action: "invite", opId: null };
  }
  if (customId === CUSTOM_IDS.close) {
    return { action: "close", opId: null };
  }
  if (customId === CUSTOM_IDS.leave) {
    return { action: "leave", opId: null };
  }
  if (customId === CUSTOM_IDS.leaveYes) {
    return { action: "leaveyes", opId: null };
  }
  if (customId === CUSTOM_IDS.leaveNo) {
    return { action: "leaveno", opId: null };
  }

  const match = /^nx:([a-f0-9]{8}):(msel|prev|next|selok|cancel|exec|abort)$/.exec(customId);
  if (!match) return null;
  return { opId: match[1], action: match[2] };
}

module.exports = {
  botInviteUrl,
  panelButtons,
  leaveConfirmButtons,
  selectionButtons,
  confirmationButtons,
  disabledRow,
  parseCustomId,
};
