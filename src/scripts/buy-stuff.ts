import { ServerCanRun, remoteExec, freeThreadCount, weakenThreadMaths } from 'main-loop-support'
import {NS, Server} from './bitburner'

export const buyStuff = async (ns: NS) => {
    // Most importantly, buy more ram
    ns.upgradeHomeRam()

    // tor router and hacks
    ns.purchaseTor()
    if (!ns.fileExists('BruteSSH.exe', 'home')) ns.purchaseProgram("BruteSSH.exe")
    if (!ns.fileExists('FTPCrack.exe', 'home')) ns.purchaseProgram("FTPCrack.exe")
    if (!ns.fileExists('relaySMTP.exe', 'home')) ns.purchaseProgram("relaySMTP.exe")
    if (!ns.fileExists('HTTPWorm.exe', 'home')) ns.purchaseProgram("HTTPWorm.exe")
    if (!ns.fileExists('SQLInject.exe', 'home')) ns.purchaseProgram("SQLInject.exe")
}

