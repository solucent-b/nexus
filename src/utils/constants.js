"use strict";

const COLORS = {
  electricBlue: 0x00a3ff,
  success: 0x2ecc71,
  warning: 0xf1c40f,
  danger: 0xe74c3c,
  muted: 0x2b2d31,
};

const BRAND = {
  name: "NEXUS",
  tagline: "One Panel. Total Control.",
  footer: "Nexus  •  Private Administration",
};

const CUSTOM_IDS = {
  banAll: "nx:banall",
  close: "nx:close",
  select: (opId) => `nx:${opId}:msel`,
  pagePrev: (opId) => `nx:${opId}:prev`,
  pageNext: (opId) => `nx:${opId}:next`,
  confirmSelection: (opId) => `nx:${opId}:selok`,
  cancel: (opId) => `nx:${opId}:cancel`,
  execute: (opId) => `nx:${opId}:exec`,
  abortConfirm: (opId) => `nx:${opId}:abort`,
};

const PAGE_SIZE = 25;
const CONFIRM_TTL_MS = 5 * 60 * 1000;
const SELECT_TTL_MS = 15 * 60 * 1000;
const PROGRESS_MIN_INTERVAL_MS = 2000;
const BAN_REASON = "Nexus bulk moderation";
const OPERATION_LOCK_KEY = "bulk-ban";

module.exports = {
  COLORS,
  BRAND,
  CUSTOM_IDS,
  PAGE_SIZE,
  CONFIRM_TTL_MS,
  SELECT_TTL_MS,
  PROGRESS_MIN_INTERVAL_MS,
  BAN_REASON,
  OPERATION_LOCK_KEY,
};
