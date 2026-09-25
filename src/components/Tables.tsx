import { useEffect, useState, type ReactNode } from 'react';
import Pagination from '@components/ui/Pagination';

/* eslint-disable @typescript-eslint/no-explicit-any */
// `Row` / `TableColumn` describe dynamic, endpoint-shaped data — kept `any`
// (see the API-boundary note in task.md). Structural props below are typed.
type Row = any;
type TableColumn = Record<string, any>;

interface TablesProps {
  data?: Row[];
  defaultlSelectedRow?: string | number | null;
  columns?: TableColumn[];
  enablePagination?: boolean;
  itemsPerPage?: number;
  className?: string;
  columnClass?: string;
  enableSelection?: boolean;
  renderCell?: (...args: any[]) => ReactNode;
  onSelectionChange?: (row: Row) => void;
}

const Tables = ({
  data = [],
  defaultlSelectedRow = null,
  columns = [],
  enablePagination = true,
  itemsPerPage = 5,
  className,
  columnClass = '',
  enableSelection = false,
  renderCell,
  onSelectionChange,
}: TablesProps) => {
  const [page, setPage] = useState(1);
  const [selectedValue, setSelectedValue] = useState<Row>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  // if (!Array.isArray(data)) {
  //   console.error("Tables component error: `data` must be an array. Received:", data);
  //   return null;
  // }

  const totalPages = Math.ceil(data.length / itemsPerPage) || 1;
  const currentItems = data.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handlePageChange = (_event: unknown, value: number) => setPage(value);

  const handleRowClick = (row: Row) => {
    if (!enableSelection) return;

    setSelectedValue(row);
    if (onSelectionChange) {
      onSelectionChange(row);
    }
  };
  // console.log("SE",selectedValue)
  useEffect(() => {
    if (defaultlSelectedRow && !selectedValue) {
      console.log('ifff');
      setSelectedValue({ id: defaultlSelectedRow });
    }
  }, [defaultlSelectedRow, data]);

  return (
    <div className={`${className} glass-strong overflow-hidden`}>
      <div className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-left">
          <tbody>
            {currentItems.length > 0 ? (
              currentItems.map((row, index) => (
                <tr
                  key={index}
                  onClick={() => handleRowClick(row)}
                  onMouseEnter={() => setHoveredRow(index)}
                  onMouseLeave={() => setHoveredRow(null)}
                  className={`border-b border-line-soft transition-colors ${
                    selectedValue?.id === row.id
                      ? 'bg-brand-wash'
                      : hoveredRow === index
                        ? 'bg-brand-wash/40'
                        : ''
                  } ${enableSelection ? 'cursor-pointer' : ''}`}
                >
                  {enableSelection && (
                    <td className="p-2">
                      <input
                        type="radio"
                        className="radio"
                        checked={selectedValue?.id === row.id}
                        onChange={() => handleRowClick(row)}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {columns.map((column, colIndex) => (
                    <td
                      key={colIndex}
                      className={`${columnClass} ${column.className || ' '} p-3 text-body text-ink-0`}
                    >
                      {renderCell ? renderCell(row[column.field], column, row) : row[column.field]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length + (enableSelection ? 1 : 0)}
                  className="p-4 text-center text-body text-ink-2"
                >
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {enablePagination && data.length > itemsPerPage && (
        <Pagination count={totalPages} page={page} onChange={handlePageChange} className="py-4" />
      )}
    </div>
  );
};

export default Tables;
