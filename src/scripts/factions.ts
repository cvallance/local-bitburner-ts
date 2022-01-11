import { ServerCanRun, remoteExec, freeThreadCount, weakenThreadMaths } from 'main-loop-support'
import {NS, Server} from './bitburner'
import {Table} from "./utils/table";

const FACTIONS = [
    'CyberSec',
    'Sector-12',
    'NiteSec',
    'BitRunners',
    'The Black Hand',
]

export const factions = async (ns: NS) => {
    let player = ns.getPlayer()

    const table = new Table(ns)
    table.addColumn('Faction')
    table.addColumn('Augmentations', { align: 'right' })
    table.addColumn('Cost', { align: 'left', format: 'money' })
    table.addColumn('$')
    table.addColumn('#')

    const ownedAugs = ns.getOwnedAugmentations()
    for (const faction of FACTIONS) {
        const facRep = ns.getFactionRep(faction)
        const augs = ns.getAugmentationsFromFaction(faction).filter(x => !ownedAugs.some(y => y == x))
        if (!augs.length) continue

        const priceCell = (aug: string) => {
            const required = ns.getAugmentationPrice(aug) - player.money
            return required <= 0 ? "✓" : required
        }

        const repCell = (aug: string) => {
            const required = ns.getAugmentationRepReq(aug) - facRep
            return required <= 0 ? "✓" : Math.ceil(required)
        }

        table.addRow(
            faction,
            augs,
            augs.map(x => ns.getAugmentationPrice(x)),
            augs.map(x => priceCell(x)),
            augs.map(x => repCell(x)),
        )
    }

    table.print()
}


export async function main(ns: NS) {
    await factions(ns)
}
