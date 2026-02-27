// ---------------------
// EXPRESS SERVER (Replit compatible)
// ---------------------
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is alive'));
app.listen(port, '0.0.0.0');

// ---------------------
// BOT CORE
// ---------------------
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const settings = require('./settings.json');

let bot;

function createBot() {
  bot = mineflayer.createBot({
    username: settings["bot-account"].username,
    host: settings.server.ip,
    port: settings.server.port,
    version: settings.server.version
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', async () => {
    console.log('[Bot] Spawned');

    // 🔐 FORCE LOGIN EVERY TIME
    setTimeout(() => {
      bot.chat('/login serverbot serverbot');
      console.log('[Bot] Logged in');
    }, 3000);

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    setInterval(treeLoop, 10000); // run every 10s
  });

  // ---------------------
  // TREE LOOP
  // ---------------------
  async function treeLoop() {
    try {

      // If inventory almost full → deposit wood
      if (bot.inventory.emptySlotCount() === 0) {
        await depositWood();
        return;
      }

      const logs = bot.findBlocks({
        matching: block => block.name.includes('log'),
        maxDistance: 32,
        count: 5
      });

      for (let pos of logs) {
        try {
          await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1));

          const block = bot.blockAt(pos);
          if (!block || !block.name.includes('log')) continue;

          await bot.dig(block);
          console.log(`Broke ${block.name}`);

          // 🌱 Replant
          const sapling = bot.inventory.items().find(i => i.name.includes('sapling'));
          const dirt = bot.blockAt(pos.offset(0, -1, 0));

          if (sapling && dirt && dirt.name.includes('dirt')) {
            await bot.equip(sapling, 'hand');
            await bot.placeBlock(dirt, { x: 0, y: 1, z: 0 });
            console.log('Replanted sapling');
          }

        } catch (err) {
          console.log("Tree error:", err.message);
        }
      }

    } catch (err) {
      console.log("Loop error:", err.message);
    }
  }

  // ---------------------
  // DEPOSIT WOOD ONLY
  // ---------------------
  async function depositWood() {
    const chestPos = settings["wood-collector"].chest;

    try {
      await bot.pathfinder.goto(new GoalNear(chestPos.x, chestPos.y, chestPos.z, 1));

      const chestBlock = bot.blockAt(chestPos);
      const chest = await bot.openChest(chestBlock);

      const woodItems = bot.inventory.items().filter(i =>
        i.name.includes('log') || i.name.includes('planks')
      );

      for (const item of woodItems) {
        await chest.deposit(item.type, null, item.count);
        console.log(`Deposited ${item.name} x${item.count}`);
      }

      chest.close();

    } catch (err) {
      console.log("Chest error:", err.message);
    }
  }

  // ---------------------
  // AUTO RECONNECT ONLY
  // ---------------------
  bot.on('end', () => {
    console.log('[Bot] Disconnected. Reconnecting...');
    setTimeout(createBot, 5000);
  });

  bot.on('kicked', reason => console.log('[Bot] Kicked:', reason));
  bot.on('error', err => console.log('[Bot Error]', err.message));
}

createBot();
