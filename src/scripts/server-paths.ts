import { Table } from "./utils/table";
import { NS } from "./bitburner";
import { getServersWithPath } from "./utils/get-servers";

export async function main(ns: NS) {

	let servers = getServersWithPath(ns)
	if (ns.args.length){
		const filter = ns.args[0] as string
		servers = servers.filter(x => x.Server.hostname.includes(filter))
	}

    const table = new Table(ns)
    table.addColumn('Hostname')
    table.addColumn('Path')

	for (const serverDetails of servers) {
		const hostname = serverDetails.Server.hostname
		const path = serverDetails.Path.join(' -> ')
		table.addRow(hostname, path)
	}

	table.sortBy('Hostname')
	ns.tprint('\n' + table.render())
}