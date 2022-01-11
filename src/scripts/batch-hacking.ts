import {
    ServerCanRun,
    remoteExec,
    freeThreadCount,
    weakenThreadMaths,
    getServersCanRun,
    growThreadMaths
} from './main-loop-support'
import {NS, Player, Server} from './bitburner'
import {getProcesses, getServers} from "./utils/get-servers";

const DEBUG = false
const BATCH_WINDOW_MS = 1000
// const ENFORCED_GAP = BATCH_WINDOW_MS / 2
const ENFORCED_GAP = 150
const PERCENT_TO_HACK = 0.50
const GROW_WEAKEN_THREAD_RESERVATION_PERCENT = 0.25

export const BATCH_ARG = 'batch'
export const GROW_WEAKEN_ARG = 'growweaken'

const makeid = (length: number) => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

interface ServerHacking {
    hostname: string,
    batches: Batch[]
}

interface Batch {
    id: string
    hackEnd?: Date
    // This will be the first to fire, so should always have one
    hackWeakenEnd: Date
    growEnd?: Date
    growWeakenEnd?: Date

    hackThreads: number
    hackWeakenThreads: number
    growThreads: number
    growWeakenThreads: number
}

const clearOldBatches = (serverHacking: ServerHacking) => {
    const now = new Date()
    serverHacking.batches = serverHacking.batches.filter(
        batch => batch.growWeakenEnd == undefined || batch.growWeakenEnd > now
    )
}

const batchEnd = (batch: Batch): Date => {
    // If we have a growWeakenEnd, just use that
    if (batch.growWeakenEnd != undefined) return batch.growWeakenEnd
    // The batch should finish max 2 windows after the hackWeaken finishes
    return new Date(batch.hackWeakenEnd.getTime() + (BATCH_WINDOW_MS * 2) + (ENFORCED_GAP * 2))
}

const reservedThreadCount = (batch: Batch): number => {
    let reservedThreads = 0
    if (batch.hackEnd == undefined) reservedThreads += batch.hackThreads
    if (batch.growEnd == undefined) reservedThreads += batch.growThreads
    if (batch.growWeakenEnd == undefined) reservedThreads += batch.growWeakenThreads
    return reservedThreads
}

export const serverHackings: { [key: string]: ServerHacking } = {}
const initAndClean = (hostname: string) => {
    if (serverHackings[hostname] == undefined) serverHackings[hostname] = {hostname, batches: []}
    const serverHacking = serverHackings[hostname]
    clearOldBatches(serverHacking)
}

const needsReGrowWeaken = (server: Server) => {
    const percentDown = server.moneyAvailable / server.moneyMax
    const allowedPercentDown = 1 - PERCENT_TO_HACK - 0.05
    return percentDown < allowedPercentDown
}

const shouldStartBatch = (ns: NS, serverHacking: ServerHacking, weakenTime: number) => {
    const batches = serverHacking.batches

    // If we don't have any batches, yeah, we should start one
    if (!batches.length) return true

    const lastBatch = batches[batches.length - 1]
    const lastBatchEnd = batchEnd(lastBatch)
    const newBatchWeakenEnd = new Date(Date.now() + weakenTime)
    // If the theoretical new batch's weaken is going to finish a full batch window
    // and an enforced gap after the last batches end, we can start a new one
    return newBatchWeakenEnd > new Date(lastBatchEnd.getTime() + BATCH_WINDOW_MS + (ENFORCED_GAP * 2));
}

export const allReservedThreadCount = () => {
    let reservedThreads = 0
    for (const server in serverHackings) {
        const serverHacking = serverHackings[server]
        clearOldBatches(serverHacking)
        reservedThreads += serverHacking.batches.reduce((p, c) => p + reservedThreadCount(c), 0)
    }
    return reservedThreads;
}

interface BatchServerCanRun extends ServerCanRun {
    growWeakenThreads: number,
    batchThreads: number
}

export const batchHackingGetServersCanRun = (ns: NS, servers: Server[], ramCost: number = 1.75): BatchServerCanRun[] => {
    return getServersCanRun(ns, servers, ramCost).map(serverCanRun => {
        let growWeakenThreads = 0
        let batchThreads = 0
        const processes = ns.ps(serverCanRun.hostname)
        for (const process of processes) {
            if (process.args.length < 3) {
                continue
            }

            switch (process.args[2]) {
                case BATCH_ARG:
                    batchThreads += process.threads
                    break
                case GROW_WEAKEN_ARG:
                    growWeakenThreads += process.threads
                    break
                default:
                    ns.tprint(`Unidentified second arg ${process.args[2]} for ${process.filename} on ${serverCanRun.hostname}`)
            }
        }
        return {
            ...serverCanRun,
            growWeakenThreads,
            batchThreads
        }
    })
}

