import {batchHacking, batchHackingFreeThreadCount} from './batch-hacking'
import { buyServer, growThreadMaths, remoteExec, rootServers, ThreadCounts, weakenThreadMaths, getServersCanRun } from 'main-loop-support'
import { NS, Player, Server } from './bitburner'
import { getProcesses, getServers } from './utils/get-servers'

const GROW_WEAKEN_THREAD_RESERVATION_PERCENT = 0.3

const hackGrowWeaken = async (ns: NS, servers: Server[], player: Player) => {
    const hackLvl = player.hacking
    const homeServer = servers.find((x) => x.hostname == 'home')!

    // Can run scripts
    const ramCost = Math.max(ns.getScriptRam('hack.js'), ns.getScriptRam('grow.js'), ns.getScriptRam('weaken.js'))
    const serversCanRun = getServersCanRun(servers, ramCost)

    const processes = getProcesses(ns)

    // Only work on servers that we have admin rights and have money
    // const serversToWorkOn = servers.filter((x) => x.hasAdminRights && x.moneyMax)
    const serversToWorkOn = servers.filter((x) => x.hasAdminRights && x.moneyMax)
        .filter(x => ['n00dles', 'foodnstuff'].some(y => y == x.hostname))
    // Only weaken and grow servers that aren't being worked on and require weakening or growing
    const serversToWeakenAndGrow = serversToWorkOn.filter(
        (x) => !processes.some((y) => y.args.some((z) => z == x.hostname))
        && (ns.getServerSecurityLevel(x.hostname) != x.minDifficulty || ns.getServerMoneyAvailable(x.hostname) != x.moneyMax)
    ).sort((x, y) => x.moneyMax - y.moneyMax)

    let freeThreads = batchHackingFreeThreadCount(serversCanRun) * GROW_WEAKEN_THREAD_RESERVATION_PERCENT
    for (const serverToWeakenOrGrow of serversToWeakenAndGrow) {
        // Update the max threads and decrease the serverToHackCount
        if (freeThreads <= 0) continue

        // Need to weaken?
        const minDifficulty = serverToWeakenOrGrow.minDifficulty
        const currDifficulty = ns.getServerSecurityLevel(serverToWeakenOrGrow.hostname)
        if (currDifficulty != minDifficulty) {
            const threadMaths = weakenThreadMaths(ns, homeServer, currDifficulty - minDifficulty, freeThreads)
            remoteExec(ns, serversCanRun, 'weaken.js', threadMaths.weaken, serverToWeakenOrGrow.hostname, 1)
            freeThreads -= threadMaths.weaken
            continue
        }

        // Need to grow?
        const maxMoney = serverToWeakenOrGrow.moneyMax
        const currMoney = ns.getServerMoneyAvailable(serverToWeakenOrGrow.hostname)
        if (currMoney != maxMoney) {
            const threadMaths = growThreadMaths(ns, homeServer, serverToWeakenOrGrow, maxMoney, currMoney, freeThreads)
            remoteExec(ns, serversCanRun, 'grow.js', threadMaths.grow, serverToWeakenOrGrow.hostname, 1)
            remoteExec(ns, serversCanRun, 'weaken.js', threadMaths.weaken, serverToWeakenOrGrow.hostname, 1)
            freeThreads -= threadMaths.weaken + threadMaths.grow
        }
    }

    // Only hack servers that we have the required hackLevel for and don't require weakening or growing
    const serversToHack = serversToWorkOn.filter(
        (x) => hackLvl >= x.requiredHackingSkill
        && ns.getServerSecurityLevel(x.hostname) == x.minDifficulty
        && ns.getServerMoneyAvailable(x.hostname) == x.moneyMax
    ).sort((x, y) => y.moneyMax - x.moneyMax)
    batchHacking(ns, serversToHack, serversCanRun, homeServer)
}

const mainLoopWork = async (ns: NS) => {
    // Set
    const player = ns.getPlayer()
    const servers = getServers(ns)

    // Root servers and update them with the hacking script
    await rootServers(ns, servers)

    // Hack / Grow / Weaken
    await hackGrowWeaken(ns, servers, player)

    // Buy new servers
    await buyServer(ns, servers)
}

export async function main(ns: NS) {
    while (true) {
        try {
            await mainLoopWork(ns)
        } catch (ex) {
            ns.tprint(`Error in main loop - ${ex}`)
        }

        await ns.sleep(500)
    }
}
