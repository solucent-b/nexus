"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { authorizeInteraction, denyEphemeral } = require("../security/authorization");
const panelService = require("../services/panelService");
const logger = require("../utils/logger");

const data = new SlashCommandBuilder()
  .setName("panel")
  .setDescription("Open the Nexus administration panel in this channel")
  .setDMPermission(false);

async function execute(interaction, context) {
  const auth = authorizeInteraction(interaction, context.config);
  if (!auth.ok) {
    await denyEphemeral(interaction, auth.reason);
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const existing = await panelService.hasOpenPanel(context);
    if (existing.open) {
      await interaction.editReply({
        content: `A Nexus panel is already open in <#${existing.message.channelId}>. Close it with the **Close** button before running \`/panel\` again.`,
      });
      return;
    }

    if (!interaction.channel?.isTextBased()) {
      await interaction.editReply({ content: "Run `/panel` in a text channel." });
      return;
    }

    const message = await panelService.createPanel(context, interaction.channel, interaction.user.id);
    await interaction.editReply({
      content: `Nexus panel is live here: ${message.url}`,
    });
  } catch (error) {
    logger.error("Failed to create panel", error);
    await interaction.editReply({
      content: "Unable to create the Nexus panel. Check bot permissions in this channel.",
    });
  }
}

module.exports = { data, execute };
