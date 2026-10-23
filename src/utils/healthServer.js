"use strict";

const http = require("node:http");
const logger = require("./logger");

function startHealthServer() {
  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) return null;

  const server = http.createServer((request, response) => {
    if (request.url === "/health" || request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("Nexus operational");
      return;
    }
    response.writeHead(404);
    response.end();
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(`Health endpoint listening on 0.0.0.0:${port}`);
  });

  return server;
}

module.exports = { startHealthServer };
