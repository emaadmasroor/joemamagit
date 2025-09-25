// ---------------------
// DEPENDENCIES
// ---------------------
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder')
const mcDataLoader = require('minecraft-data')
const config = require('./settings.json')

// ---------------------
// BOT CREATION
// ---------------------
let bot
let leaveTimeout = null

function createBot() {
  bot = mineflayer.createBot({
    username: config['bot-account'].username,
    password: config['bot-account'].password,
    auth: config['bot-account'].type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    console.log('[Bot] Spawned on server')

    const mcData = mcDataLoader(bot.version)
    const defaultMove = new Movements(bot, mcData)
    defaultMove.canDig = true // allow breaking blocks like leaves
    bot.pathfinder.setMovements(defaultMove)

    // Auto login/register (if server needs)
    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password
      bot.chat(`/login ${password}`)
      console.log('[Auth] Sent /login')
    }

    // Start farming
    chopTree()
  })

  // --- Human detection ---
  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return
    console.log(`[Bot] Human joined: ${player.username}`)

    if (!leaveTimeout) {
      leaveTimeout = setTimeout(() => {
        console.log('[Bot] Leaving world because humans are online')
        bot.quit('Humans online, AFK bot leaving.')
      }, 30000) // leave after 30 sec
    }
  })

  bot.on('playerLeft', () => {
    const humans = Object.values(bot.players).filter(
      p => p.username !== bot.username && p.ping !== undefined
    )

    if (humans.length === 0) {
      console.log('[Bot] No humans online. Rejoining...')
      if (leaveTimeout) {
        clearTimeout(leaveTimeout)
        leaveTimeout = null
      }
      setTimeout(createBot, 2000)
    }
  })

  // Auto-reconnect on disconnect
  bot.on('end', () => {
    console.log('[Bot] Disconnected, retrying...')
    setTimeout(createBot, config.utils['auto-recconect-delay'] || 5000)
  })

  bot.on('kicked', reason => console.log(`[Bot] Kicked: ${reason}`))
  bot.on('error', err => console.log(`[Bot Error] ${err.message}`))
}

// ---------------------
// INVENTORY CHECK
// ---------------------
function isInventoryFull() {
  return bot.inventory.emptySlotCount() === 0
}

// ---------------------
// CHEST DEPOSIT LOGIC
// ---------------------
async function depositWood() {
  try {
    const chestPos = config.chest // { "x": 100, "y": 64, "z": 200 }
    await bot.pathfinder.goto(new GoalBlock(chestPos.x, chestPos.y, chestPos.z))

    const chestBlock = bot.blockAt(chestPos)
    const chest = await bot.openChest(chestBlock)

    for (const item of bot.inventory.items()) {
      if (item.name.includes('log')) {
        await chest.deposit(item.type, null, item.count)
        console.log(`[Bot] Deposited ${item.count}x ${item.name}`)
      }
    }

    chest.close()
  } catch (err) {
    console.log('[Deposit Error]', err)
  }
}

// ---------------------
// TREE CHOPPING LOGIC
// ---------------------
async function chopTree() {
  try {
    const tree = bot.findBlock({
      matching: block => block.name.includes('log'),
      maxDistance: 32
    })

    if (!tree) {
      console.log('[Bot] No trees nearby, waiting...')
      setTimeout(chopTree, 5000)
      return
    }

    // walk to tree
    await bot.pathfinder.goto(new GoalBlock(tree.position.x, tree.position.y, tree.position.z))

    // chop connected logs upward
    let current = tree
    while (current) {
      try {
        await bot.dig(bot.blockAt(current.position))
      } catch (err) {
        console.log('[Dig Error]', err)
        break
      }

      // look for another log nearby (part of same tree)
      current = bot.findBlock({
        matching: block => block.name.includes('log'),
        maxDistance: 3
      })
    }

    // check inventory
    if (isInventoryFull()) {
      await depositWood()
    }

    console.log('[Bot] Tree chopped, searching for next...')
    setTimeout(chopTree, 2000)

  } catch (err) {
    console.log('[Chop Error]', err)
    setTimeout(chopTree, 5000)
  }
}

// ---------------------
// START BOT
// ---------------------
createBot()
