import {NS, Server} from 'bitburner'

const tryRunHost = (ns: NS, func: (target: string) => void, target: string) => {
    try {
        func(target)
        return true
    } catch (ex) {
        ns.print(`Failed to run '${func}' on target '${target}'`)
    }
    return false
}

const installBackdoor = async (ns: NS, target: string, path: string[]) => {
    path.forEach(x => ns.connect(x))
    ns.connect(target)
    try {
        await ns.installBackdoor()
    }
    catch (ex) {
        ns.tprint(`Backdoor failed for ${target} - ${ex}`)
    }
    ns.connect('home')
}

const backdoored: string[] = []
export const rootServer = async (ns: NS, server: Server, path: string[]) => {
    const target = server.hostname
    if (ns.hasRootAccess(target)) {
        // Backdoor if it's a faction
        const player = ns.getPlayer()
        if (ns.getServerMaxMoney(target) == 0
            && player.hacking >= server.requiredHackingSkill
            && !server.purchasedByPlayer
            && !backdoored.some(x => x == target)) {
            await installBackdoor(ns, target, path)
            backdoored.push(target)
        }
        return
    }

    let portsOpen = 0
    if (ns.fileExists('BruteSSH.exe', 'home') && tryRunHost(ns, ns.brutessh, target)) portsOpen += 1
    if (ns.fileExists('FTPCrack.exe', 'home') && tryRunHost(ns, ns.ftpcrack, target)) portsOpen += 1
    if (ns.fileExists('relaySMTP.exe', 'home') && tryRunHost(ns, ns.relaysmtp, target)) portsOpen += 1
    if (ns.fileExists('HTTPWorm.exe', 'home') && tryRunHost(ns, ns.httpworm, target)) portsOpen += 1
    if (ns.fileExists('SQLInject.exe', 'home') && tryRunHost(ns, ns.sqlinject, target)) portsOpen += 1

    const requiredPorts = ns.getServerNumPortsRequired(target)
    if (portsOpen < requiredPorts) return

    try {
        ns.nuke(target)
        await ns.scp('hack.js', 'home', target)
        await ns.scp('grow.js', 'home', target)
        await ns.scp('weaken.js', 'home', target)
    } catch (ex) {
        ns.tprint(`Failed to nuke server - ${ex}`)
    }
}
