import {getServers} from './get-servers'
import { NS } from './bitburner';

export async function main(ns: NS) {
	let servers = getServers(ns, false)
	ns.tprint(`Test script printing all available hosts:`)
	for (var hostName of servers) {
		ns.tprint(`  -> ${hostName}`)
	}
}
