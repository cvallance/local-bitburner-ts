import {NS, Player, Server} from './bitburner'
import { purchaseServer } from './utils/purchase-server'
import { rootServer } from './utils/root-server'
import {ServerDetails} from "./utils/get-servers";

export const HomeRamReservation = 64

export const rootServers = async (ns: NS, servers: ServerDetails[]) => {
    for (const serverInfo of servers) {
        await rootServer(ns, serverInfo.Server, serverInfo.Path)
    }
}

export interface ServerCanRun {
    server: Server,
    hostname: string,
    maxThreads: number,
    freeThreads: number
}

const HACKING_SCRIPTS = ['hack.js', 'grow.js', 'weaken.js']
export const getServersCanRun = (ns: NS, servers: Server[], ramCost: number = 1.75): ServerCanRun[] => {
    return servers
        .filter((s) => s.hasAdminRights && s.maxRam)
        .map((s) => {
            let maxRam = s.maxRam
            let usedRam = s.ramUsed
            if (s.hostname == 'home') {
                // If this is the home machine... we want to take off the ram reservation BUT we also want to remove
                // the processes that are running in that reservation from the used ram
                maxRam -= HomeRamReservation
                const processes = ns.ps(s.hostname)
                for (const ps of processes) {
                    if (!HACKING_SCRIPTS.some(x => x == ps.filename)) usedRam -= ns.getScriptRam(ps.filename, 'home')
                }
            }

            let freeRam = maxRam - usedRam
            return {
                server: s,
                hostname: s.hostname,
                maxThreads: Math.floor(maxRam / ramCost),
                freeThreads: Math.floor(freeRam / ramCost)
            }
        }, [])
}

export const freeThreadCount = (ns: NS, freeServers: ServerCanRun[]) => {
    return freeServers.reduce((p, r) => {
       return p + r.freeThreads
    }, 0)
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

const ServerPurchases: {ram:number; broken:boolean}[] = [
    {ram: 2048, broken: true},
    {ram: 16384, broken: true},
    {ram: 131072, broken: true},
    {ram: 1048576, broken: true}
]

export const buyServer = async (ns: NS, servers: Server[]) => {
    const purchaseLimit = ns.getPurchasedServerLimit()
    const purchasedServers = servers.filter((x) => x.purchasedByPlayer && x.hostname != 'home')
    const moolah = ns.getServerMoneyAvailable('home')

    // If we restart the script, we don't want to start replacing server because we don't have much money
    const maxExistingRam = Math.max(...purchasedServers.map(x=> x.maxRam))

    // Break the seal on buying - get the lowest that hasn't been broken
    for (const serverPurchase of ServerPurchases) {
        if (serverPurchase.broken) continue

        const price = ns.getPurchasedServerCost(serverPurchase.ram)
        serverPurchase.broken = moolah > price * 3 || serverPurchase.ram <= maxExistingRam
    }

    const ramToBuy = Math.max(...ServerPurchases.filter(x => x.broken).map(x => x.ram))

    // Buy new servers while we have enough money AND we haven't reached the limit
    if (ns.getServerMoneyAvailable('home') > ns.getPurchasedServerCost(ramToBuy)) {
        if (purchasedServers.length == purchaseLimit) {
            const wrongRamServers = purchasedServers.filter((x) => x.maxRam != ramToBuy)
            // Don't try and buy or kill if all the servers are the right size
            if (wrongRamServers.length == 0) return

            const serverToKill = wrongRamServers[0].hostname
            ns.tprint(`Killing server ${serverToKill} to make room for another one`)
            ns.killall(serverToKill)
            ns.deleteServer(serverToKill)
        }
        // Purchase the server
        await purchaseServer(ns, ramToBuy)
    }
}