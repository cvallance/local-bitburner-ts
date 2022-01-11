import {batchHacking} from './batch-hacking'
import {buyServer, rootServers} from 'main-loop-support'
import {NS} from './bitburner'
import {getServersWithPath} from './utils/get-servers'
import {buyStuff} from "./buy-stuff";

const mainLoopWork = async (ns: NS) => {
    // Set
    const player = ns.getPlayer()
    const serversWithPath = getServersWithPath(ns)
    const servers = serversWithPath.map(x => x.Server)

    // Root servers and update them with the hacking script
    await rootServers(ns, serversWithPath)

    // Hack / Grow / Weaken
    await batchHacking(ns)

    // Buy new servers
    await buyServer(ns, servers)

    // Buy stuff
    await buyStuff(ns)
}

export async function main(ns: NS) {
    while (true) {
        try {
            await mainLoopWork(ns)
        } catch (ex) {
            ns.tprint(`Error in main loop - ${ex}`)
        }

        await ns.sleep(500)
    }
}
