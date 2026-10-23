"use strict";

const crypto = require("node:crypto");
const { SELECT_TTL_MS, CONFIRM_TTL_MS, OPERATION_LOCK_KEY } = require("../utils/constants");
const database = require("../storage/database");

const operations = new Map();
let activeLock = null;

function createId() {
  return crypto.randomBytes(4).toString("hex");
}

function isLocked() {
  return Boolean(activeLock);
}

function acquireLock(operationId) {
  if (activeLock) return false;
  activeLock = { key: OPERATION_LOCK_KEY, operationId, at: Date.now() };
  return true;
}

function releaseLock(operationId) {
  if (activeLock && activeLock.operationId === operationId) {
    activeLock = null;
  }
}

function rebindLock(fromId, toId) {
  if (activeLock && activeLock.operationId === fromId) {
    activeLock.operationId = toId;
    return true;
  }
  return false;
}

function createOperation(userId, classification, targetName) {
  const id = createId();
  const operation = {
    id,
    userId,
    status: "selecting",
    startedAt: Date.now(),
    targetName,
    examined: classification.examined,
    eligible: classification.eligible,
    excluded: classification.excluded,
    exclusionCounts: classification.exclusionCounts,
    selected: new Set(),
    page: 0,
    totalPages: Math.max(1, Math.ceil(classification.eligible.length / 25)),
    previewMessageId: null,
    confirmExpiresAt: null,
    lastProgressEdit: 0,
  };

  operations.set(id, operation);
  database.saveOperation(operation);
  return operation;
}

function get(id) {
  return operations.get(id) || null;
}

function getActiveForUser(userId) {
  for (const operation of operations.values()) {
    if (operation.userId === userId && ["selecting", "confirming", "running"].includes(operation.status)) {
      return operation;
    }
  }
  return null;
}

function setStatus(operation, status) {
  operation.status = status;
  if (status === "confirming") {
    operation.confirmExpiresAt = Date.now() + CONFIRM_TTL_MS;
  }
  database.saveOperation(operation);
}

function expireStale() {
  const now = Date.now();
  for (const operation of operations.values()) {
    if (operation.status === "selecting" && now - operation.startedAt > SELECT_TTL_MS) {
      operation.status = "expired";
      database.saveOperation(operation);
      releaseLock(operation.id);
    }
    if (operation.status === "confirming" && operation.confirmExpiresAt && now > operation.confirmExpiresAt) {
      operation.status = "expired";
      database.saveOperation(operation);
      releaseLock(operation.id);
    }
  }
}

function clearAllInMemory() {
  operations.clear();
  activeLock = null;
}

module.exports = {
  isLocked,
  acquireLock,
  rebindLock,
  releaseLock,
  createOperation,
  get,
  getActiveForUser,
  setStatus,
  expireStale,
  clearAllInMemory,
};
