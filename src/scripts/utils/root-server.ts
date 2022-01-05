import { NS } from 'bitburner'

const tryRunHost = (ns: NS, func: (target: string) => void, target: string) => {
    try {
        func(target)
    } catch (ex) {
        ns.print(`Failed to run '${func}' on target '${target}'`)
    }
}

export const rootServer = async (ns: NS, target: string) => {
    if (ns.fileExists('BruteSSH.exe', 'home'))
        tryRunHost(ns, ns.brutessh, target)
    if (ns.fileExists('FTPCrack.exe', 'home'))
        tryRunHost(ns, ns.ftpcrack, target)
    if (ns.fileExists('relaySMTP.exe', 'home'))
        tryRunHost(ns, ns.relaysmtp, target)
    if (ns.fileExists('HTTPWorm.exe', 'home'))
        tryRunHost(ns, ns.httpworm, target)
    if (ns.fileExists('SQLInject.exe', 'home'))
        tryRunHost(ns, ns.sqlinject, target)

    if (!ns.hasRootAccess(target)) {
        try {
            ns.nuke(target)
            await ns.scp('hack.js', 'home', target)
            await ns.scp('grow.js', 'home', target)
            await ns.scp('weaken.js', 'home', target)

            // TODO: Open backdoor
            // ns.installBackdoor()
        } catch (ex) {
            ns.print(`Failed to nuke server`)
        }
    }
}
