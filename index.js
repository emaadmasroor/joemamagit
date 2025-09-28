// ---------------------
// EXPRESS SERVER (Replit compatible)
// ---------------------
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('AFK Bot is alive!'));
app.listen(port, '0.0.0.0', () => console.log(`[Server] Listening on port ${port}`));

// ---------------------
// BOT CORE
// ---------------------
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const settings = require('./settings.json');

let bot;
let leaveTimeout = null;

function createBot() {
  bot = mineflayer.createBot({
    username: settings["bot-account"].username,
    password: settings["bot-account"].password,
    auth: settings["bot-account"].type,
    host: settings.server.ip,
    port: settings.server.port,
    version: settings.server.version
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.pathfinder.setMovements(defaultMove);

  // ---------------------
  // SPAWN EVENT
  // ---------------------
  bot.once('spawn', () => {
    console.log('[Bot] Spawned');

    if (settings.utils["auto-auth"].enabled) {
      bot.chat(`/login ${settings.utils["auto-auth"].password}`);
    }

    setInterval(treeLoop, 15000); // check for trees every 15s
  });

  // ---------------------
  // TREE LOOP (logs only)
  // ---------------------
  async function treeLoop() {
    if (!settings["wood-collector"].enabled) return;
    const center = settings.field.center;
    const half = settings.field.size / 2;

    const logs = bot.findBlocks({
      matching: block => block.name.includes('log'),
      maxDistance: settings["wood-collector"]["check-radius"],
      count: 10
    });

    for (let pos of logs) {
      if (
        pos.x >= center.x - half && pos.x <= center.x + half &&
        pos.z >= center.z - half && pos.z <= center.z + half
      ) {
        try {
          await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1));
          const block = bot.blockAt(pos);
          if (block && block.name.includes('log')) {
            await bot.dig(block);
            console.log(`🌲 Broke log at ${pos}`);

            // Replant sapling if enabled
            if (settings["wood-collector"]["replant-saplings"]) {
              const sapling = bot.inventory.items().find(i => i.name.includes('sapling'));
              if (sapling) {
                const dirt = bot.blockAt(pos.offset(0, -1, 0));
                if (dirt && dirt.name.includes('dirt')) {
                  await bot.equip(sapling, 'hand');
                  await bot.placeBlock(dirt, { x: 0, y: 1, z: 0 });
                  console.log(`🌱 Replanted sapling at ${pos}`);
                }
              }
            }
          }
        } catch (e) {
          console.log("❌ Tree loop error:", e.message);
        }
      }
    }

    // Inventory check → deposit in chest
    if (settings["wood-collector"].chest.enabled && bot.inventory.items().length > 20) {
      const chestPos = settings["wood-collector"].chest;
      try {
        await bot.pathfinder.goto(new GoalNear(chestPos.x, chestPos.y, chestPos.z, 1));
        const chestBlock = bot.blockAt(chestPos);
        if (chestBlock && chestBlock.name.includes("chest")) {
          const chest = await bot.openChest(chestBlock);
          for (const item of bot.inventory.items()) {
            await chest.deposit(item.type, null, item.count);
            console.log(`📦 Deposited ${item.name} x${item.count}`);
          }
          chest.close();
        }
      } catch (err) {
        console.log("❌ Chest error:", err.message);
      }
    }
  }

  // ---------------------
  // SLEEPING
  // ---------------------
  bot.on('time', async () => {
    if (!settings.sleeping.enabled) return;
    if (bot.time.isNight) {
      const bedPos = settings.sleeping;
      const bed = bot.blockAt(bedPos);
      if (bed && bed.name.includes('bed')) {
        try {
          await bot.pathfinder.goto(new GoalNear(bedPos.x, bedPos.y, bedPos.z, 1));
          await bot.sleep(bed);
          console.log('😴 Sleeping...');
        } catch (err) {
          console.log('❌ Sleep error:', err.message);
        }
      }
    }
  });

  // ---------------------
  // HUMAN DETECTION
  // ---------------------
  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return;
    console.log(`[Bot] Human joined: ${player.username}`);
    if (settings["human-detection"].enabled && !leaveTimeout) {
      leaveTimeout = setTimeout(() => {
        console.log('[Bot] Leaving because a human is online');
        bot.quit('Human detected');
      }, settings["human-detection"]["leave-delay"]);
    }
  });

  bot.on('playerLeft', () => {
    const humans = Object.values(bot.players).filter(p => p.username !== bot.username);
    if (humans.length === 0) {
      console.log('[Bot] Server empty, reconnecting...');
      setTimeout(createBot, 2000);
    }
  });

  // ---------------------
  // AUTO-RECONNECT
  // ---------------------
  bot.on('end', () => {
    console.log('[Bot] Disconnected. Reconnecting...');
    setTimeout(createBot, settings.utils["auto-recconect-delay"]);
  });

  bot.on('kicked', reason => console.log(`[Bot] Kicked: ${reason}`));
  bot.on('error', err => console.log(`[Bot Error] ${err.message}`));
}

createBot();
