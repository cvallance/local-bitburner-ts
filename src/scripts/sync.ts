import { NS } from 'bitburner'

async function fetchScript(ns: NS, filename: string) {
    const oldContent = ns.read(filename)

    const fileUrl = `http://localhost:3000${filename}`
    // If there is only 1 `/` we need to trim it from the filename to save otherwise it ends up in no-mans land
    const saveAddress = filename.indexOf('/', 1) != -1 ? filename : filename.slice(1)
    const result = await ns.wget(fileUrl, saveAddress)
    if (!result) {
        ns.tprint(`FAILED to fetch and/or save ${saveAddress} from ${fileUrl}`)
        return
    }

    const newContent = ns.read(filename)
    if (oldContent !== newContent) {
        ns.tprint(`updated ${filename}`)
        return true
    }
    return false
}

export async function main(ns: NS) {
    while (true) {
        const manifest = await ns.wget('http://localhost:3000/manifest.txt', 'manifest.txt')
        if (!manifest) {
            ns.tprint('FAILED to fetch index')
            return
        }

        const content = await ns.read('/manifest.txt')
        for (const filePath of content.split('\n')) {
            if (!filePath) continue
            await fetchScript(ns, filePath)
        }

        await ns.sleep(200)
    }
}
