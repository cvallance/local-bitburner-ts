import {getServers} from './get-servers'
import { NS } from './bitburner';

export async function main(ns: NS) {
	let servers = getServers(ns, false)
	for (var hostName of servers) {
		ns.tprint(`Test script print host: ${hostName}`)
	}
}
