import { fram, Table } from './utils/table'
import { NS } from './bitburner'
import { getProcesses, getServers } from './utils/get-servers'
import { getServersCanRun } from 'main-loop-support'
import {allReservedThreadCount, GROW_WEAKEN_ARG} from "./batch-hacking";

export async function main(ns: NS) {
    const hacking = ns.getPlayer().hacking
    const filter = ns.args[0]

    const table = new Table(ns)
    table.addColumn('Host')
    table.addColumn('Security', { align: 'right' })
    table.addColumn('Money', { format: 'money' })
    table.addColumn('Money %', { format: 'percentage' })
    table.addColumn('GW Procs')
    table.addColumn('B Procs')
    table.addColumn('Can hack', {
        align: 'right',
        format: (s) => (s <= hacking ? '✓' : '' + s),
    })
    table.addColumn('Hack time', { format: 'time' })

    const byServer: {
        [hostname: string]: { weaken: number; grow: number; hack: number, bWeaken: number; bGrow: number; bHack: number }
    } = {}
    const processes = getProcesses(ns)
    for (const p of processes) {
        const hostname = p.args[0]
        if (!(hostname in byServer)) byServer[hostname] = { weaken: 0, grow: 0, hack: 0, bWeaken: 0, bGrow: 0, bHack: 0 }

        const isGrowWeaken = p.args[2] == GROW_WEAKEN_ARG
        switch (p.filename) {
            case 'weaken.js':
                if (isGrowWeaken) byServer[hostname].weaken += p.threads
                else byServer[hostname].bWeaken += p.threads
                break
            case 'grow.js':
                if (isGrowWeaken) byServer[hostname].grow += p.threads
                else byServer[hostname].bGrow += p.threads
                break
            case 'hack.js':
                if (isGrowWeaken) byServer[hostname].hack += p.threads
                else byServer[hostname].bHack += p.threads
                break
            default:
                if (p.Hostname !== 'home') {
                    ns.tprint(`WARNING unknown proc: ${JSON.stringify(p)}`)
                }
        }
    }

    let tMoneyAvail = 0
    let tMaxMoney = 0
    let twThreads = 0
    let tgThreads = 0
    let thThreads = 0
    let tbwThreads = 0
    let tbgThreads = 0
    let tbhThreads = 0
    const allServers = getServers(ns)
    const hackableServers = allServers.filter((s) => s.hasAdminRights && s.moneyMax)
    for (const server of hackableServers) {
        if (server.requiredHackingSkill > hacking + 200) continue
        const wThreads = byServer[server.hostname]?.weaken || 0
        const gThreads = byServer[server.hostname]?.grow || 0
        const hThreads = byServer[server.hostname]?.hack || 0
        const totalThreads = wThreads + gThreads + hThreads
        if (filter === 'gw' && totalThreads === 0) continue
        const bwThreads = byServer[server.hostname]?.bWeaken || 0
        const bgThreads = byServer[server.hostname]?.bGrow || 0
        const bhThreads = byServer[server.hostname]?.bHack || 0
        const totalBThreads = bwThreads + bgThreads + bhThreads
        if (filter === 'h' && totalBThreads === 0) continue
        if (filter === 'gwh' && totalThreads === 0 && totalBThreads === 0) continue
        table.addRow(
            server.hostname,
            `${(server.hackDifficulty - server.minDifficulty).toFixed(2)}+${server.minDifficulty}`,
            server.moneyAvailable,
            server.moneyAvailable / server.moneyMax,
            `${wThreads} . ${gThreads} . ${hThreads}`,
            `${bwThreads} . ${bgThreads} . ${bhThreads}`,
            server.requiredHackingSkill,
            ns.getHackTime(server.hostname)
        )
        tMoneyAvail += server.moneyAvailable
        tMaxMoney += server.moneyMax
        twThreads += wThreads
        tgThreads += gThreads
        thThreads += hThreads
        tbwThreads += bwThreads
        tbgThreads += bgThreads
        tbhThreads += bhThreads
    }

    table.addFooterRow(
        "",
        "",
        tMoneyAvail,
        tMoneyAvail / tMaxMoney,
        `${twThreads} . ${tgThreads} . ${thThreads}`,
        `${tbwThreads} . ${tbgThreads} . ${tbhThreads}`,
        "N/A",
        ""
    )

    table.sortBy('Can hack')
    ns.tprint('\n' + table.render())

    const serversCanRun = getServersCanRun(ns, allServers)
    const maxRam = serversCanRun.reduce((r, s) => r + s.server.maxRam, 0)
    const usedRam = serversCanRun.reduce((r, s) => r + s.server.ramUsed, 0)
    ns.tprintf('Used %s of %s %0.2f%%', fram(ns, usedRam), fram(ns, maxRam), (usedRam / maxRam) * 100)
}
