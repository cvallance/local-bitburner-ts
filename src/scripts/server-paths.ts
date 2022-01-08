import { Table } from './utils/table'
import { NS } from './bitburner'
import { getServersWithPath } from './utils/get-servers'

export async function main(ns: NS) {
    let servers = getServersWithPath(ns)
    let connect = false
    if (ns.args.length) {
        const filter = ns.args[0] as string
        if (filter == 'factions') {
            servers = servers.filter((x) => x.Server.moneyMax == 0 && !x.Server.purchasedByPlayer && x.Server.hostname != 'darkweb')
        } else {
            // Simple text match
            servers = servers.filter((x) => x.Server.hostname.includes(filter))
        }

        if (ns.args.length == 2) {
            connect = ns.args[1] as boolean
        }
    }

    if (servers.length == 1 && connect) {
        const server = servers[0]
        server.Path.filter(x => x != 'home').forEach(x => ns.connect(x))
        ns.connect(server.Server.hostname)
        return
    }

    const table = new Table(ns)
    table.addColumn('Hostname')
    table.addColumn('HackLvl')
    table.addColumn('Path')

    for (const serverDetails of servers) {
        const hostname = serverDetails.Server.hostname
        const path = `connect ${serverDetails.Path.filter(x => x != 'home').join('; connect ')}; connect ${hostname};`
        table.addRow(hostname, serverDetails.Server.requiredHackingSkill, path)
    }

    table.sortBy('Hostname')
    ns.tprint('\n' + table.render())
}
