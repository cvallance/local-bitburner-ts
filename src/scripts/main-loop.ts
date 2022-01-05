import { NS, Server } from './bitburner'
import { getProcesses, getServers } from './utils/get-servers'
import { purchaseServer } from './utils/purchase-server'
import { rootServer } from './utils/root-server'

const purchaseServerRam = 16384
const homeRamReservation = 32

const rootServers = async (ns: NS, servers: Server[]) => {
    for (const serverInfo of servers) {
        const hostname = serverInfo.hostname
        await rootServer(ns, hostname)
    }
}

interface FreeServer {
    hostname: string
    freeThreads: number
}

interface ThreadCounts {
    weaken: number
    grow: number
    hack: number
}

const remoteExec = (ns: NS, freeServers: FreeServer[], script: string, threads: number, serverToRunAgainst: string, runCount: number) => {
    if (threads <= 0) return

    let threadsLeft = threads
    for (const freeServer of freeServers) {
        if (!freeServer.freeThreads) continue

        const threadsToUse = Math.min(freeServer.freeThreads, threadsLeft)
        ns.exec(script, freeServer.hostname, threadsToUse, serverToRunAgainst, '' + runCount)
        freeServer.freeThreads -= threadsToUse
        threadsLeft -= threadsToUse
        if (!threadsLeft) return
    }
}

const weakenThreadMaths = (ns: NS, homeServer: Server, amountToWeaken: number, maxThreads: number): ThreadCounts => {
    // const weakenAmount = ns.weakenAnalyze(1, homeServer.cpuCores)
    const weakenAmount = 0.05
    let weakenThreads = Math.ceil(amountToWeaken / weakenAmount)
    return {
        weaken: weakenThreads,
        grow: 0,
        hack: 0,
    }
}

const growThreadMaths = (
    ns: NS,
    homeServer: Server,
    serverToHack: Server,
    maxMoney: number,
    currMoney: number,
    maxThreads: number
): ThreadCounts => {
    if (maxThreads < 13) return { weaken: 0, grow: maxThreads, hack: 0 }

    const mathsOffMaxThreads = () => {
        const growThreads = Math.floor((maxThreads / 13) * 12)
        const weakenThreads = maxThreads - growThreads
        return {
            weaken: weakenThreads,
            grow: growThreads,
            hack: 0,
        }
    }

    if (currMoney == 0) return mathsOffMaxThreads()

    const desiredGrowMulti = maxMoney / currMoney
    // const wantedGrow = Math.ceil(ns.growthAnalyze(serverToHack.hostname, desiredGrowMulti, homeServer.cpuCores)) || 1
    const wantedGrow = Math.ceil(ns.growthAnalyze(serverToHack.hostname, desiredGrowMulti + 0.1, 1))
    // const wantedGrow = 50000
    // For every 12 grows we need 1 weaken
    const wantedWeaken = Math.ceil(wantedGrow / 12)

    if (wantedGrow + wantedWeaken > maxThreads) return mathsOffMaxThreads()

    return { weaken: wantedWeaken, grow: wantedGrow, hack: 0 }
}

const hackThreadMaths = (ns: NS, homeServer: Server, serverToHack: Server, maxThreads: number): ThreadCounts => {
    if (maxThreads < 22) return { weaken: 0, grow: 0, hack: maxThreads }

    const hackPercent = ns.hackAnalyze(serverToHack.hostname)
    // const hackPercent = 0.01
    const wantedHackThreads = Math.ceil(0.2 / hackPercent)
    const totalHacks = wantedHackThreads * 3
    // const wantedGrowThreads = ns.growthAnalyze(serverToHack.hostname, 1, homeServer.cpuCores)
    const wantedGrowThreads = ns.growthAnalyze(serverToHack.hostname, 2.1, 1)
    // const wantedGrowThreads = 50000

    const secUp = totalHacks * 0.002 + wantedGrowThreads * 0.004
    const wantedWeakenThreads = weakenThreadMaths(ns, homeServer, secUp, maxThreads).weaken
    if (wantedHackThreads + wantedGrowThreads + wantedWeakenThreads <= maxThreads) {
        return {
            weaken: wantedWeakenThreads,
            grow: wantedGrowThreads,
            hack: wantedHackThreads,
        }
    }

    // Just have to do maths based off maxThreads
    // TODO: Figure out the ratio of hacks to growths
    // for every 25 total hacks we need 1 weaken ... if we run hack 3 times we should have 8 threads to 1 weaken
    // for every 12 growths we need 1 weaken
    const ratio = Math.floor(maxThreads / 22)
    return {
        weaken: ratio * 2,
        grow: ratio * 12,
        hack: ratio * 8,
    }
}

