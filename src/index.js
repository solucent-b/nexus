"use strict";

const {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  Partials,
} = require("discord.js");
const { loadConfig } = require("./config/config");
const database = require("./storage/database");
const logger = require("./utils/logger");
const panelCommand = require("./commands/panel");
const panelService = require("./services/panelService");
const targetGuild = require("./services/targetGuild");
const operationManager = require("./services/operationManager");
const interactionRouter = require("./services/interactionRouter");
const { startHealthServer } = require("./utils/healthServer");
const { canOperate, denyEphemeral } = require("./security/authorization");

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`[NEXUS] Configuration error: ${error.message}`);
  process.exit(1);
}

database.open(config.databasePath);
database.markIncompleteOperationsInterrupted();
operationManager.clearAllInMemory();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel],
  rest: {
    timeout: 30_000,
  },
});

client.commands = new Collection();
client.commands.set(panelCommand.data.name, panelCommand);

const context = { client, config };
const healthServer = startHealthServer();

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Nexus online as ${readyClient.user.tag}`);
  readyClient.user.setPresence({
    activities: [{ name: "One Panel. Total Control." }],
    status: "online",
  });

  try {
    await registerCommands(readyClient);
  } catch (error) {
    logger.error("Slash command registration failed", error);
  }

  targetGuild.syncFromGuilds(readyClient, config);
  await panelService.refreshPanel(context);
});

client.on(Events.GuildCreate, async (guild) => {
  const bound = targetGuild.onGuildJoin(client, config, guild);
  if (bound) {
    logger.info(`Joined ${guild.name} (${guild.id}) and set it as the target server`);
    await panelService.refreshPanel(context);
  }
});

client.on(Events.GuildDelete, async (guild) => {
  const changed = targetGuild.onGuildLeave(client, config, guild.id);
  if (changed) await panelService.refreshPanel(context);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      const auth = canOperate(interaction, config);
      if (!auth.ok) {
        await denyEphemeral(interaction, auth.reason);
        return;
      }

      await command.execute(interaction, context);
      return;
    }

    if (interaction.isButton()) {
      await interactionRouter.handleButton(interaction, context);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await interactionRouter.handleSelect(interaction, context);
    }
  } catch (error) {
    logger.error("Interaction handling failed", error);
    const payload = {
      content: "Nexus could not complete that interaction. The error was logged privately.",
      ephemeral: true,
    };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch {
      // interaction already expired
    }
  }
});

client.on(Events.ShardError, (error) => {
  logger.error("WebSocket error", error);
});

client.on(Events.Error, (error) => {
  logger.error("Client error", error);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});

async function registerCommands(readyClient) {
  const rest = new REST({ version: "10" }).setToken(config.token);
  const body = [panelCommand.data.toJSON()];
  await rest.put(Routes.applicationGuildCommands(readyClient.user.id, config.controlGuildId), { body });
  logger.info("Registered /panel on the control server only");
}

async function shutdown(signal) {
  logger.info(`Shutting down (${signal})`);
  operationManager.clearAllInMemory();
  try {
    client.destroy();
  } catch {
    // ignore
  }
  if (healthServer) {
    await new Promise((resolve) => healthServer.close(resolve));
  }
  database.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

client.login(config.token).catch((error) => {
  logger.error("Login failed", error);
  process.exit(1);
});
