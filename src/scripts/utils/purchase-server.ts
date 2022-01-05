import { NS } from 'bitburner'

export const purchaseServer = async (ns: NS, ram: number) => {
    try {
        var serverName = ns.purchaseServer('worker', ram)
        if (serverName) {
            await ns.scp('hack.js', 'home', serverName)
            await ns.scp('grow.js', 'home', serverName)
            await ns.scp('weaken.js', 'home', serverName)
        }
    } catch (ex) {
        ns.tprint(`Failed to purchase server - ${ex}`)
    }
}