const hackGrowWeaken = async (ns: NS, servers: Server[]) => {
    const hackLvl = ns.getPlayer().hacking
    const allServers = getServers(ns)
    const homeServer = allServers.find((x) => x.hostname == 'home')!

    // Can run scripts
    const serversCanRun = allServers.filter((s) => s.hasAdminRights && s.maxRam)
    const ramCost = Math.max(ns.getScriptRam('hack.js'), ns.getScriptRam('grow.js'), ns.getScriptRam('weaken.js'))
    const freeServers: FreeServer[] = serversCanRun.map((s) => {
        var freeRam = s.maxRam - s.ramUsed
        if (s.hostname == 'home') freeRam -= homeRamReservation
        return {
            hostname: s.hostname,
            freeThreads: Math.floor(freeRam / ramCost),
        }
    }, [])
    const freeThreadCount = () => {
        return freeServers.reduce((p, r) => p + r.freeThreads, 0)
    }

    var processes = getProcesses(ns)

    // Only work on servers that aren't being worked on currently
    const serversToWorkOn = allServers.filter((x) => !processes.some((y) => y.args.some((z) => z == x.hostname)))
    // Can weaken and grow
    const serversToWeakenAndGrow = serversToWorkOn.filter((x) => x.hasAdminRights && x.moneyMax)
    // Can also hack
    const serversToHack = serversToWeakenAndGrow.filter((x) => hackLvl >= x.requiredHackingSkill).sort((x, y) => y.moneyMax - x.moneyMax)

    let serverToHackCount = Math.min(Math.ceil(freeThreadCount() / 500), serversToHack.length)
    for (const serverToHack of serversToHack) {
        // Update the max threads and decrease the serverToHackCount
        const maxThreads = Math.floor(freeThreadCount() / serverToHackCount)
        if (serverToHackCount > 1) serverToHackCount -= 1

        // Need to weaken?
        var minDifficulty = serverToHack.minDifficulty
        var currDifficulty = ns.getServerSecurityLevel(serverToHack.hostname)
        if (currDifficulty != minDifficulty) {
            const threadMaths = weakenThreadMaths(ns, homeServer, currDifficulty - minDifficulty, maxThreads)
            remoteExec(ns, freeServers, 'weaken.js', threadMaths.weaken, serverToHack.hostname, 1)
            continue
        }

        // Need to grow?
        var maxMoney = serverToHack.moneyMax
        var currMoney = ns.getServerMoneyAvailable(serverToHack.hostname)
        if (currMoney != maxMoney) {
            const threadMaths = growThreadMaths(ns, homeServer, serverToHack, maxMoney, currMoney, maxThreads)
            remoteExec(ns, freeServers, 'grow.js', threadMaths.grow, serverToHack.hostname, 1)
            remoteExec(ns, freeServers, 'weaken.js', threadMaths.weaken, serverToHack.hostname, 1)
            continue
        }

        // Should hack
        const threadMaths = hackThreadMaths(ns, homeServer, serverToHack, maxThreads)
        remoteExec(ns, freeServers, 'hack.js', threadMaths.hack, serverToHack.hostname, 3)
        remoteExec(ns, freeServers, 'grow.js', threadMaths.grow, serverToHack.hostname, 1)
        remoteExec(ns, freeServers, 'weaken.js', threadMaths.weaken, serverToHack.hostname, 1)
    }
}

const buyServer = async (ns: NS, servers: Server[]) => {
    const purchaseLimit = ns.getPurchasedServerLimit()
    const purchasedServers = servers.filter((x) => x.purchasedByPlayer && x.hostname != 'home')

    // Buy new servers while we have enough money AND we haven't reached the limit
    if (ns.getServerMoneyAvailable('home') > ns.getPurchasedServerCost(purchaseServerRam)) {
        if (purchasedServers.length == purchaseLimit) {
            const wrongRamServers = purchasedServers.filter((x) => x.maxRam != purchaseServerRam)
            // Don't try and buy or kill if all the servers are the right size
            if (wrongRamServers.length == 0) return

            const serverToKill = wrongRamServers[0].hostname
            ns.tprint(`Killing server ${serverToKill} to make room for another one`)
            ns.killall(serverToKill)
            ns.deleteServer(serverToKill)
        }
        // Purchase the server
        await purchaseServer(ns, purchaseServerRam)
    }
}

const mainLoopWork = async (ns: NS) => {
    var servers = getServers(ns)

    // Root servers and update them with the hacking script
    await rootServers(ns, servers)

    // Hack / Grow / Weaken
    await hackGrowWeaken(ns, servers)

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
