import { freeThreadCount, getServersCanRun, growThreadMaths, HomeRamReservation, remoteExec, rootServers, ThreadCounts, weakenThreadMaths } from './main-loop-support'
import { NS, Player, Server } from './bitburner'
import { getProcesses, getServers } from './utils/get-servers'

const hackThreadMaths = (ns: NS, homeServer: Server, serverToHack: Server, maxThreads: number): ThreadCounts => {
    if (maxThreads < 22) return { weaken: 0, grow: 0, hack: maxThreads }

    const hackPercent = ns.hackAnalyze(serverToHack.hostname)
    const wantedHackThreads = Math.ceil(0.2 / hackPercent)
    const totalHacks = wantedHackThreads * 3
    // const wantedGrowThreads = ns.growthAnalyze(serverToHack.hostname, 1, homeServer.cpuCores)
    const wantedGrowThreads = ns.growthAnalyze(serverToHack.hostname, 2.1, 1)

    const secUp = totalHacks * 0.002 + wantedGrowThreads * 0.004
    const wantedWeakenThreads = weakenThreadMaths(ns, homeServer, secUp).weaken
    const totalWantedThreads = wantedHackThreads + wantedGrowThreads + wantedWeakenThreads
    if (totalWantedThreads <= maxThreads) {
        return {
            weaken: wantedWeakenThreads,
            grow: wantedGrowThreads,
            hack: wantedHackThreads,
        }
    }

    // Just have to do maths based off maxThreads and just use the above ratios to figure out numbers
    return {
        weaken: Math.ceil(maxThreads * (totalWantedThreads / wantedWeakenThreads)),
        grow: Math.floor(maxThreads * (totalWantedThreads / wantedGrowThreads)),
        hack: Math.floor(maxThreads * (totalWantedThreads / wantedHackThreads)),
    }
}


const hackGrowWeaken = async (ns: NS, servers: Server[], player: Player) => {
    const hackLvl = player.hacking
    const homeServer = servers.find((x) => x.hostname == 'home')!

    // Can run scripts
    const ramCost = Math.max(ns.getScriptRam('hack.js'), ns.getScriptRam('grow.js'), ns.getScriptRam('weaken.js'))
    const serversCanRun = getServersCanRun(servers, ramCost)
    const processes = getProcesses(ns)

    // Only work on servers that aren't being worked on currently
    const sortedServers = servers.sort((x, y) => x.moneyMax - y.moneyMax)
    // Can weaken and grow
    const serversToWeakenAndGrow = sortedServers.filter((x) => x.hasAdminRights && x.moneyMax)
    // Can also hack
    const serversToHack = serversToWeakenAndGrow.filter((x) => hackLvl >= x.requiredHackingSkill)
    let serverToHackCount = Math.min(Math.ceil(freeThreadCount(serversCanRun) / 500), serversToHack.length)

    for (const serverToHack of serversToHack.slice(0, serverToHackCount)) {
        // Update the max threads and decrease the serverToHackCount
        const maxThreads = Math.floor(freeThreadCount(serversCanRun) / serverToHackCount)
        if (serverToHackCount > 1) serverToHackCount -= 1

        // Don't do anything to this server if we're already working on it
        if (processes.some(x => { x.args.some(y => y == serverToHack.hostname)})) continue

        // Need to weaken?
        const minDifficulty = serverToHack.minDifficulty
        const currDifficulty = ns.getServerSecurityLevel(serverToHack.hostname)
        if (currDifficulty != minDifficulty) {
            const threadMaths = weakenThreadMaths(ns, homeServer, currDifficulty - minDifficulty, maxThreads)
            remoteExec(ns, serversCanRun, 'weaken.js', threadMaths.weaken, serverToHack.hostname, 1)
            continue
        }

        // Need to grow?
        const maxMoney = serverToHack.moneyMax
        const currMoney = ns.getServerMoneyAvailable(serverToHack.hostname)
        if (currMoney != maxMoney) {
            const threadMaths = growThreadMaths(ns, homeServer, serverToHack, maxMoney, currMoney, maxThreads)
            remoteExec(ns, serversCanRun, 'grow.js', threadMaths.grow, serverToHack.hostname, 1)
            remoteExec(ns, serversCanRun, 'weaken.js', threadMaths.weaken, serverToHack.hostname, 1)
            continue
        }

        // Should hack
        const threadMaths = hackThreadMaths(ns, homeServer, serverToHack, maxThreads)
        remoteExec(ns, serversCanRun, 'hack.js', threadMaths.hack, serverToHack.hostname, 3)
        remoteExec(ns, serversCanRun, 'grow.js', threadMaths.grow, serverToHack.hostname, 1)
        remoteExec(ns, serversCanRun, 'weaken.js', threadMaths.weaken, serverToHack.hostname, 1)
    }
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
    // await buyServer(ns, servers)
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
