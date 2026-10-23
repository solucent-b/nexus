"use strict";

function stamp() {
  return new Date().toISOString();
}

function info(message, extra) {
  if (extra !== undefined) {
    console.log(`[${stamp()}] [NEXUS] ${message}`, extra);
    return;
  }
  console.log(`[${stamp()}] [NEXUS] ${message}`);
}

function warn(message, extra) {
  if (extra !== undefined) {
    console.warn(`[${stamp()}] [NEXUS][WARN] ${message}`, extra);
    return;
  }
  console.warn(`[${stamp()}] [NEXUS][WARN] ${message}`);
}

function error(message, extra) {
  if (extra !== undefined) {
    console.error(`[${stamp()}] [NEXUS][ERROR] ${message}`, extra);
    return;
  }
  console.error(`[${stamp()}] [NEXUS][ERROR] ${message}`);
}

module.exports = { info, warn, error };
