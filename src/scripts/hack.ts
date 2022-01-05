import { NS } from 'bitburner'

export async function main(ns: NS) {
    const target = ns.args[0] as string
    let times = parseInt(ns.args[1] as string)
    for (let i = 0; i < times; i++) await ns.hack(target)
}
