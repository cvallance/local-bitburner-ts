import { Table } from "./utils/table";
import { NS } from "./bitburner";

export async function main(ns: NS) {
    const table = new Table(ns)
	
    table.addColumn('Ram')
    table.addColumn('Price', {format: 'money'})

	const maxRam = ns.getPurchasedServerMaxRam()
	let ram = 2
	while (ram <= maxRam) {
		const cost = ns.getPurchasedServerCost(ram)
        table.addRow(ram, cost)
		ram *= 2
	}

	ns.tprint('\n' + table.render())
}