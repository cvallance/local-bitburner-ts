import { NS, ProcessInfo, Server } from 'bitburner'

interface ServerDetails {
    Path: string[]
    Server: Server
}

interface HostProcessInfo extends ProcessInfo {
    Hostname: string
}

export const getServersWithPath = (ns: NS) => {
    let toReturn: ServerDetails[] = []

    let serversScanned: { [key: string]: boolean } = {}
    let getServerLoop = (hostname: string, currentPath: string[]) => {
        toReturn.push({
            Path: currentPath,
            Server: ns.getServer(hostname),
        })
        serversScanned[hostname] = true

        const newPath = [...currentPath, hostname]
        let children = ns.scan(hostname)
        for (let childHost of children) {
            if (serversScanned[childHost]) continue
            getServerLoop(childHost, newPath)
        }
    }
    getServerLoop('home', [])
    return toReturn
}

export const getServers = (ns: NS) => {
    return getServersWithPath(ns).map((x) => x.Server)
}

export const getPurchasedServers = (ns: NS) => {
    return getServers(ns).filter((x) => x.purchasedByPlayer)
}

export const getCompanyServers = (ns: NS) => {
    return getServers(ns).filter((x) => !x.purchasedByPlayer)
}

export const getServersToBackdoor = (ns: NS) => {
    return getServers(ns).filter((x) => !x.purchasedByPlayer && x.moneyMax == 0)
}

export const getProcesses = (ns: NS) => {
    const toReturn: HostProcessInfo[] = []

    const servers = getServers(ns)
    for (const server of servers) {
        for (const process of ns.ps(server.hostname)) {
            toReturn.push({
                ...process,
                Hostname: server.hostname,
            })
        }
    }

    return toReturn
}
