import { useState, useMemo } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
} from '@tanstack/react-table';
import type { SortingState, ColumnDef } from '@tanstack/react-table';
import { Search, ChevronUp, ChevronDown, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DataTableProps<T> {
    data: T[];
    columns: ColumnDef<T, any>[];
    exportFilename?: string;
    searchPlaceholder?: string;
    rowClassName?: (row: T) => string;
}

export default function DataTable<T>({
    data,
    columns,
    exportFilename = "Export",
    searchPlaceholder = "Search records...",
    rowClassName
}: DataTableProps<T>) {

    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState('');

    // Dynamically inject SlNo column globally ahead of incoming props
    const tableColumns = useMemo<ColumnDef<T, any>[]>(() => {
        return [
            {
                id: 'slno',
                header: 'SlNo',
                cell: (info) => <span className="text-slate-400 font-medium">{info.row.index + 1}</span>,
                enableSorting: false,
                size: 70
            },
            ...columns
        ];
    }, [columns]);

    const table = useReactTable({
        data,
        columns: tableColumns,
        state: { sorting, globalFilter },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {
            pagination: { pageSize: 10 }
        }
    });

    const handleExport = () => {
        // Generate a clean raw dataset from the filtered rows
        const visibleRows = table.getFilteredRowModel().rows;
        // We map purely based on defined accessor keys where possible, or fallback to visible render output
        const exportData = visibleRows.map((row, index) => {
            const rowData: any = { "SlNo": index + 1 };
            columns.forEach(col => {
                if (col.id) {
                    rowData[col.header as string || col.id] = row.getValue(col.id);
                } else if ((col as any).accessorKey) {
                    rowData[col.header as string || (col as any).accessorKey] = row.getValue((col as any).accessorKey);
                }
            });
            return rowData;
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        XLSX.writeFile(workbook, `${exportFilename}.xlsx`);
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">

            {/* Table Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="relative w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={globalFilter ?? ''}
                        onChange={e => setGlobalFilter(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-white"
                    />
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                    <Download size={16} /> Export Data
                </button>
            </div>

            {/* Scrollable Table Area */}
            <div className="flex-1 overflow-auto">
                <table className="w-full min-w-max text-left text-sm text-slate-600 whitespace-nowrap">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase text-xs font-bold tracking-wider sticky top-0 backdrop-blur-sm z-10">
                        {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => (
                                    <th
                                        key={header.id}
                                        onClick={header.column.getToggleSortingHandler()}
                                        className={`px-6 py-4 ${header.column.getCanSort() ? 'cursor-pointer select-none hover:bg-slate-100/80 transition-colors' : ''}`}
                                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                                    >
                                        <div className="flex items-center gap-2">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {header.column.getIsSorted() === 'asc' ? <ChevronUp size={14} className="text-teal-500" /> :
                                                header.column.getIsSorted() === 'desc' ? <ChevronDown size={14} className="text-teal-500" /> :
                                                    header.column.getCanSort() ? <div className="w-3.5 opacity-0 group-hover:opacity-50"></div> : null}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {table.getRowModel().rows.length > 0 ? table.getRowModel().rows.map(row => (
                            <tr key={row.id} className={`hover:bg-slate-50/50 transition-colors group ${rowClassName ? rowClassName(row.original) : ''}`}>
                                {row.getVisibleCells().map(cell => (
                                    <td key={cell.id} className="px-6 py-4">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={columns.length + 1} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                                    No records found matching criteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">Rows per page:</span>
                    <select
                        value={table.getState().pagination.pageSize}
                        onChange={e => {
                            const val = e.target.value;
                            if (val === "All") {
                                table.setPageSize(999999);
                            } else {
                                table.setPageSize(Number(val));
                            }
                        }}
                        className="border border-slate-200 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 bg-white"
                    >
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="All">All</option>
                    </select>
                    <span className="text-sm text-slate-400 ml-4">
                        Showing {table.getRowModel().rows.length > 0 ? table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1 : 0} to {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of {table.getFilteredRowModel().rows.length}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronsLeft size={16} />
                    </button>
                    <button
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-medium text-slate-600 px-3">
                        Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                    </span>
                    <button
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight size={16} />
                    </button>
                    <button
                        onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                        disabled={!table.getCanNextPage()}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronsRight size={16} />
                    </button>
                </div>
            </div>

        </div>
    );
}
