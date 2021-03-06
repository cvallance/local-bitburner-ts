import { NS } from "bitburner"

interface Column {
    label: string
    align: 'left' | 'right' | 'auto'
    formatter: (value: any) => string
}

type Format = 'string' | 'time' | 'ram' | 'money' | 'percentage' | Column['formatter']

export const fram = (ns: NS, ram: number) => {
    return ns.nFormat(ram * 1024 ** 3, '0ib').toString()
}

interface ColumnOptions {
    align: Column['align']
    format: Format
}

function isNumeric(value: any): value is number {
    return !isNaN(parseFloat(value)) && isFinite(value)
}

function formatDuration(duration: number): string {
    const breakdown = [
        [86400000, 'd'],
        [3600000, 'h'],
        [60000, 'm'],
        [1000, 's'],
    ] as const
    let out = ''
    for (const [div, label] of breakdown) {
        const value = Math.floor(duration / div)
        duration %= div
        if (value || out) {
            out += `${value}${label} `
        }
    }
    if (!out) {
        out = '0s'
    }
    return out.trim()
}

function generateFormatter(ns: NS, format: Format): Column['formatter'] {
    if (typeof format === 'function') {
        return format
    }
    switch (format) {
        case 'string':
            return f => '' + f
        case 'ram':
            return f => ns.nFormat(f * 1024 ** 3, '0ib').toString()
        case 'money':
            return f => ns.nFormat(f, '$0.00a').toString()
        case 'percentage':
            return f => (f * 100).toFixed(2) + '%'
        case 'time':
            return formatDuration
    }
}

function alignTruncate(value: string, width: number, align: Column['align']): string {
    if (value.length > width) {
        return value.substring(0, width)
    }
    switch (align) {
        case 'auto':
        case 'left':
            return value.padEnd(width)
        case 'right':
            return value.padStart(width)
    }
}

const rowItemToCellRows = (item: any): any[] => {
    // If it's already an array, leave as is
    if (Array.isArray(item)) return item
    // If it's a string, break it into lines
    if (typeof item === 'string') return item.split('\n')
    // Otherwise, just return a single item array
    return [item]
}

type Row = any[][]

export class Table {
    private ns: NS
    private title?: string
    private columns: Column[]
    private rows: Row[]
    private footerRows: Row[]

    constructor(ns: NS, title?: string) {
        this.ns = ns
        this.title = title
        this.columns = []
        this.rows = []
        this.footerRows = []
    }

    public addColumn(label: string, opts?: Partial<ColumnOptions>) {
        const fullOpts: ColumnOptions = {
            align: 'auto',
            format: 'string',
            ...opts,
        }
        const {align, format} = fullOpts

        this.columns.push({
            label,
            align,
            formatter: generateFormatter(this.ns, format),
        })
    }

    public addRow(...items: any[]) {
        if (items.length != this.columns.length) {
            this.ns.tprint('WARNING: mismatched columns')
        }
        this.rows.push(items.map(x => rowItemToCellRows(x)))
    }

    public addFooterRow(...items: any[]) {
        if (items.length != this.columns.length) {
            this.ns.tprint('WARNING: mismatched columns')
        }
        this.footerRows.push(items.map(x => rowItemToCellRows(x)))
    }

    private getWidths(): number[] {
        let widths = this.columns.map(c => c.label.length)
        for (const index in this.columns) {
            const column = this.columns[index]
            for (const row of this.rows.concat(this.footerRows)) {
                const formattedCellItems = row[index].map(x => column.formatter(x))
                widths[index] = Math.max(widths[index], ...formattedCellItems.map(x => x.length))
            }
        }
        return widths
    }

    private doAlignment() {
        for (const index in this.columns) {
            const column = this.columns[index]
            if (column.align !== 'auto') {
                continue
            }
            column.align = 'right'
            for (const row of this.rows) {
                if (!isNumeric(row[index][0])) {
                    column.align = 'left'
                }
            }
        }
    }

    public render(): string {
        const theme = {
            '-': '\u2500',
            '|': '\u2502',
            v: '\u252c',
            '+': '\u253c',
            '^': '\u2534',
        }

        const widths = this.getWidths()
        const columnJoin = ' ' + theme['|'] + ' '
        const lineChar = theme['-']
        this.doAlignment()

        let out = ''

        const doLine = (char: 'v' | '+' | '^') => {
            return widths.map(w => lineChar.repeat(w)).join(theme['-'] + theme[char] + theme['-']) + '\n'
        }

        if (this.title) {
            out += this.title + '\n'
        }
        out += doLine('v')
        out +=
            this.columns.map((c, i) => alignTruncate(c.label, widths[i], this.columns[i].align)).join(columnJoin) + '\n'
        out += doLine('+')
        out += this.renderRows(this.rows, widths, columnJoin)
        if (this.footerRows.length) {
            out += doLine('+')
            out += this.renderRows(this.footerRows, widths, columnJoin)
        }
        out += doLine('^')

        return out
    }

    private renderRows(rows: Row[], widths: number[], columnJoin: string) : string {
        let out = ""
        for (const row of rows) {
            const maxCellRows = Math.max(...row.map(x => x.length))
            for (let cellRowNum = 0; cellRowNum < maxCellRows; cellRowNum++) {
                out += row.map((c, i) => {
                    const cellRowValue = c[cellRowNum] ?? ''
                    return alignTruncate(this.columns[i].formatter(cellRowValue), widths[i], this.columns[i].align)
                }).join(columnJoin) + '\n'
            }
        }
        return out
    }

    public print(): void {
        this.ns.tprintf('%s', this.render())
    }

    public sortBy(key: string | number) {
        let index = 0
        let reverse = false

        if (typeof key === 'string') {
            for (const i in this.columns) {
                if (this.columns[i].label === key) {
                    index = parseInt(i)
                }
                if (`-${this.columns[i].label}` === key) {
                    index = parseInt(i)
                    reverse = true
                }
            }
        }
        if (typeof key === 'number') {
            if (key < 0) {
                index = -key
                reverse = true
            } else {
                index = key
            }
        }

        this.rows.sort((a, b) => {
            if (typeof a[index] === 'string') {
                return a[index][0].localeCompare(b[index][0])
            }
            return a[index][0] - b[index][0]
        })

        if (reverse) {
            this.rows.reverse()
        }
    }
}