export const batchHackingActiveThreadsByServer = (ns: NS, servers: Server[]): { [key: string]: number } => {
    return getServersCanRun(ns, servers).reduce((p: { [key: string]: number }, s) => {
        const processes = ns.ps(s.hostname)
        for (const process of processes) {
            if (process.args.length < 3) {
                continue
            }

            const hostHacking = process.args[0] as string
            if (p[hostHacking] == undefined) p[hostHacking] = 0
            p[hostHacking] += process.threads
        }
        return p
    }, {})
}

export const batchHackingSort = (ns: NS, x: Server, y: Server, maxThreads: number, homeServer?: Server | undefined) => {
    let home = homeServer ?? ns.getServer("home")
    return batchHackingScore(ns, y, maxThreads, home) - batchHackingScore(ns, x, maxThreads, home)
}

export const batchHackingScore = (ns: NS, server: Server, maxThreads: number, homeServer?: Server | undefined) => {
    const home = homeServer ?? ns.getServer("home")
    const maxMoney = server.moneyMax
    const weakenTime = ns.getWeakenTime(server.hostname)
    const threads = newBatchThreadMaths(ns, home, server, maxThreads)
    if (!threads) return 0

    const batchThreads = threads.hack + threads.hackWeaken + threads.grow + threads.growWeaken
    const timeTaken = weakenTime + 3_000
    // Calculate dollars per thread per ms
    return maxMoney / batchThreads / timeTaken
}

export const threadsRequiredForFullyEfficientBatch = (ns: NS, server: Server, maxThreads: number, homeServer?: Server | undefined) => {
    let home = homeServer ?? ns.getServer("home")
    const weakenTime = ns.getWeakenTime(server.hostname)
    const threads = newBatchThreadMaths(ns, home, server, maxThreads)
    if (!threads) return undefined

    const batchThreads = threads.hack + threads.hackWeaken + threads.grow + threads.growWeaken
    // Typically we fit an entire batch into 4s
    const idealConcurrentBatches = Math.ceil(weakenTime / 4000)
    return batchThreads * idealConcurrentBatches
}

export interface BatchThreadCounts {
    hack: number
    hackWeaken: number
    grow: number
    growWeaken: number
}

const newBatchThreadMaths = (ns: NS, homeServer: Server, serverToHack: Server, maxThreads: number): BatchThreadCounts | undefined => {
    const hostname = serverToHack.hostname
    const hackPercent = ns.hackAnalyze(hostname)
    if (!hackPercent) return

    const hackThreads = Math.ceil(PERCENT_TO_HACK / hackPercent)
    const percentToHack = hackPercent * hackThreads
    const hackSecUp = hackThreads * 0.002
    const hackWeakenThreads = weakenThreadMaths(ns, homeServer, hackSecUp).weaken

    let growthAmount = 1/(1-percentToHack)
    growthAmount *= 1.05 // Build in a little buffer
    // const wantedGrowThreads = ns.growthAnalyze(serverToHack.hostname, 1, homeServer.cpuCores)
    const growThreads = Math.ceil(ns.growthAnalyze(hostname, growthAmount, 1))
    const growSecUp = growThreads * 0.004
    const growWeakenThreads = weakenThreadMaths(ns, homeServer, growSecUp).weaken
    const totalThreads = hackThreads + hackWeakenThreads + growThreads + growWeakenThreads
    if (totalThreads > maxThreads) {
        if (DEBUG) ns.tprint(`New batch required threads ${totalThreads} greater than max ${maxThreads}`)
        return
    }

    return {
        hack: hackThreads,
        hackWeaken: hackWeakenThreads,
        grow: growThreads,
        growWeaken: growWeakenThreads
    }
}

