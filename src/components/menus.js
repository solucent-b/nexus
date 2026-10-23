"use strict";

const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { CUSTOM_IDS, PAGE_SIZE } = require("../utils/constants");

function pageSlice(operation) {
  const start = operation.page * PAGE_SIZE;
  return operation.eligible.slice(start, start + PAGE_SIZE);
}

function selectionMenu(operation) {
  const pageMembers = pageSlice(operation);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.select(operation.id))
    .setPlaceholder(
      pageMembers.length
        ? "Select members on this page (multi-select)"
        : "No eligible members on this page"
    )
    .setMinValues(1)
    .setMaxValues(Math.max(1, pageMembers.length))
    .setDisabled(pageMembers.length === 0);

  if (!pageMembers.length) {
    menu.addOptions({ label: "No eligible members", value: "none", description: "Nothing to select" });
    return new ActionRowBuilder().addComponents(menu);
  }

  menu.addOptions(
    pageMembers.map((member) => ({
      label: clip(member.tag || member.displayName || member.id, 100),
      value: member.id,
      description: clip(`${member.id}${operation.selected.has(member.id) ? " • selected" : ""}`, 100),
      default: operation.selected.has(member.id),
    }))
  );

  return new ActionRowBuilder().addComponents(menu);
}

function clip(text, max) {
  const value = String(text || "");
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

module.exports = { pageSlice, selectionMenu };
