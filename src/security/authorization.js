"use strict";

const { PermissionFlagsBits } = require("discord.js");

function isControlGuild(guildId, config) {
  return guildId === config.controlGuildId;
}

function canOperate(interaction, config) {
  if (!interaction.guild || !isControlGuild(interaction.guild.id, config)) {
    return { ok: false, reason: "Nexus controls are restricted to the control server." };
  }

  if (interaction.guild.ownerId === interaction.user.id) return { ok: true };

  const member = interaction.member;
  if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return { ok: true };

  return { ok: false, reason: "Only the server owner or Administrators can operate Nexus." };
}

function authorizeInteraction(interaction, config) {
  return canOperate(interaction, config);
}

function denyEphemeral(interaction, reason) {
  const payload = {
    content: `**Access denied.** ${reason}`,
    ephemeral: true,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

module.exports = {
  isControlGuild,
  canOperate,
  authorizeInteraction,
  denyEphemeral,
};