export const batchHacking = (ns: NS) => {
    const player = ns.getPlayer()
    const hackLvl = player.hacking
    let servers = getServers(ns)
    const homeServer = servers.find((x) => x.hostname == 'home')!

    // Can run scripts
    const ramCost = Math.max(ns.getScriptRam('hack.js'), ns.getScriptRam('grow.js'), ns.getScriptRam('weaken.js'))
    let serversCanRun = batchHackingGetServersCanRun(ns, servers, ramCost)

    // Only work on servers that we have admin rights and have money
    const maxThreads = serversCanRun.reduce((p, s) => p + s.maxThreads, 0)
    const maxWeakenGrowThreads = Math.floor(maxThreads * GROW_WEAKEN_THREAD_RESERVATION_PERCENT)
    const maxBatchThreads = maxThreads - maxWeakenGrowThreads
    const serversToWorkOn = servers
        .filter((x) => x.hasAdminRights && x.moneyMax)
        .sort((x, y) => batchHackingSort(ns, x, y, maxBatchThreads, homeServer))

    const alreadyBatching: string[] = []
    for (const hostname in serverHackings) {
        const serverHacking = serverHackings[hostname]
        clearOldBatches(serverHacking)
        if (serverHacking.batches.length) alreadyBatching.push(serverHacking.hostname)
    }

    // 1 - Weaken and grow any servers
    // Only weaken and grow servers that aren't currently part of a batch, aren't being worked on and require weakening or growing
    const processes = getProcesses(ns)
    const serversToWeakenAndGrow = serversToWorkOn.filter(
        (x) => !processes.some(y => y.args[0] == x.hostname)
            && hackLvl >= x.requiredHackingSkill
            && !alreadyBatching.some(y => y == x.hostname)
            && (
                ns.getServerSecurityLevel(x.hostname) != x.minDifficulty
                || ns.getServerMoneyAvailable(x.hostname) != x.moneyMax
            )
    )
    weakenGrowServers(ns, serversToWeakenAndGrow, serversCanRun, maxWeakenGrowThreads, homeServer)

    // 2 - check on all current batches to see if they need other parts started
    servers = getServers(ns)
    serversCanRun = batchHackingGetServersCanRun(ns, servers, ramCost)
    checkRunningBatches(ns, serversCanRun)

    // 3 - Go through the list of servers to hack to see if we should start a new batch
    // Only hack servers that we are already hacking OR they have the required hackLevel for and don't require weakening or growing
    servers = getServers(ns)
    serversCanRun = batchHackingGetServersCanRun(ns, servers, ramCost)
    const serversToHack = serversToWorkOn.filter(
        (x) => alreadyBatching.some(y => y == x.hostname)
            || (
                hackLvl >= x.requiredHackingSkill
                && ns.getServerSecurityLevel(x.hostname) == x.minDifficulty
                && ns.getServerMoneyAvailable(x.hostname) == x.moneyMax
            )
    )
    createNewBatches(ns, serversToHack, serversCanRun, homeServer)
}

const weakenGrowServers = (ns: NS, serversToWeakenAndGrow: Server[], serversCanRun: BatchServerCanRun[], maxThreads: number, homeServer: Server) => {
    // Find out how many weakenGrowThreads are currently running
    const weakenGrowRunningThreads = serversCanRun.reduce((p, s) => p + s.growWeakenThreads, 0)
    let freeThreads = maxThreads - weakenGrowRunningThreads
    for (const serverToWeakenOrGrow of serversToWeakenAndGrow) {
        // Update the max threads and decrease the serverToHackCount
        if (freeThreads <= 0) continue

        // Need to weaken?
        const minDifficulty = serverToWeakenOrGrow.minDifficulty
        const currDifficulty = ns.getServerSecurityLevel(serverToWeakenOrGrow.hostname)
        if (currDifficulty != minDifficulty) {
            const threadMaths = weakenThreadMaths(ns, homeServer, currDifficulty - minDifficulty, freeThreads)
            remoteExec(ns, serversCanRun, 'weaken.js', threadMaths.weaken, serverToWeakenOrGrow.hostname, 1, GROW_WEAKEN_ARG, makeid(5))
            freeThreads -= threadMaths.weaken
        }

        // Need to grow?
        const maxMoney = serverToWeakenOrGrow.moneyMax
        const currMoney = ns.getServerMoneyAvailable(serverToWeakenOrGrow.hostname)
        if (currMoney != maxMoney) {
            const threadMaths = growThreadMaths(ns, homeServer, serverToWeakenOrGrow, maxMoney, currMoney, freeThreads)
            remoteExec(ns, serversCanRun, 'grow.js', threadMaths.grow, serverToWeakenOrGrow.hostname, 1, GROW_WEAKEN_ARG)
            remoteExec(ns, serversCanRun, 'weaken.js', threadMaths.weaken, serverToWeakenOrGrow.hostname, 1, GROW_WEAKEN_ARG, makeid(5))
            freeThreads -= threadMaths.weaken + threadMaths.grow
        }
    }
}

