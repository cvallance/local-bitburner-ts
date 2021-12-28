import { NS } from "./bitburner"

async function fetchScript(ns: NS, filename: string) {
    const oldContent = ns.read(filename)

    const result = await ns.wget(`http://localhost:3000/${filename}`, filename)
    if (!result) {
        ns.tprint(`FAILED to fetch ${filename}`)
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
    while (true)
    {
        const manifest = await ns.wget('http://localhost:3000', 'manifest.txt')
        if (!manifest) {
            ns.tprint("FAILED to fetch index")
            return
        }

        const content = await ns.read("manifest.txt")
        for (const filePath of content.split("\n")) {
            if (!filePath) continue
            await fetchScript(ns, filePath)
        }

        await ns.sleep(200);
    }
}