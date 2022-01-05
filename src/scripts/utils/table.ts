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

function generateFormatter(ns: NS, format: Format): Column['formatter'] {
    if (typeof format === 'function') {
        return format
    }
    switch (format) {
        case 'string':
            return f => '' + f
        case 'ram':
            return f => fram(ns, f)
        case 'money':
            return f => ns.nFormat(f, '$0.00a').toString()
        case 'percentage':
            return f => (f * 100).toFixed(2) + '%'
        case 'time':
            return f => ns.tFormat(f)
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

export class Table {
    private ns: NS
    private title?: string
    private columns: Column[]
    private rows: any[][]

    constructor(ns: NS, title?: string) {
        this.ns = ns
        this.title = title
        this.columns = []
        this.rows = []
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
        this.rows.push(items)
    }

    private getWidths(): number[] {
        let widths = this.columns.map(c => c.label.length)
        for (const index in this.columns) {
            const column = this.columns[index]
            for (const row of this.rows) {
                const formatted = column.formatter(row[index])
                widths[index] = Math.max(formatted.length, widths[index])
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
                if (!isNumeric(row[index])) {
                    column.align = 'left'
                }
            }
        }
    }

    public render(): string {
        const widths = this.getWidths()
        const columnJoin = ' | '
        const totalWidth = widths.reduce((t, w) => t + w, 0) + columnJoin.length * (widths.length - 1)
        this.doAlignment()

        let out = ''
        if (this.title) {
            out += this.title + '\n'
        }
        out += '-'.repeat(totalWidth) + '\n'
        out +=
            this.columns.map((c, i) => alignTruncate(c.label, widths[i], this.columns[i].align)).join(columnJoin) + '\n'
        out += '-'.repeat(totalWidth) + '\n'
        for (const row of this.rows) {
            out +=
                row
                    .map((c, i) => alignTruncate(this.columns[i].formatter(c), widths[i], this.columns[i].align))
                    .join(columnJoin) + '\n'
        }
        out += '-'.repeat(totalWidth) + '\n'

        return out
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
                return a[index].localeCompare(b[index])
            }
            return a[index] - b[index]
        })

        if (reverse) {
            this.rows.reverse()
        }
    }
}