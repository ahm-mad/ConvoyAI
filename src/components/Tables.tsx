import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Pagination,
  Stack,
  Radio,
} from '@mui/material';

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

  const handlePageChange = (_event: ChangeEvent<unknown>, value: number) => setPage(value);

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
    <div className={` ${className} border border-line-soft rounded-md overflow-hidden`}>
      <TableContainer component="div" className="p-0  ">
        <Table>
          <TableBody>
            {currentItems.length > 0 ? (
              currentItems.map((row, index) => (
                <TableRow
                  key={index}
                  onClick={() => handleRowClick(row)}
                  onMouseEnter={() => setHoveredRow(index)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    backgroundColor:
                      selectedValue?.id === row.id
                        ? 'var(--color-surface-3)'
                        : hoveredRow === index
                          ? 'var(--color-surface-2)'
                          : 'var(--color-surface-1)',
                    cursor: enableSelection ? 'pointer' : 'default',
                    transition: 'background-color 0.15s ease-in-out',
                    borderBottom: '1px solid var(--color-line-soft)',
                  }}
                >
                  {enableSelection && (
                    <TableCell className="p-2 ">
                      <Radio
                        checked={selectedValue?.id === row.id}
                        onChange={() => handleRowClick(row)}
                        sx={{
                          color: 'var(--color-line)',
                          '&.Mui-checked': { color: 'var(--color-accent-cyan)' },
                        }}
                      />
                    </TableCell>
                  )}
                  {columns.map((column, colIndex) => (
                    <TableCell
                      key={colIndex}
                      className={`${columnClass} ${column.className || ' '}  p-2`}
                      sx={{ color: 'var(--color-ink-0)', borderColor: 'var(--color-line-soft)' }}
                    >
                      {renderCell ? renderCell(row[column.field], column, row) : row[column.field]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (enableSelection ? 1 : 0)}
                  className="text-center p-4"
                  sx={{ color: 'var(--color-ink-2)', borderColor: 'var(--color-line-soft)' }}
                >
                  No data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {enablePagination && data.length > itemsPerPage && (
        <Stack spacing={2} alignItems="center" className="mt-4 ">
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            size="large"
            sx={{
              '& .MuiPaginationItem-root': { color: 'var(--color-ink-1)' },
              '& .MuiPaginationItem-root.Mui-selected': {
                backgroundColor: 'var(--color-accent-cyan)',
                color: '#001820',
              },
            }}
          />
        </Stack>
      )}
    </div>
  );
};

export default Tables;
