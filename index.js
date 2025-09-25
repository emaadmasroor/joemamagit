// ---------------------
// EXPRESS SERVER (Replit compatible)
// ---------------------
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('AFK Bot is alive!'));
app.listen(port, '0.0.0.0', () => console.log(`[Server] Listening on port ${port}`));

// ---------------------
// MINECRAFT BOT
// ---------------------
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const config = require('./settings.json');

let bot;
let leaveTimeout = null;
let stayOffline = false;

function createBot() {
  bot = mineflayer.createBot({
    username: config['bot-account'].username,
    password: config['bot-account'].password,
    auth: config['bot-account'].type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectBlock);

  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);

  // Spawn logic
  bot.once('spawn', () => {
    console.log('[Bot] Spawned on server');
    bot.pathfinder.setMovements(defaultMove);

    // Start looking for trees every 20s
    setInterval(chopTree, 20000);

    // Night check → sleep if bed nearby
    setInterval(checkNightAndSleep, 10000);
  });

  // Leave when human joins
  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return;
    console.log(`[Bot] Human joined: ${player.username}`);
    if (!leaveTimeout) {
      leaveTimeout = setTimeout(() => {
        stayOffline = true; // don’t reconnect while human online
        bot.quit('Human online, leaving.');
      }, 30000); // leave after 30s
    }
  });

  // Rejoin when humans leave
  bot.on('playerLeft', () => {
    const humans = Object.values(bot.players).filter(
      p => p.username !== bot.username && p.ping !== undefined
    );
    if (humans.length === 0) {
      console.log('[Bot] No humans online. Rejoining...');
      stayOffline = false;
      if (leaveTimeout) {
        clearTimeout(leaveTimeout);
        leaveTimeout = null;
      }
      setTimeout(createBot, 3000);
    }
  });

  // Auto-reconnect
  bot.on('end', () => {
    if (!stayOffline) {
      console.log('[Bot] Disconnected. Reconnecting...');
      setTimeout(createBot, config.utils['auto-recconect-delay'] || 5000);
    } else {
      console.log('[Bot] Offline because human is online.');
    }
  });

  bot.on('kicked', reason => console.log(`[Bot] Kicked: ${reason}`));
  bot.on('error', err => console.log(`[Bot Error] ${err.message}`));

  // === TREE LOGIC ===
  function chopTree() {
    const woodIds = [
      mcData.blocksByName.oak_log.id,
      mcData.blocksByName.birch_log.id,
      mcData.blocksByName.spruce_log.id,
      mcData.blocksByName.jungle_log.id,
      mcData.blocksByName.acacia_log.id,
      mcData.blocksByName.dark_oak_log.id
    ];
    const block = bot.findBlock({
      matching: woodIds,
      maxDistance: 64 // bigger search radius
    });
    if (block) {
      console.log(`[Bot] Found tree at ${block.position}, chopping...`);
      bot.collectBlock.collect(block).catch(err => {
        console.log('[Collect Error]', err);
      });
    } else {
      console.log('[Bot] No tree found nearby.');
    }
  }

  // === SLEEPING LOGIC ===
  function checkNightAndSleep() {
    if (bot.time.timeOfDay > 13000 && bot.time.timeOfDay < 23000) {
      const bed = bot.findBlock({
        matching: block => block.name.includes('bed'),
        maxDistance: 32
      });
      if (bed) {
        bot.sleep(bed).then(() => {
          console.log('[Bot] Sleeping...');
        }).catch(err => {
          console.log('[Sleep Error]', err.message);
        });
      }
    }
  }
}

createBot();
