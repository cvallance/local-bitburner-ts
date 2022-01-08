import { ServerCanRun, remoteExec, freeThreadCount, weakenThreadMaths } from 'main-loop-support'
import { NS, Server } from './bitburner'

const DEBUG = false
const BATCH_WINDOW_MS = 1000
// const ENFORCED_GAP = BATCH_WINDOW_MS / 2
const ENFORCED_GAP = 0
const PERCENT_TO_HACK = 0.05

const makeid = (length: number) => {
    let result           = '';
    const characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
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
    return new Date(batch.hackWeakenEnd.getTime() + (BATCH_WINDOW_MS * 2))
}

const reservedThreadCount = (batch: Batch): number => {
    let reservedThreads = 0
    if (batch.hackEnd == undefined) reservedThreads += batch.hackThreads
    if (batch.growEnd == undefined) reservedThreads += batch.growThreads
    if (batch.growWeakenEnd == undefined) reservedThreads += batch.growWeakenThreads
    return reservedThreads
}

const serverHackings: { [key: string]: ServerHacking } = {}
const initAndClean = (serverToHack: Server) => {
    const hostname = serverToHack.hostname
    if (serverHackings[hostname] == undefined) serverHackings[hostname] = {hostname, batches: []}
    const serverHacking = serverHackings[hostname]
    clearOldBatches(serverHacking)
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
    return newBatchWeakenEnd > new Date(lastBatchEnd.getTime() + BATCH_WINDOW_MS + ENFORCED_GAP);
}

export const allReservedThreadCount = () => {
    let reservedThreads = 0
    for (const server in serverHackings) {
        const serverHacking = serverHackings[server]
        reservedThreads += serverHacking.batches.reduce((p, c) => p + reservedThreadCount(c), 0)
    }
    return reservedThreads;
}
export const batchHackingFreeThreadCount = (freeServers: ServerCanRun[]) => {
    const freeThreads = freeThreadCount(freeServers)
    const reservedThreads = allReservedThreadCount()
    return freeThreads - reservedThreads;
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
        // ns.tprint(`New batch required threads ${totalThreads} greater than max ${maxThreads}`)
        return
    }

    return {
        hack: hackThreads,
        hackWeaken: hackWeakenThreads,
        grow: growThreads,
        growWeaken: growWeakenThreads
    }
}

export const batchHacking = (ns: NS, serversToHack: Server[], freeServers: ServerCanRun[], homeServer: Server) => {
    // 1 - check on all current batches to see if they need other parts started
    for (const hostname in serverHackings) {
        const serverHacking = serverHackings[hostname]
        for (const batch of serverHacking.batches) {
            // Start any other threads that it would need
            const hackWeakenEnd = batch.hackWeakenEnd
            if (batch.growWeakenEnd == undefined) {
                const weakenTime = ns.getWeakenTime(hostname)
                const growWeakenEnd = new Date(Date.now() + weakenTime)
                if (growWeakenEnd > new Date(hackWeakenEnd.getTime() + BATCH_WINDOW_MS + ENFORCED_GAP)) {
                    // We should start the growWeaken
                    batch.growWeakenEnd = growWeakenEnd
                    if (DEBUG) {
                        ns.tprint(`${hostname} batch ${batch.id} starting weaken (grow) ${batch.growWeakenThreads} to end ${growWeakenEnd.getSeconds()}:${growWeakenEnd.getMilliseconds()}`)
                    }
                    remoteExec(ns, freeServers, "weaken.js", batch.growWeakenThreads, hostname, 1, makeid(5))
                }
            }
            if (batch.growEnd == undefined) {
                const growTime = ns.getGrowTime(hostname)
                const growEnd = new Date(Date.now() + growTime)
                if (growEnd > new Date(hackWeakenEnd.getTime() + ENFORCED_GAP)) {
                    // We should start the grow
                    batch.growEnd = growEnd
                    if (DEBUG) {
                        ns.tprint(`${hostname} batch ${batch.id} starting grow ${batch.growThreads} to end ${growEnd.getSeconds()}:${growEnd.getMilliseconds()}`)
                    }
                    remoteExec(ns, freeServers, "grow.js", batch.growThreads, hostname, 1, makeid(5))
                }
            }
            if (batch.hackEnd == undefined) {
                const hackTime = ns.getHackTime(hostname)
                const hackEnd = new Date(Date.now() + hackTime)
                if (hackEnd > new Date(hackWeakenEnd.getTime() - BATCH_WINDOW_MS)) {
                    // We should start the hack
                    batch.hackEnd = hackEnd
                    if (DEBUG) {
                        ns.tprint(`${hostname} batch ${batch.id} starting hack ${batch.hackThreads} to end ${hackEnd.getSeconds()}:${hackEnd.getMilliseconds()}`)
                    }
                    remoteExec(ns, freeServers, "hack.js", batch.hackThreads, hostname, 1, makeid(5))
                }
            }
        }
    }

    // 2 - Go through the list of servers to hack to see if we should start a new batch
    for (const serverToHack of serversToHack) {
        const freeThreads = batchHackingFreeThreadCount(freeServers)
        if (freeThreads < 4) break

        initAndClean(serverToHack)
        const hostname = serverToHack.hostname
        const serverHacking = serverHackings[hostname]
        const weakenTime = ns.getWeakenTime(hostname)
        if (!shouldStartBatch(ns, serverHacking, weakenTime)) continue

        const threadMaths = newBatchThreadMaths(ns, homeServer, serverToHack, freeThreads)
        if (threadMaths == undefined) continue

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
        if (DEBUG) {
            ns.tprint(`${hostname} batch ${batchId} starting weaken (hack) ${threadMaths.hackWeaken} to end ${hackWeakenEnd.getSeconds()}:${hackWeakenEnd.getMilliseconds()}`)
        }
        remoteExec(ns, freeServers, "weaken.js", threadMaths.hackWeaken, hostname, 1, makeid(5))
    }
}