const checkRunningBatches = (ns: NS, serversCanRun: ServerCanRun[]) => {
    for (const hostname in serverHackings) {
        const serverHacking = serverHackings[hostname]
        clearOldBatches(serverHacking)
        if (needsReGrowWeaken(ns.getServer(hostname))) continue

        for (const batch of serverHacking.batches) {
            // Start any other threads that it would need
            const hackWeakenEnd = batch.hackWeakenEnd
            if (batch.growWeakenEnd == undefined) {
                const weakenTime = ns.getWeakenTime(hostname)
                const growWeakenEnd = new Date(Date.now() + weakenTime)
                const windowStart = new Date(hackWeakenEnd.getTime() + BATCH_WINDOW_MS + (ENFORCED_GAP * 2))
                if (growWeakenEnd > windowStart) {
                    // We should start the growWeaken
                    batch.growWeakenEnd = growWeakenEnd
                    if (DEBUG) ns.tprint(`${hostname} batch ${batch.id} starting weaken (grow) ${batch.growWeakenThreads} to end ${growWeakenEnd.getSeconds()}:${growWeakenEnd.getMilliseconds()}`)
                    remoteExec(ns, serversCanRun, "weaken.js", batch.growWeakenThreads, hostname, 1, BATCH_ARG, makeid(5))
                }
            }
            if (batch.growEnd == undefined) {
                const growTime = ns.getGrowTime(hostname)
                const growEnd = new Date(Date.now() + growTime)
                const windowStart = new Date(hackWeakenEnd.getTime() + ENFORCED_GAP)
                if (growEnd > windowStart) {
                    // We should start the grow
                    batch.growEnd = growEnd
                    if (DEBUG) ns.tprint(`${hostname} batch ${batch.id} starting grow ${batch.growThreads} to end ${growEnd.getSeconds()}:${growEnd.getMilliseconds()}`)
                    remoteExec(ns, serversCanRun, "grow.js", batch.growThreads, hostname, 1, BATCH_ARG, makeid(5))
                }
            }
            if (batch.hackEnd == undefined) {
                const hackTime = ns.getHackTime(hostname)
                const hackEnd = new Date(Date.now() + hackTime)
                const windowStart = new Date(hackWeakenEnd.getTime() - BATCH_WINDOW_MS - ENFORCED_GAP)
                // Also check the window end because we don't want errant hacks disrupting the algo
                const windowEnd = new Date(windowStart.getTime() + BATCH_WINDOW_MS)
                if (hackEnd > windowStart && hackEnd < windowEnd) {
                    // We should start the hack
                    batch.hackEnd = hackEnd
                    if (DEBUG) ns.tprint(`${hostname} batch ${batch.id} starting hack ${batch.hackThreads} to end ${hackEnd.getSeconds()}:${hackEnd.getMilliseconds()}`)
                    remoteExec(ns, serversCanRun, "hack.js", batch.hackThreads, hostname, 1, BATCH_ARG, makeid(5))
                }
            }
        }
    }
}

const createNewBatches = (ns: NS, serversToHack: Server[], serversCanRun: ServerCanRun[], homeServer: Server) => {
    const runningThreadsByServer = batchHackingActiveThreadsByServer(ns, serversCanRun.map(x => x.server))
    let freeThreads = freeThreadCount(ns, serversCanRun)
    for (const serverToHack of serversToHack) {
        if (freeThreads < 4) break

        initAndClean(serverToHack.hostname)
        // Don't start any new batches if it's somehow fallen below the threshold
        if (needsReGrowWeaken(serverToHack)) continue

        const currentlyRunningThreads = runningThreadsByServer[serverToHack.hostname] ?? 0
        const idealNumberOfThreads = threadsRequiredForFullyEfficientBatch(ns, serverToHack, Number.MAX_SAFE_INTEGER) ?? 0
        const hostname = serverToHack.hostname
        const serverHacking = serverHackings[hostname]
        const weakenTime = ns.getWeakenTime(hostname)

        if (DEBUG) ns.tprint(`${serverToHack.hostname} - running:${currentlyRunningThreads} ideal:${idealNumberOfThreads} free:${freeThreads}`)
        // We should reserve the number of threads this will require to be totally efficient
        const updateFreeThreads = () => freeThreads -= Math.max(idealNumberOfThreads - currentlyRunningThreads, 0)

        // Not time to start a new batch
        if (!shouldStartBatch(ns, serverHacking, weakenTime)) {
            updateFreeThreads()
            if (DEBUG) ns.tprint(`${serverToHack.hostname} - not time to start a new one starting`)
            continue
        }

        const threadMaths = newBatchThreadMaths(ns, homeServer, serverToHack, freeThreads)
        // Can't hack the server or the number of threads required is higher than the freeThreads
        if (threadMaths == undefined) {
            updateFreeThreads()
            if (DEBUG) ns.tprint(`${serverToHack.hostname} - thread maths returned nothing`)
            continue
        }

        const batchId = makeid(5)
        const hackWeakenEnd = new Date(Date.now() + weakenTime)
        serverHacking.batches.push({
            id: batchId,
            hackWeakenEnd,
            hackThreads: threadMaths.hack,
            hackWeakenThreads: threadMaths.hackWeaken,
            growThreads: threadMaths.grow,
            growWeakenThreads: threadMaths.growWeaken,
        })
        if (DEBUG) ns.tprint(`${hostname} batch ${batchId} starting weaken (hack) ${threadMaths.hackWeaken} to end ${hackWeakenEnd.getSeconds()}:${hackWeakenEnd.getMilliseconds()}`)
        remoteExec(ns, serversCanRun, "weaken.js", threadMaths.hackWeaken, hostname, 1, BATCH_ARG, makeid(5))
        updateFreeThreads()
    }
}
