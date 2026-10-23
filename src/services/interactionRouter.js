"use strict";

const { MessageFlags } = require("discord.js");
const { authorizeInteraction, denyEphemeral } = require("../security/authorization");
const { parseCustomId, selectionButtons, confirmationButtons, leaveConfirmButtons } = require("../components/buttons");
const targetGuild = require("./targetGuild");
const { selectionMenu, pageSlice } = require("../components/menus");
const { truncateField } = require("../utils/embeds");
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

  if (!panelService.isPanelMessage(interaction)) {
    await interaction.reply({
      content: "This control is not the active Nexus panel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  operationManager.expireStale();

  if (parsed.action === "close") {
    await closeFromButton(interaction, context);
    return;
  }

  if (parsed.action === "banall") {
    await startBanAll(interaction, context);
    return;
  }

  if (parsed.action === "leave") {
    await askLeave(interaction, context);
    return;
  }

  if (parsed.action === "leaveno") {
    database.appendLog("Leave cancelled.");
    await interaction.update(await panelService.buildPayload(context, { mode: "idle" }));
    return;
  }

  if (parsed.action === "leaveyes") {
    await confirmLeave(interaction, context);
    return;
  }

  const operation = operationManager.get(parsed.opId);
  if (!operation) {
    await interaction.reply({
      content: "This operation is no longer active. Use Ban All on the panel to start again.",
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
    database.appendLog("Workflow expired. No bans executed.");
    await panelService.updatePanel(context, { message: interaction.message, mode: "idle" });
    await interaction.reply({
      content: "This confirmation or selection expired. Start again from Ban All.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (parsed.action === "prev" || parsed.action === "next") {
    await turnPage(interaction, context, operation, parsed.action);
    return;
  }

  if (parsed.action === "selok") {
    await askConfirmation(interaction, context, operation);
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

  if (!panelService.isPanelMessage(interaction)) {
    await interaction.reply({
      content: "This control is not the active Nexus panel.",
      flags: MessageFlags.Ephemeral,
    });
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

  database.appendLog(`Selection updated: ${operation.selected.size} member(s)`);
  await interaction.update(
    await panelService.buildPayload(context, {
      mode: "selecting",
      operation,
      components: [selectionMenu(operation), selectionButtons(operation)],
    })
  );
}

async function closeFromButton(interaction, context) {
  if (operationManager.isLocked()) {
    await interaction.reply({
      content: "Finish or cancel the current operation before closing the panel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();
  await panelService.closePanel(context, interaction.user.id);
}

async function askLeave(interaction, context) {
  if (operationManager.isLocked()) {
    await interaction.reply({
      content: "Finish or cancel the current operation before leaving the connected server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = await guildService.getTargetGuild(context.client, context.config);
  if (!guild || guild.id === context.config.controlGuildId) {
    await interaction.reply({
      content: "Nexus is not connected to a target server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  database.appendLog(`Leave requested for **${guild.name}**`);
  await interaction.update(
    await panelService.buildPayload(context, {
      mode: "confirming",
      extraFields: [
        {
          name: "Leave Connected Server",
          value: `Nexus will leave **${guild.name}** (\`${guild.id}\`).\nThe control server is not affected. You can Invite again later.`,
        },
      ],
      components: [leaveConfirmButtons()],
    })
  );
}

async function confirmLeave(interaction, context) {
  if (operationManager.isLocked()) {
    await interaction.reply({
      content: "A moderation operation is running. Leave is blocked until it finishes.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  const guild = await guildService.getTargetGuild(context.client, context.config);
  if (!guild) {
    database.appendLog("Leave failed: no connected target server.");
    await panelService.updatePanel(context, { message: interaction.message, mode: "idle" });
    return;
  }

  if (guild.id === context.config.controlGuildId) {
    database.appendLog("Leave blocked: Nexus will not leave the control server.");
    await panelService.updatePanel(context, { message: interaction.message, mode: "idle" });
    return;
  }

  const name = guild.name;
  const id = guild.id;

  try {
    await guild.leave();
  } catch (error) {
    logger.error("Failed to leave target guild", error);
    database.appendLog(`Leave failed for **${name}**.`);
    await panelService.updatePanel(context, { message: interaction.message, mode: "idle" });
    return;
  }

  targetGuild.onGuildLeave(context.client, context.config, id);
  database.setLastAction({ summary: `Left ${name}` });
  database.appendLog(`Left **${name}**. Invite Nexus to connect another server.`);
  await panelService.updatePanel(context, { message: interaction.message, mode: "idle" });
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

  await interaction.deferUpdate();
  database.appendLog(`Ban All started by <@${interaction.user.id}>`);
  await panelService.updatePanel(context, {
    message: interaction.message,
    mode: "running",
    extraFields: [{ name: "Operation", value: "Examining target members…" }],
  });

  const failIdle = async (line) => {
    operationManager.releaseLock(pendingLockId);
    database.appendLog(line);
    await panelService.updatePanel(context, { message: interaction.message, mode: "idle" });
  };

  const targetGuild = await guildService.getTargetGuild(context.client, context.config);
  if (!targetGuild) {
    await failIdle("Target server is unreachable.");
    return;
  }

  if (!guildService.botCanBan(targetGuild)) {
    await failIdle("Missing Ban Members / Administrator on the target server.");
    return;
  }

  let members;
  try {
    members = await guildService.fetchAllMembers(targetGuild);
  } catch (error) {
    logger.error("Member fetch failed", error);
    await failIdle("Unable to retrieve the target member list.");
    return;
  }

  const classification = guildService.classifyMembers(targetGuild, members);
  database.appendLog(
    `Examined ${classification.examined}: ${classification.eligible.length} eligible, ${classification.excluded.length} excluded`
  );

  if (!classification.eligible.length) {
    await failIdle("No eligible members. Server owner and protected roles were skipped.");
    return;
  }

  const operation = operationManager.createOperation(
    interaction.user.id,
    classification,
    targetGuild.name
  );
  operationManager.rebindLock(pendingLockId, operation.id);
  operation.previewMessageId = interaction.message.id;
  operationManager.setStatus(operation, "selecting");
  database.appendLog("Member selection open. Nothing is pre-selected.");

  await panelService.updatePanel(context, {
    message: interaction.message,
    mode: "selecting",
    operation,
    components: [selectionMenu(operation), selectionButtons(operation)],
  });
}

async function turnPage(interaction, context, operation, direction) {
  if (operation.status !== "selecting") {
    await interaction.reply({ content: "Paging is only available during selection.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (direction === "prev" && operation.page > 0) operation.page -= 1;
  if (direction === "next" && operation.page < operation.totalPages - 1) operation.page += 1;
  database.appendLog(`Selection page ${operation.page + 1}/${operation.totalPages}`);

  await interaction.update(
    await panelService.buildPayload(context, {
      mode: "selecting",
      operation,
      components: [selectionMenu(operation), selectionButtons(operation)],
    })
  );
}

async function askConfirmation(interaction, context, operation) {
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
      .slice(0, 12)
      .map((member) => `• ${member.tag} | ${member.id}`)
      .join("\n") + (selected.length > 12 ? `\n…and ${selected.length - 12} more` : "")
  );

  database.appendLog(`Confirmation required for ${operation.selected.size} member(s)`);

  await interaction.update(
    await panelService.buildPayload(context, {
      mode: "confirming",
      operation,
      extraFields: [
        {
          name: "Confirm Bulk Ban",
          value: `Selected **${operation.selected.size}** of **${operation.eligible.length}** eligible.\nNative Discord audit logs will record each ban.`,
        },
        { name: "Selected Accounts", value: previewLines || "None" },
      ],
      components: [confirmationButtons(operation)],
    })
  );
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
  database.appendLog("Operation cancelled. No bans executed.");

  await interaction.update(await panelService.buildPayload(context, { mode: "idle" }));
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
    database.appendLog("Confirmation expired. No bans executed.");
    await interaction.update(await panelService.buildPayload(context, { mode: "idle" }));
    return;
  }

  operationManager.setStatus(operation, "running");
  database.appendLog(`Executing ${operation.selected.size} ban(s)`);
  await interaction.update(
    await panelService.buildPayload(context, {
      mode: "running",
      extraFields: [
        {
          name: "Operation Progress",
          value: `Processing **0 / ${operation.selected.size}**`,
        },
      ],
    })
  );

  const panelMessage = interaction.message;
  let results;

  try {
    results = await moderationService.executeBans(context, operation, async (stats) => {
      database.appendLog(`Progress ${stats.completed}/${stats.total} • ok ${stats.successful} • fail ${stats.failed}`);
      await panelService.updatePanel(context, {
        message: panelMessage,
        mode: "running",
        extraFields: [
          {
            name: "Operation Progress",
            value: `**${stats.status}**\nCompleted: **${stats.completed} / ${stats.total}**\nSuccessful: **${stats.successful}**\nFailed: **${stats.failed}**`,
          },
        ],
      });
    });
  } catch (error) {
    logger.error("Bulk ban execution failed", error);
    operationManager.setStatus(operation, "failed");
    operationManager.releaseLock(operation.id);
    database.appendLog("Execution stopped before completion. Will not auto-resume.");
    await panelService.updatePanel(context, { message: panelMessage, mode: "idle" });
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
  database.appendLog(
    `Report: ${report.status} • examined ${report.membersExamined} • selected ${report.selectedMembers} • ok ${report.successfulBans} • fail ${report.failedBans} • ${report.duration}`
  );

  await panelService.updatePanel(context, {
    message: panelMessage,
    mode: "idle",
    extraFields: [
      {
        name: "Last Report",
        value: truncateField(
          [
            `**${report.status}** on **${report.targetServer}**`,
            `Selected ${report.selectedMembers} • ok ${report.successfulBans} • fail ${report.failedBans}`,
            `Duration ${report.duration}`,
          ].join("\n")
        ),
      },
    ],
    files: payload.files,
  });
}

module.exports = { handleButton, handleSelect };
