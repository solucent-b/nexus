"use strict";

const { AttachmentBuilder } = require("discord.js");

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1);
  return `${minutes}m ${remainder}s`;
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

function csv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
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

function buildReportMessage(report) {
  const needsFile =
    report.successful.length > 15 ||
    report.failed.length > 0 ||
    report.bansAttempted > 20;

  const files = [];
  if (needsFile) {
    files.push(
      new AttachmentBuilder(Buffer.from(toCsv(report), "utf8"), {
        name: `nexus-report-${Date.now()}.csv`,
      })
    );
  }

  return { files };
}

module.exports = { buildReport, buildReportMessage };
