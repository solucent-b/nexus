"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { authorizeInteraction, denyEphemeral } = require("../security/authorization");
const panelService = require("../services/panelService");
const logger = require("../utils/logger");

const data = new SlashCommandBuilder()
  .setName("panel")
  .setDescription("Create or refresh the Nexus administration panel")
  .setDMPermission(false);

async function execute(interaction, context) {
  const auth = authorizeInteraction(interaction, context.config);
  if (!auth.ok) {
    await denyEphemeral(interaction, auth.reason);
    return;
  }

  if (interaction.channelId !== context.config.controlChannelId) {
    await denyEphemeral(
      interaction,
      "Run `/panel` in the designated control channel so the persistent panel stays in one place."
    );
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const message = await panelService.upsertPanel(context);
    await interaction.editReply({
      content: `Nexus panel is live in <#${context.config.controlChannelId}> (${message.url}).`,
    });
  } catch (error) {
    logger.error("Failed to upsert panel", error);
    await interaction.editReply({
      content: "Unable to create or refresh the Nexus panel. Check bot permissions in the control channel.",
    });
  }
}

module.exports = { data, execute };
