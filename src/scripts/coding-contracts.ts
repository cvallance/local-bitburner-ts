import { ServerCanRun, remoteExec, freeThreadCount, weakenThreadMaths } from 'main-loop-support'
import { NS, Server } from './bitburner'
import {getServers} from "./utils/get-servers";

const algorithmicStockTraderThree = (data: number[]) => {
    const findBestTransaction = (days: number[]) => {
        let funcBest = 0
        for (let i = 0; i < days.length - 1; i++) {
            const firstDay = days[i]
            for (let j = i+1; j < days.length; j++) {
                const secondDay = days[j]
                const loopBest = secondDay - firstDay
                if (loopBest > funcBest) funcBest = loopBest
            }
        }
        return funcBest
    }

    let best = 0
    for (let i = 1; i < data.length - 2; i++) {
        const leftArray = data.slice(0, i+1)
        const rightArray = data.slice(i+1, data.length)
        const loopBest = findBestTransaction(leftArray) + findBestTransaction(rightArray)
        if (loopBest > best) {
            best = loopBest
        }
    }
    return best
}

const generateIpAddresses = (data: string) => {
    const validPart = (part: string) => {
        if (part.length > 3) return false
        if (part.length == 0) return false
        if (part.length > 1 && part[0] == '0') return false

        return parseInt(part) <= 255;
    }

    const validIps: string[] = []
    const dataLength = data.length
    for (let i = 1; i < 4 && i < dataLength - 2; i++) {
        for (let j = i + 1; j < i + 4 && j < dataLength - 1; j++) {
            for (let k = j + 1; k < j + 4 && k < dataLength; k++) {
                const part1 = data.substring(0, i)
                const part2 = data.substring(i, j)
                const part3 = data.substring(j, k)
                const part4 = data.substring(k, dataLength)

                if (validPart(part1) && validPart(part2) && validPart(part3) && validPart(part4)) {
                    validIps.push(`${part1}.${part2}.${part3}.${part4}`)
                }
            }
        }
    }

    return validIps
}

const largestPrimeFactor = (input: number, divisor: number = 2): number => {
    let square = (val: number) => Math.pow(val, 2);

    while ((input % divisor) != 0 && square(divisor) <= input) {
        divisor++;
    }

    return square(divisor) <= input
        ? largestPrimeFactor(input / divisor, divisor)
        : input;
}

export const findCodingContracts = (ns: NS) => {
    const servers = getServers(ns)
    for (const server of servers) {
        const hostname = server.hostname
        for (const contract of ns.ls(hostname, ".cct")) {
            const type = ns.codingcontract.getContractType(contract, hostname)
            const data = ns.codingcontract.getData(contract, hostname)
            const desc = ns.codingcontract.getDescription(contract, hostname)
            ns.tprint(`${hostname} - ${contract} - ${type}`)
            let result: number | string[] | undefined
            switch (type) {
                case 'Algorithmic Stock Trader III':
                    result = algorithmicStockTraderThree(data as number[])
                    break
                case 'Generate IP Addresses':
                    result = generateIpAddresses(data as string)
                    break
                case 'Find Largest Prime Factor':
                    result = largestPrimeFactor(data as number)
                    break
            }
            if (result != undefined) {
                ns.tprint('result')
                ns.tprint(result)
                const attemptResult = ns.codingcontract.attempt(result, contract, hostname, { returnReward: true})
                if (attemptResult) {
                    ns.tprint(`Passed coding contract! ${type} on ${hostname} (${contract})\n${attemptResult}`)
                } else {
                    ns.tprint(`Failed coding contract! ${type} on ${hostname} (${contract})`)
                }
            }
        }
    }
}

export async function main(ns: NS) {
    try {
        findCodingContracts(ns)
    } catch (ex) {
        ns.tprint(`Error finding coding contracts - ${ex}`)
    }
}
