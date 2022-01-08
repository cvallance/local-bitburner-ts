import { NS, Server } from './bitburner'
import { purchaseServer } from './utils/purchase-server'
import { rootServer } from './utils/root-server'

export const PurchaseServerRam = 1048576
export const HomeRamReservation = 32

export const rootServers = async (ns: NS, servers: Server[]) => {
    for (const serverInfo of servers) {
        const hostname = serverInfo.hostname
        await rootServer(ns, hostname)
    }
}

export interface ServerCanRun {
    server: Server,
    hostname: string
    maxThreads: number
    usedThreads: number
    freeThreads: number
}

export const getServersCanRun = (servers: Server[], ramCost: number = 1.75): ServerCanRun[] => {
    return servers
        .filter((s) => s.hasAdminRights && s.maxRam)
        .map((s) => {
            let maxRam = s.maxRam
            if (s.hostname == 'home') maxRam -= HomeRamReservation
            var freeRam = maxRam - s.ramUsed
            const maxThreads = Math.floor(maxRam / ramCost)
            const freeThreads = freeRam > 0 ? Math.floor(freeRam / ramCost) : 0
            const usedThreads = maxThreads - freeThreads
            return {
                server: s,
                hostname: s.hostname,
                maxThreads: maxThreads,
                usedThreads: usedThreads,
                freeThreads: freeThreads,
            }
        }, [])
}

export const freeThreadCount = (freeServers: ServerCanRun[]) => {
    return freeServers.reduce((p, r) => p + r.freeThreads, 0)
}

export interface ThreadCounts {
    weaken: number
    grow: number
    hack: number
}

export const remoteExec = (ns: NS, freeServers: ServerCanRun[], script: string, threads: number, serverToRunAgainst: string, runCount: number, ...args: string[]) => {
    if (threads <= 0) return

    let threadsLeft = threads
    for (const freeServer of freeServers) {
        if (freeServer.freeThreads <= 0) continue

        const threadsToUse = Math.min(freeServer.freeThreads, threadsLeft)
        ns.exec(script, freeServer.hostname, threadsToUse, serverToRunAgainst, '' + runCount, ...args)
        freeServer.freeThreads -= threadsToUse
        threadsLeft -= threadsToUse
        if (!threadsLeft) return
    }
}

export const weakenThreadMaths = (ns: NS, homeServer: Server, amountToWeaken: number, maxThreads?: number): ThreadCounts => {
    // const weakenAmount = ns.weakenAnalyze(1, homeServer.cpuCores)
    const weakenAmount = 0.05
    let weakenThreads = Math.min(Math.ceil(amountToWeaken / weakenAmount), maxThreads || Number.MAX_VALUE)
    return {
        weaken: weakenThreads,
        grow: 0,
        hack: 0,
    }
}

export const growThreadMaths = (
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
    // const wantedGrow = Math.ceil(ns.growthAnalyze(serverToHack.hostname, desiredGrowMulti, homeServer.cpuCores))
    const wantedGrow = Math.ceil(ns.growthAnalyze(serverToHack.hostname, desiredGrowMulti + 0.1, 1))
    // For every 12 grows we need 1 weaken
    const wantedWeaken = Math.ceil(wantedGrow / 12)

    if (wantedGrow + wantedWeaken > maxThreads) return mathsOffMaxThreads()

    return { weaken: wantedWeaken, grow: wantedGrow, hack: 0 }
}

export const buyServer = async (ns: NS, servers: Server[]) => {
    const purchaseLimit = ns.getPurchasedServerLimit()
    const purchasedServers = servers.filter((x) => x.purchasedByPlayer && x.hostname != 'home')

    // Buy new servers while we have enough money AND we haven't reached the limit
    if (ns.getServerMoneyAvailable('home') > ns.getPurchasedServerCost(PurchaseServerRam)) {
        if (purchasedServers.length == purchaseLimit) {
            const wrongRamServers = purchasedServers.filter((x) => x.maxRam != PurchaseServerRam)
            // Don't try and buy or kill if all the servers are the right size
            if (wrongRamServers.length == 0) return

            const serverToKill = wrongRamServers[0].hostname
            ns.tprint(`Killing server ${serverToKill} to make room for another one`)
            ns.killall(serverToKill)
            ns.deleteServer(serverToKill)
        }
        // Purchase the server
        await purchaseServer(ns, PurchaseServerRam)
    }
}