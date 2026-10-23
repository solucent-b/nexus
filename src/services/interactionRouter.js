"use strict";

const { MessageFlags } = require("discord.js");
const { authorizeInteraction, denyEphemeral } = require("../security/authorization");
const { parseCustomId, selectionButtons, confirmationButtons, disabledRow } = require("../components/buttons");
const { selectionMenu, pageSlice } = require("../components/menus");
const { previewEmbed, confirmEmbed, progressEmbed, errorEmbed, truncateField } = require("../utils/embeds");
const operationManager = require("./operationManager");
const guildService = require("./guildService");
const moderationService = require("./moderationService");
const reportService = require("./reportService");
const panelService = require("./panelService");
const database = require("../storage/database");
const logger = require("../utils/logger");

async function handleButton(interaction, context) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  const auth = authorizeInteraction(interaction, context.config);
  if (!auth.ok) {
    await denyEphemeral(interaction, auth.reason);
    return;
  }

  operationManager.expireStale();

  if (parsed.action === "banall") {
    await startBanAll(interaction, context);
    return;
  }

  const operation = operationManager.get(parsed.opId);
  if (!operation) {
    await interaction.reply({
      content: "This operation is no longer active. Start a new Ban All workflow from the panel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (operation.userId !== interaction.user.id) {
    await denyEphemeral(interaction, "Only the operator who started this workflow can continue it.");
    return;
  }

  if (parsed.action === "cancel" || parsed.action === "abort") {
    await cancelOperation(interaction, context, operation);
    return;
  }

  if (operation.status === "expired") {
    await interaction.reply({
      content: "This confirmation or selection expired. Start again from Ban All.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (parsed.action === "prev" || parsed.action === "next") {
    await turnPage(interaction, operation, parsed.action);
    return;
  }

  if (parsed.action === "selok") {
    await askConfirmation(interaction, operation);
    return;
  }

  if (parsed.action === "exec") {
    await runExecution(interaction, context, operation);
  }
}

async function handleSelect(interaction, context) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.action !== "msel") return;

  const auth = authorizeInteraction(interaction, context.config);
  if (!auth.ok) {
    await denyEphemeral(interaction, auth.reason);
    return;
  }

  const operation = operationManager.get(parsed.opId);
  if (!operation || operation.userId !== interaction.user.id || operation.status !== "selecting") {
    await interaction.reply({
      content: "This selection menu is no longer valid.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const pageIds = new Set(pageSlice(operation).map((member) => member.id));
  for (const id of pageIds) operation.selected.delete(id);
  for (const id of interaction.values) {
    if (pageIds.has(id)) operation.selected.add(id);
  }

  await interaction.update({
    embeds: [previewEmbed(operation)],
    components: [selectionMenu(operation), selectionButtons(operation)],
  });
}

async function startBanAll(interaction, context) {
  const pendingLockId = `pending:${interaction.id}`;
  if (!operationManager.acquireLock(pendingLockId)) {
    await interaction.reply({
      content: "A Nexus moderation operation is already running. Wait for it to finish.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetGuild = await guildService.getTargetGuild(context.client, context.config);
  if (!targetGuild) {
    operationManager.releaseLock(pendingLockId);
    await interaction.editReply({
      embeds: [errorEmbed("NEXUS | Connection Error", "The target server is unreachable.")],
    });
    return;
  }

  if (!guildService.botCanBan(targetGuild)) {
    operationManager.releaseLock(pendingLockId);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          "NEXUS | Permission Error",
          "Nexus cannot ban members on the target server. Grant Ban Members (and typically Administrator) and place the Nexus role above accounts you intend to moderate. Discord will still protect the server owner and higher roles."
        ),
      ],
    });
    return;
  }

  let members;
  try {
    members = await guildService.fetchAllMembers(targetGuild);
  } catch (error) {
    logger.error("Member fetch failed", error);
    operationManager.releaseLock(pendingLockId);
    await interaction.editReply({
      embeds: [errorEmbed("NEXUS | Examination Error", "Unable to retrieve the target member list.")],
    });
    return;
  }

  const classification = guildService.classifyMembers(targetGuild, members);

  let channel;
  try {
    channel = await context.client.channels.fetch(context.config.logChannelId);
    if (!channel || !channel.isTextBased()) throw new Error("Log channel is not a text channel");
  } catch (error) {
    logger.error("Log channel fetch failed", error);
    operationManager.releaseLock(pendingLockId);
    await interaction.editReply({
      embeds: [errorEmbed("NEXUS | Channel Error", "Unable to post in the configured log channel.")],
    });
    return;
  }

  if (!classification.eligible.length) {
    operationManager.releaseLock(pendingLockId);
    await channel.send({
      embeds: [
        previewEmbed({
          examined: classification.examined,
          eligible: [],
          excluded: classification.excluded,
          exclusionCounts: classification.exclusionCounts,
          selected: new Set(),
          page: 0,
          totalPages: 1,
        }),
      ],
      components: [disabledRow("No eligible members")],
    });
    await interaction.editReply({
      content: `Examination complete. No eligible members were found. Details posted in <#${channel.id}>.`,
    });
    return;
  }

  const operation = operationManager.createOperation(
    interaction.user.id,
    classification,
    targetGuild.name
  );
  operationManager.rebindLock(pendingLockId, operation.id);

  try {
    const preview = await channel.send({
      embeds: [previewEmbed(operation)],
      components: [selectionMenu(operation), selectionButtons(operation)],
    });
    operation.previewMessageId = preview.id;
    operationManager.setStatus(operation, "selecting");
  } catch (error) {
    logger.error("Selection preview send failed", error);
    operationManager.setStatus(operation, "failed");
    operationManager.releaseLock(operation.id);
    await interaction.editReply({
      embeds: [errorEmbed("NEXUS | Channel Error", "Unable to post the selection preview in the log channel.")],
    });
    return;
  }

  await interaction.editReply({
    content: `Member examination complete. Continue in <#${channel.id}>. Eligible members are **not** pre-selected.`,
  });
}

async function turnPage(interaction, operation, direction) {
  if (operation.status !== "selecting") {
    await interaction.reply({ content: "Paging is only available during selection.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (direction === "prev" && operation.page > 0) operation.page -= 1;
  if (direction === "next" && operation.page < operation.totalPages - 1) operation.page += 1;

  await interaction.update({
    embeds: [previewEmbed(operation)],
    components: [selectionMenu(operation), selectionButtons(operation)],
  });
}

async function askConfirmation(interaction, operation) {
  if (operation.status !== "selecting") {
    await interaction.reply({ content: "Selection is no longer open.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (operation.selected.size === 0) {
    await interaction.reply({
      content: "Select at least one eligible member before confirming.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  operationManager.setStatus(operation, "confirming");
  const selected = operation.eligible.filter((member) => operation.selected.has(member.id));
  const previewLines = truncateField(
    selected
      .slice(0, 20)
      .map((member) => `• ${member.tag} | ${member.id}`)
      .join("\n") + (selected.length > 20 ? `\n…and ${selected.length - 20} more` : "")
  );

  await interaction.update({
    embeds: [confirmEmbed(operation, previewLines)],
    components: [confirmationButtons(operation)],
  });
}

async function cancelOperation(interaction, context, operation) {
  if (operation.status === "running") {
    await interaction.reply({
      content: "Execution has already started and cannot be cancelled mid-flight from this button.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  operationManager.setStatus(operation, "cancelled");
  operationManager.releaseLock(operation.id);
  database.setLastAction({ summary: "Bulk ban cancelled" });

  await interaction.update({
    embeds: [errorEmbed("NEXUS | Cancelled", "No bans were executed.")],
    components: [disabledRow("Cancelled")],
  });

  await panelService.refreshPanel(context);
}

async function runExecution(interaction, context, operation) {
  if (operation.status !== "confirming") {
    await interaction.reply({
      content: "This confirmation is no longer valid.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (operation.confirmExpiresAt && Date.now() > operation.confirmExpiresAt) {
    operationManager.setStatus(operation, "expired");
    operationManager.releaseLock(operation.id);
    await interaction.update({
      embeds: [errorEmbed("NEXUS | Expired", "Confirmation expired. No bans were executed.")],
      components: [disabledRow("Expired")],
    });
    return;
  }

  operationManager.setStatus(operation, "running");
  await interaction.update({
    embeds: [
      progressEmbed({
        status: "Processing",
        completed: 0,
        total: operation.selected.size,
        successful: 0,
        failed: 0,
      }),
    ],
    components: [disabledRow("Running")],
  });

  const progressMessage = interaction.message;
  let results;

  try {
    results = await moderationService.executeBans(context, operation, async (stats) => {
      try {
        await progressMessage.edit({
          embeds: [progressEmbed(stats)],
          components: [disabledRow("Running")],
        });
      } catch (error) {
        logger.warn("Progress edit skipped", error);
      }
    });
  } catch (error) {
    logger.error("Bulk ban execution failed", error);
    operationManager.setStatus(operation, "failed");
    operationManager.releaseLock(operation.id);
    await progressMessage.edit({
      embeds: [errorEmbed("NEXUS | Execution Error", "The operation stopped before completion. No unfinished work will auto-resume.")],
      components: [disabledRow("Failed")],
    });
    return;
  }

  const report = reportService.buildReport({
    operation,
    results,
    finishedAt: Date.now(),
  });
  const payload = reportService.buildReportMessage(report);

  operationManager.setStatus(operation, "completed");
  operationManager.releaseLock(operation.id);
  database.setLastAction({
    summary: `Bulk ban ${report.successfulBans} ok / ${report.failedBans} failed`,
  });

  await progressMessage.edit({
    embeds: payload.embeds,
    files: payload.files,
    components: [disabledRow("Completed")],
  });

  await panelService.refreshPanel(context);
}

module.exports = { handleButton, handleSelect };
