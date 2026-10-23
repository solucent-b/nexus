"use strict";

const { AttachmentBuilder } = require("discord.js");
const { reportEmbed, truncateField } = require("../utils/embeds");

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} seconds`;
  const minutes = Math.floor(seconds / 60);
  const rem = (seconds % 60).toFixed(1);
  return `${minutes}m ${rem}s`;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function buildReport({ operation, results, finishedAt }) {
  const successfulBans = results.successful.length;
  const failedBans = results.failed.length;
  const bansAttempted = successfulBans + failedBans;
  const skippedMembers = Math.max(0, operation.examined - operation.selected.size);

  let status = "Completed";
  if (bansAttempted === 0) status = "Cancelled with no execution";
  else if (failedBans > 0 && successfulBans === 0) status = "Failed";
  else if (failedBans > 0) status = "Completed with errors";

  return {
    status,
    targetServer: operation.targetName,
    initiatorId: operation.userId,
    startTime: iso(operation.startedAt),
    endTime: iso(finishedAt),
    duration: formatDuration(finishedAt - operation.startedAt),
    membersExamined: operation.examined,
    eligibleMembers: operation.eligible.length,
    selectedMembers: operation.selected.size,
    bansAttempted,
    successfulBans,
    failedBans,
    skippedMembers,
    successful: results.successful,
    failed: results.failed,
  };
}

function linesFor(entries, formatter) {
  if (!entries.length) return "None";
  return entries.map(formatter).join("\n");
}

function toCsv(report) {
  const header = "result,user_tag,user_id,reason";
  const rows = [
    ...report.successful.map((item) =>
      ["success", csv(item.tag), csv(item.id), csv(item.reason || "Banned")].join(",")
    ),
    ...report.failed.map((item) =>
      ["failed", csv(item.tag), csv(item.id), csv(item.reason || "Unknown")].join(",")
    ),
  ];
  return [header, ...rows].join("\n");
}

function csv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}

function buildReportMessage(report) {
  const embed = reportEmbed(report);
  const successPreview = truncateField(
    linesFor(report.successful.slice(0, 15), (item) => `• ${item.tag} | ${item.id}`)
  );
  const failPreview = truncateField(
    linesFor(report.failed.slice(0, 15), (item) => `• ${item.tag} | ${item.reason}`)
  );

  embed.addFields(
    { name: "Successful Bans", value: successPreview },
    { name: "Failed Bans", value: failPreview }
  );

  const needsFile =
    report.successful.length > 15 ||
    report.failed.length > 15 ||
    report.bansAttempted > 20;

  const files = [];
  if (needsFile || report.failed.length > 0) {
    files.push(
      new AttachmentBuilder(Buffer.from(toCsv(report), "utf8"), {
        name: `nexus-report-${Date.now()}.csv`,
      })
    );
  }

  return { embeds: [embed], files, components: [] };
}

module.exports = { buildReport, buildReportMessage };
