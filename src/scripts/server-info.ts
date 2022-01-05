import { Table } from "./utils/table";
import { NS } from "./bitburner";
import { getServers } from "./utils/get-servers";

export async function main(ns: NS) {
    const table = new Table(ns)
	
    table.addColumn('Hostname')
    table.addColumn('$Max', {format: 'money'})
    table.addColumn('GrowR', {format: 'percentage'})
    table.addColumn('GrowT', {format: 'time'})
    table.addColumn('HackT', {format: 'time'})
    table.addColumn('WeakT', {format: 'time'})

	for (const server of getServers(ns)) {
		const hostname = server.hostname
		table.addRow(
			`${hostname} - ${server.requiredHackingSkill}`,
			server.moneyMax,
			server.serverGrowth,
			ns.getGrowTime(hostname),
			ns.getHackTime(hostname),
			ns.getWeakenTime(hostname),
		)
	}

	table.sortBy('$Max')
	ns.tprint('\n' + table.render())
}