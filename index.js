// ---------------------
// EXPRESS SERVER (Render keep-alive)
// ---------------------
const express = require('express')
const app = express()
const port = process.env.PORT || 3000

app.get('/', (req, res) => res.send('Bot running'))
app.listen(port, '0.0.0.0', () => console.log("Web server started"))


// ---------------------
// BOT CORE
// ---------------------
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder')
const settings = require('./settings.json')

let bot

function createBot() {

  console.log("Creating bot...")

  bot = mineflayer.createBot({
    host: settings.server.ip,
    port: settings.server.port,
    username: settings["bot-account"].username,
    version: settings.server.version,
    auth: "offline" // IMPORTANT for Aternos
  })

  bot.loadPlugin(pathfinder)


  // ---------------------
  // CONNECTION LOGGING
  // ---------------------

  bot.on('login', () => {
    console.log("Bot logged into server")
  })

  bot.on('spawn', async () => {
    console.log("Bot spawned in world")

    // login command for auth plugins
    setTimeout(() => {
      bot.chat("/login serverbot serverbot")
      console.log("Login command sent")
    }, 6000)

    const mcData = require('minecraft-data')(bot.version)
    const movements = new Movements(bot, mcData)
    bot.pathfinder.setMovements(movements)

    setInterval(treeLoop, 10000)
  })


  // ---------------------
  // TREE LOOP
  // ---------------------

  async function treeLoop() {

    try {

      if (bot.inventory.emptySlotCount() === 0) {
        await depositWood()
        return
      }

      const logs = bot.findBlocks({
        matching: block => block.name.includes("log"),
        maxDistance: 32,
        count: 5
      })

      for (const pos of logs) {

        try {

          await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1))

          const block = bot.blockAt(pos)
          if (!block || !block.name.includes("log")) continue

          await bot.dig(block)

          console.log("Broke", block.name)

          const sapling = bot.inventory.items().find(i => i.name.includes("sapling"))
          const dirt = bot.blockAt(pos.offset(0, -1, 0))

          if (sapling && dirt && dirt.name.includes("dirt")) {
            await bot.equip(sapling, "hand")
            await bot.placeBlock(dirt, { x: 0, y: 1, z: 0 })
            console.log("Replanted sapling")
          }

        } catch (err) {
          console.log("Tree error:", err.message)
        }

      }

    } catch (err) {
      console.log("Loop error:", err.message)
    }

  }


  // ---------------------
  // CHEST DEPOSIT
  // ---------------------

  async function depositWood() {

    const chestPos = settings["wood-collector"].chest

    try {

      await bot.pathfinder.goto(new GoalNear(chestPos.x, chestPos.y, chestPos.z, 1))

      const chestBlock = bot.blockAt(chestPos)
      const chest = await bot.openChest(chestBlock)

      const woodItems = bot.inventory.items().filter(i =>
        i.name.includes("log") || i.name.includes("planks")
      )

      for (const item of woodItems) {
        await chest.deposit(item.type, null, item.count)
        console.log("Deposited", item.name, item.count)
      }

      chest.close()

    } catch (err) {
      console.log("Chest error:", err.message)
    }

  }


  // ---------------------
  // RECONNECT LOGIC
  // ---------------------

  bot.on("end", () => {
    console.log("Bot disconnected. Reconnecting in 10s...")
    setTimeout(createBot, 10000)
  })

  bot.on("kicked", reason => {
    console.log("Bot kicked:", reason)
  })

  bot.on("error", err => {
    console.log("Bot error:", err)
  })

}

createBot()
