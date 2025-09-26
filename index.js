const mineflayer = require('mineflayer')
const Vec3 = require('vec3')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalNear } = goals
const autoeat = require('mineflayer-auto-eat').plugin

const settings = require('./settings.json')

let bot

function startBot() {
  bot = mineflayer.createBot({
    host: settings.server.ip,
    port: settings.server.port,
    username: settings["bot-account"].username,
    password: settings["bot-account"].password || undefined,
    version: settings.server.version
  })

  bot.loadPlugin(pathfinder)
  bot.loadPlugin(autoeat)

  bot.on('chat', (username, message) => {
    if (settings.utils["chat-log"]) console.log(`[CHAT] <${username}> ${message}`)
  })

  bot.on('spawn', () => {
    console.log("✅ Bot spawned in world")
    const mcData = require('minecraft-data')(bot.version)
    const defaultMove = new Movements(bot, mcData)
    bot.pathfinder.setMovements(defaultMove)

    if (settings.wood-collector.enabled) {
      setInterval(treeLoop, 10000)
    }

    nightLoop()
  })

  bot.on('end', () => {
    if (settings.utils["auto-reconnect"]) {
      console.log("⏳ Bot disconnected, reconnecting...")
      setTimeout(startBot, settings.utils["auto-recconect-delay"] || 5000)
    }
  })

  if (settings["human-detection"].enabled) {
    bot.on('playerJoined', (player) => {
      if (player.username !== bot.username) {
        console.log("👤 Human joined, leaving soon...")
        setTimeout(() => bot.quit(), settings["human-detection"]["leave-delay"])
      }
    })
  }
}

function nightLoop() {
  setInterval(async () => {
    if (settings.wood-collector.bed.enabled) {
      if (!bot.time.isDay) {
        const bedPos = new Vec3(
          settings.wood-collector.bed.x,
          settings.wood-collector.bed.y,
          settings.wood-collector.bed.z
        )
        const bedBlock = bot.blockAt(bedPos)
        if (bedBlock) {
          try {
            await bot.pathfinder.goto(new GoalNear(bedPos.x, bedPos.y, bedPos.z, 1))
            await bot.sleep(bedBlock)
            console.log("😴 Bot is sleeping...")
          } catch (e) {
            console.log("❌ Sleep failed:", e.message)
          }
        }
      }
    }
  }, 20000)
}

async function treeLoop() {
  const center = settings.field.center
  const half = settings.field.size / 2

  const logs = bot.findBlocks({
    matching: block => settings["wood-collector"]["tree-blocks"].includes(block.name),
    maxDistance: settings.wood-collector["check-radius"] || 10,
    count: 5
  })

  for (let pos of logs) {
    if (
      pos.x >= center.x - half && pos.x <= center.x + half &&
      pos.z >= center.z - half && pos.z <= center.z + half
    ) {
      try {
        await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1))
        const block = bot.blockAt(pos)
        await bot.dig(block)
        console.log(`🌲 Broke log at ${pos}`)

        // Replant sapling if enabled
        if (settings["wood-collector"]["replant-saplings"]) {
          const ground = bot.blockAt(pos.offset(0, -1, 0))
          if (ground && (ground.name.includes("dirt") || ground.name.includes("grass"))) {
            const sapling = bot.inventory.items().find(i => i.name.includes("sapling"))
            if (sapling) {
              try {
                await bot.equip(sapling, 'hand')
                await bot.placeBlock(ground, new Vec3(0, 1, 0))
                console.log(`🌱 Replanted sapling at ${pos}`)
              } catch (e) {
                console.log("⚠️ Sapling planting failed:", e.message)
              }
            }
          }
        }
      } catch (e) {
        console.log("❌ Dig error:", e.message)
      }
    }
  }

  if (bot.inventory.items().length >= 30 && settings.wood-collector.chest.enabled) {
    await depositWood()
  }
}

async function depositWood() {
  const chestPos = new Vec3(
    settings.wood-collector.chest.x,
    settings.wood-collector.chest.y,
    settings.wood-collector.chest.z
  )
  const chestBlock = bot.blockAt(chestPos)
  if (!chestBlock) return

  try {
    await bot.pathfinder.goto(new GoalNear(chestPos.x, chestPos.y, chestPos.z, 1))
    const chest = await bot.openChest(chestBlock)

    for (let item of bot.inventory.items()) {
      if (item.name.includes("log") || item.name.includes("planks") || item.name.includes("sapling")) {
        await chest.deposit(item.type, null, item.count)
        console.log(`📦 Deposited ${item.count} ${item.name}`)
      }
    }

    chest.close()
  } catch (e) {
    console.log("❌ Chest deposit failed:", e.message)
  }
}

startBot()
