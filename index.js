// ---------------------
// EXPRESS SERVER (Replit compatible)
// ---------------------
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('AFK Bot is alive!'));
app.listen(port, '0.0.0.0', () => console.log(`[Server] Listening on port ${port}`));

// ---------------------
// MINECRAFT AFK BOT
// ---------------------
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const config = require('./settings.json');

let bot;
let leaveTimeout = null;

// Start bot
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
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);

  bot.once('spawn', () => {
    console.log('[Bot] Spawned on server');

    // Auto login/register
    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      bot.chat(`/login ${password}`);
      console.log('[Auth] Sent /login');
    }

    // Random anti-AFK movement every 10s
    setInterval(() => {
      const action = Math.floor(Math.random() * 3);
      if (action === 0) {
        // Spin
        bot.look(bot.entity.yaw + Math.PI / 2, 0, true);
      } else if (action === 1) {
        // Jump
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      } else if (action === 2) {
        // Small forward/backward movement (square)
        bot.setControlState('forward', true);
        setTimeout(() => bot.setControlState('forward', false), 1000);
      }
    }, 10000);
  });

  // Human detection: leave/join logic
  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return;
    console.log(`[Bot] Human joined: ${player.username}`);
    if (!leaveTimeout) {
      leaveTimeout = setTimeout(() => {
        console.log('[Bot] Leaving world because humans are online');
        bot.quit('Humans online, AFK bot leaving.');
      }, 60000); // leave after 1 minute
    }
  });

  bot.on('playerLeft', () => {
    const humans = Object.values(bot.players).filter(
      p => p.username !== bot.username && p.ping !== undefined
    );
    if (humans.length === 0) {
      console.log('[Bot] No humans online. Rejoining...');
      if (leaveTimeout) {
        clearTimeout(leaveTimeout);
        leaveTimeout = null;
      }
      setTimeout(createBot, 2000);
    }
  });

  // Auto-reconnect on disconnect
  bot.on('end', () => {
    console.log('[Bot] Disconnected. Attempting reconnect...');
    setTimeout(createBot, config.utils['auto-recconect-delay'] || 5000);
  });

  bot.on('kicked', reason => console.log(`[Bot] Kicked: ${reason}`));
  bot.on('error', err => console.log(`[Bot Error] ${err.message}`));
}

createBot();
