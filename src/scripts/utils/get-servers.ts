import { NS } from "../bitburner"

 export const getServers = (ns: NS, requireRoot: boolean) => {
	let toReturn: string[] = []

	let serversScanned: {[key: string]: boolean} = {['home']: true}
	let getServerLoop = (hostName: string) => {
		// Attempt to root any child servers
		let children = ns.scan(hostName)
		for (let childHost of children) {	
			if (serversScanned[childHost]) continue

			if (requireRoot) {
				if (ns.hasRootAccess(childHost)) {
					toReturn.push(childHost)
				}
			}
			else {
				toReturn.push(childHost)
			}
			
			serversScanned[childHost] = true

			getServerLoop(childHost)
		}
	}
	getServerLoop("home")
	return toReturn
}