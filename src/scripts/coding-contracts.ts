import { ServerCanRun, remoteExec, freeThreadCount, weakenThreadMaths } from 'main-loop-support'
import { NS, Server } from './bitburner'
import {getServers} from "./utils/get-servers";

export const findCodingContracts = (ns: NS) => {
    const servers = getServers(ns)
    for (const server of servers) {
        const hostname = server.hostname
        for (const contract of ns.ls(hostname, ".cct")) {
            const type = ns.codingcontract.getContractType(contract, hostname)
            const data = ns.codingcontract.getData(contract, hostname)
            const desc = ns.codingcontract.getDescription(contract, hostname)
            ns.tprint(`${hostname} - ${contract} - ${type}`)
    //         ns.tprint(`\n${hostname} - ${type}
    // Data: ${data}`)
        }
    }
}

export async function main(ns: NS) {
    try {
        findCodingContracts(ns)
    } catch (ex) {
        ns.tprint(`Error finding coding contracts - ${ex}`)
    }
}
