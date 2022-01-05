import { fram, Table } from './utils/table'
import { NS } from './bitburner'
import { getProcesses, getServers } from './utils/get-servers'

export async function main(ns: NS) {
    const hacking = ns.getPlayer().hacking

    const table = new Table(ns)
    table.addColumn('Host')
    table.addColumn('Security', { align: 'right' })
    table.addColumn('Money', { format: 'money' })
    table.addColumn('Money %', { format: 'percentage' })
    table.addColumn('Processes')
    table.addColumn('Can hack', {
        align: 'right',
        format: (s) => (s <= hacking ? '✓' : '' + s),
    })
    table.addColumn('Hack time', { format: 'time' })

    const byServer: {
        [hostname: string]: { weaken: number; grow: number; hack: number }
    } = {}
    const processes = getProcesses(ns)
    for (const p of processes) {
        if (!(p.args[0] in byServer)) {
            byServer[p.args[0]] = { weaken: 0, grow: 0, hack: 0 }
        }
        switch (p.filename) {
            case 'weaken.js':
                byServer[p.args[0]].weaken += p.threads
                break
            case 'grow.js':
                byServer[p.args[0]].grow += p.threads
                break
            case 'hack.js':
                byServer[p.args[0]].hack += p.threads
                break
            default:
                if (p.Hostname !== 'home') {
                    ns.tprint(`WARNING unknown proc: ${JSON.stringify(p)}`)
                }
        }
    }

    const allServers = getServers(ns)
    const hackableServers = allServers.filter(
        (s) => s.hasAdminRights && s.moneyMax
    )
    for (const server of hackableServers) {
        if (server.requiredHackingSkill > hacking + 200) {
            continue
        }
        table.addRow(
            server.hostname,
            `${(server.hackDifficulty - server.minDifficulty).toFixed(2)}+${
                server.minDifficulty
            }`,
            server.moneyAvailable,
            server.moneyAvailable / server.moneyMax,
            `${byServer[server.hostname]?.weaken || 0} . ${
                byServer[server.hostname]?.grow || 0
            } . ${byServer[server.hostname]?.hack || 0}`,
            server.requiredHackingSkill,
            ns.getHackTime(server.hostname)
        )
    }

    table.sortBy('Can hack')
    ns.tprint('\n' + table.render())

    const serversCanRun = allServers.filter((s) => s.hasAdminRights && s.maxRam)
    const maxRam = serversCanRun.reduce((r, s) => r + s.maxRam, 0)
    const usedRam = serversCanRun.reduce((r, s) => r + s.ramUsed, 0)
    ns.tprintf(
        'Used %s of %s %0.2f%%',
        fram(ns, usedRam),
        fram(ns, maxRam),
        (usedRam / maxRam) * 100
    )
}
