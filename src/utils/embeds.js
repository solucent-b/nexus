"use strict";

const { EmbedBuilder } = require("discord.js");
const { COLORS, BRAND } = require("./constants");

function baseEmbed(color = COLORS.electricBlue) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: BRAND.name })
    .setFooter({ text: BRAND.footer })
    .setTimestamp();
}

function panelEmbed({ targetGuild, memberCount, hasAdministrator, lastAction, systemStatus, connected }) {
  const connection = connected ? "Online" : "Offline";
  const permissionStatus = hasAdministrator ? "Administrator" : "Missing Administrator";
  const last = lastAction
    ? `${lastAction.summary} (${formatWhen(lastAction.at)})`
    : "None";

  return baseEmbed(connected ? COLORS.electricBlue : COLORS.danger)
    .setTitle("NEXUS | Remote Administration")
    .setDescription(`*${BRAND.tagline}*`)
    .setThumbnail(targetGuild?.iconURL({ size: 256 }) || null)
    .addFields(
      {
        name: "Connected Server",
        value: targetGuild ? `**${targetGuild.name}**\n\`${targetGuild.id}\`` : "Unavailable",
        inline: false,
      },
      {
        name: "System Information",
        value: [
          `• Connection: **${connection}**`,
          `• Members: **${Number(memberCount || 0).toLocaleString("en-US")}**`,
          `• Permissions: **${permissionStatus}**`,
          `• Status: **${systemStatus}**`,
          `• Last action: ${last}`,
        ].join("\n"),
      },
      {
        name: "Management",
        value: "Use **Ban All** to open a protected bulk-moderation workflow.\nMembers are never banned from this button alone.",
      }
    );
}

function previewEmbed(operation) {
  const excludedLines = formatExclusionSummary(operation.exclusionCounts);
  return baseEmbed(COLORS.electricBlue)
    .setTitle("NEXUS | Member Selection")
    .setDescription(
      "Review eligible members, then select accounts to include. Nothing is executed until you confirm."
    )
    .addFields(
      {
        name: "Examination",
        value: [
          `• Members examined: **${operation.examined}**`,
          `• Eligible: **${operation.eligible.length}**`,
          `• Excluded: **${operation.excluded.length}**`,
          `• Selected: **${operation.selected.size}**`,
        ].join("\n"),
      },
      {
        name: "Exclusion Reasons",
        value: excludedLines || "None",
      },
      {
        name: "Page",
        value: `**${operation.page + 1}** / **${Math.max(1, operation.totalPages)}**`,
        inline: true,
      }
    );
}

function confirmEmbed(operation, previewLines) {
  return baseEmbed(COLORS.warning)
    .setTitle("NEXUS | Confirm Bulk Ban")
    .setDescription(
      "This action uses the Discord API against the **target server**.\nNative Discord audit logs will record each ban. This confirmation expires if unused."
    )
    .addFields(
      {
        name: "Selection",
        value: [
          `• Selected members: **${operation.selected.size}**`,
          `• Eligible pool: **${operation.eligible.length}**`,
          `• Target: **${operation.targetName}**`,
        ].join("\n"),
      },
      {
        name: "Selected Accounts",
        value: previewLines || "None",
      }
    );
}

function progressEmbed(stats) {
  return baseEmbed(COLORS.electricBlue)
    .setTitle("NEXUS | Operation Progress")
    .addFields({
      name: "Status",
      value: [
        `**${stats.status}**`,
        "",
        `Completed: **${stats.completed} / ${stats.total}**`,
        `Successful: **${stats.successful}**`,
        `Failed: **${stats.failed}**`,
      ].join("\n"),
    });
}

function reportEmbed(report) {
  const color =
    report.failedBans > 0 && report.successfulBans === 0
      ? COLORS.danger
      : report.failedBans > 0
        ? COLORS.warning
        : COLORS.success;

  return baseEmbed(color)
    .setTitle("NEXUS | Moderation Report")
    .addFields(
      {
        name: "Operation",
        value: [
          `**Bulk Ban**`,
          `Status: **${report.status}**`,
          `Target Server: **${report.targetServer}**`,
          `Initiator: <@${report.initiatorId}>`,
        ].join("\n"),
      },
      {
        name: "Statistics",
        value: [
          `• Members Examined: **${report.membersExamined}**`,
          `• Eligible Members: **${report.eligibleMembers}**`,
          `• Selected Members: **${report.selectedMembers}**`,
          `• Bans Attempted: **${report.bansAttempted}**`,
          `• Successful Bans: **${report.successfulBans}**`,
          `• Failed Bans: **${report.failedBans}**`,
          `• Skipped Members: **${report.skippedMembers}**`,
        ].join("\n"),
      },
      {
        name: "Timing",
        value: [
          `Start: ${report.startTime}`,
          `End: ${report.endTime}`,
          `Duration: **${report.duration}**`,
        ].join("\n"),
      }
    );
}

function errorEmbed(title, description) {
  return baseEmbed(COLORS.danger).setTitle(title).setDescription(description);
}

function formatWhen(iso) {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatExclusionSummary(counts) {
  if (!counts) return "None";
  const lines = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `• ${reason}: **${n}**`);
  return lines.join("\n") || "None";
}

function truncateField(text, max = 1024) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 20)}\n…truncated`;
}

module.exports = {
  baseEmbed,
  panelEmbed,
  previewEmbed,
  confirmEmbed,
  progressEmbed,
  reportEmbed,
  errorEmbed,
  truncateField,
};
