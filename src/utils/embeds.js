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

function formatLogs(logs) {
  if (!logs?.length) return "No activity yet.";
  const lines = logs.slice(-8).map((entry) => {
    const clock = entry.at ? entry.at.slice(11, 19) : "--:--:--";
    return `\`${clock}\` ${entry.message}`;
  });
  return truncateField(lines.join("\n"));
}

function panelEmbed({
  targetGuild,
  memberCount,
  hasAdministrator,
  lastAction,
  systemStatus,
  connected,
  logs,
  mode = "idle",
  operation,
  extraFields = [],
}) {
  const connection = connected ? "Online" : "Offline";
  const permissionStatus = hasAdministrator ? "Administrator" : "Missing Administrator";
  const last = lastAction ? `${lastAction.summary} (${formatWhen(lastAction.at)})` : "None";
  const color =
    mode === "running"
      ? COLORS.electricBlue
      : mode === "confirming"
        ? COLORS.warning
        : connected
          ? COLORS.electricBlue
          : COLORS.danger;

  const embed = baseEmbed(color)
    .setTitle("NEXUS | Remote Administration")
    .setDescription(`*${BRAND.tagline}*`)
    .setThumbnail(targetGuild?.iconURL({ size: 256 }) || null)
    .addFields(
      {
        name: "Connected Server",
        value: targetGuild ? `**${targetGuild.name}**\n\`${targetGuild.id}\`` : "Unavailable",
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
      }
    );

  if (mode === "idle") {
    embed.addFields({
      name: "Management",
      value: "Use **Invite** to add Nexus to another server.\nUse **Leave Server** to disconnect Nexus from the connected server.\nUse **Ban All** to ban every eligible member on the connected server (confirmation required).\n**Close** removes this panel so `/panel` can be used again.",
    });
  }

  if (mode === "selecting" && operation) {
    embed.addFields(
      {
        name: "Examination",
        value: [
          `• Members examined: **${operation.examined}**`,
          `• Eligible: **${operation.eligible.length}**`,
          `• Excluded: **${operation.excluded.length}**`,
          `• Selected: **${operation.selected.size}**`,
          `• Page: **${operation.page + 1}** / **${Math.max(1, operation.totalPages)}**`,
        ].join("\n"),
      },
      {
        name: "Exclusion Reasons",
        value: formatExclusionSummary(operation.exclusionCounts),
      }
    );
  }

  for (const field of extraFields) embed.addFields(field);

  embed.addFields({
    name: "Logs",
    value: formatLogs(logs),
  });

  return embed;
}

function truncateField(text, max = 1024) {
  const value = String(text || "");
  if (value.length <= max) return value;
  return `${value.slice(0, max - 20)}\n…truncated`;
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
  return truncateField(lines.join("\n") || "None");
}

module.exports = {
  baseEmbed,
  panelEmbed,
  truncateField,
};
