"use strict";

function isOwner(userId, config) {
  return config.ownerUserIds.includes(userId);
}

function isControlGuild(guildId, config) {
  return guildId === config.controlGuildId;
}

function isControlChannel(channelId, config) {
  return channelId === config.controlChannelId || channelId === config.logChannelId;
}

function authorizeInteraction(interaction, config) {
  if (!isOwner(interaction.user.id, config)) {
    return { ok: false, reason: "You are not authorized to operate Nexus." };
  }

  if (!interaction.guild || !isControlGuild(interaction.guild.id, config)) {
    return { ok: false, reason: "Nexus controls are restricted to the control server." };
  }

  if (!isControlChannel(interaction.channelId, config)) {
    return { ok: false, reason: "Nexus controls are restricted to authorized control channels." };
  }

  return { ok: true };
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
  isOwner,
  isControlGuild,
  isControlChannel,
  authorizeInteraction,
  denyEphemeral,
};
