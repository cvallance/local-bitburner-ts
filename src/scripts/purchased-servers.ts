import { Table } from './utils/table'
import { NS } from './bitburner'
import {getPurchasedServers, getServers} from './utils/get-servers'

export async function main(ns: NS) {
    const table = new Table(ns)

    table.addColumn('Hostname')
    table.addColumn('MaxRam', { format: 'ram' })
    table.addColumn('UsedRam', { format: 'ram' })
    table.addColumn('%', { format: 'percentage' })

    for (const server of getPurchasedServers(ns)) {
        const hostname = server.hostname
        table.addRow(
            `${hostname} - ${server.requiredHackingSkill}`,
            server.maxRam,
            server.ramUsed,
            server.ramUsed / server.maxRam,
        )
    }

    table.sortBy('Hostname')
    ns.tprint('\n' + table.render())
}
