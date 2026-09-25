// @ts-nocheck -- TODO(ts-migration): type this file's internals; see task.md Phase 7.
// The public props contract (DataTableProps) below IS enforced for consumers.
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import Button from './Button';
import GlobalInput from './Input';
import GlobalSelect from './RadixDropDown';
import DropdownMenuRadix from './DropDownMenuRadix';
import { Check, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import AddBtnIcon from '@assets/icons/MUIicons/AddBtnIcon';

// Row/column entities come from each caller's API payload and aren't typed in
// this pass (see task.md — API shapes wait for API docs).
export interface DataTableColumn {
  key: string;
  header: ReactNode;
  /** Some columns intentionally pass `null` (computed/action columns). */
  accessor?: string | null;
  width?: string;
  minWidth?: string;
  align?: 'left' | 'center' | 'right';
  headerClassName?: string;
  cellClassName?: string;
  truncate?: boolean;
  /** Accepted for compatibility; sortability is driven by `accessor` presence. */
  sortable?: boolean;
  render?: (value: any, item: any, index: number) => ReactNode;
}

export interface DataTableBulkAction {
  id?: string | number;
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface DataTableProps {
  data?: any[];
  columns?: DataTableColumn[];
  searchTerm?: string;
  onSearchChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  pagination?: boolean;
  serverSidePagination?: boolean;
  serverSideSorting?: boolean;
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;
  rowsPerPage?: number;
  /** Accepted for compatibility; the component reads `rowsPerPage`. */
  defaultRowsPerPage?: number;
  onPageChange?: (page: number) => void;
  onRowsPerPageChange?: (rowsPerPage: number) => void;
  rowsPerPageOptions?: number[];
  sortBy?: string;
  sortOrder?: string;
  onSort?: (columnKey: string, direction: string) => void;
  selectable?: boolean;
  onSelectionChange?: (selectedIds: any[]) => void;
  selectedItems?: any[];
  onRowClick?: (item: any) => void;
  loading?: boolean;
  loadingText?: string;
  noDataText?: string;
  className?: string;
  tableClassName?: string;
  headerClassName?: string;
  rowClassName?: string;
  showSearch?: boolean;
  showAddButton?: boolean;
  addButtonText?: ReactNode;
  onAddClick?: () => void;
  searchPlaceholder?: string;
  bulkActions?: DataTableBulkAction[];
  onBulkAction?: (value: string) => void;
  cellPadding?: string;
  addButtonId?: string;
  searchItemId?: string;
  bulkActionId?: string;
  checkAllId?: string;
  CheckOneID?: string;
  /** Opt-in inline row expansion (e.g. an "expand to see details" accordion row). Both must be passed
   * together; omitting either leaves the table's normal behavior unchanged. `renderExpandedRow` gets a
   * single full-width cell spanning every column, rendered directly below the row it belongs to. */
  isRowExpanded?: (item: any) => boolean;
  renderExpandedRow?: (item: any) => ReactNode;
}

const DataTable = ({
  data = [],
  columns = [],
  searchTerm = '',
  onSearchChange = () => {},

  // Pagination props (server-side only)
  pagination = true,
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  rowsPerPage = 10,
  onPageChange = () => {},
  onRowsPerPageChange = () => {},
  rowsPerPageOptions = [5, 10, 25, 50],

  // Sorting props (server-side only)
  sortBy = '',
  sortOrder = 'asc',
  onSort = () => {},

  // Selection props
  selectable = false,
  onSelectionChange = () => {},
  selectedItems = [],

  onRowClick = () => {},
  isRowExpanded,
  renderExpandedRow,
  loading = false,
  loadingText = 'Loading...',
  noDataText = 'No data found.',
  className = '',
  tableClassName = '',
  headerClassName = 'bg-surface-2',
  rowClassName = 'hover:bg-surface-2',
  showSearch = true,
  showAddButton = true,
  addButtonText = 'Add New',
  onAddClick = () => {},
  searchPlaceholder = 'Search...',
  bulkActions = [],
  onBulkAction = () => {},
  cellPadding = '',
  addButtonId,
  searchItemId,
  bulkActionId,
  checkAllId,
  CheckOneID,
}: DataTableProps) => {
  // Stable data state to hold last successfully loaded data
  const [stableData, setStableData] = useState([]);
  const [stableTotalItems, setStableTotalItems] = useState(0);

  // Selection state
  const [selectedRows, setSelectedRows] = useState(new Set(selectedItems || []));
  const [selectAll, setSelectAll] = useState(false);

  // Bulk action state
  const [bulkActionValue, setBulkActionValue] = useState('');

  // Track previous selectedItems to prevent unnecessary updates
  const prevSelectedItemsRef = useRef(selectedItems);

  // Update stableData only when loading is false and new data arrives
  useEffect(() => {
    if (!loading && Array.isArray(data) && data.length >= 0) {
      setStableData(data);
    }
  }, [data, loading]);

  // Update stableTotalItems
  useEffect(() => {
    if (!loading && totalItems > 0) {
      setStableTotalItems(totalItems);
    }
  }, [totalItems, loading]);

  // Only update selectedRows when selectedItems actually changes
  useEffect(() => {
    const currentSelectedItems = selectedItems || [];
    const prevSelectedItems = prevSelectedItemsRef.current || [];

    const hasChanged =
      currentSelectedItems.length !== prevSelectedItems.length ||
      currentSelectedItems.some((item, index) => item !== prevSelectedItems[index]);

    if (hasChanged) {
      const newSet = new Set(currentSelectedItems);
      setSelectedRows(newSet);
      prevSelectedItemsRef.current = currentSelectedItems;
    }
  }, [selectedItems]);

  // Display data is just stableData (no client-side processing)
  const displayData = useMemo(() => {
    return Array.isArray(stableData) ? stableData : [];
  }, [stableData]);

  // Pagination calculations
  const getPaginationInfo = useMemo(() => {
    const effectiveTotalItems = loading && stableTotalItems > 0 ? stableTotalItems : totalItems;
    const startIndex = (currentPage - 1) * rowsPerPage + 1;
    const endIndex = Math.min(currentPage * rowsPerPage, effectiveTotalItems);

    return {
      currentData: displayData,
      totalPages: totalPages,
      startIndex,
      endIndex,
      totalItems: effectiveTotalItems,
      currentPage: currentPage,
    };
  }, [currentPage, rowsPerPage, totalItems, totalPages, displayData, loading, stableTotalItems]);

  // Handle column sorting (server-side)
  const handleSort = useCallback(
    (columnKey, direction) => {
      onSort(columnKey, direction);
    },
    [onSort]
  );

  // Handle bulk action selection
  const handleBulkActionChange = useCallback(
    value => {
      setBulkActionValue('');
      onBulkAction(value);
    },
    [onBulkAction]
  );

  // Handle individual row selection
  const handleRowSelect = useCallback(
    rowId => {
      if (!selectable) return;

      setSelectedRows(prevSelected => {
        const newSelected = new Set(prevSelected);
        if (newSelected.has(rowId)) {
          newSelected.delete(rowId);
        } else {
          newSelected.add(rowId);
        }

        setTimeout(() => {
          onSelectionChange(Array.from(newSelected));
        }, 0);

        return newSelected;
      });
    },
    [selectable, onSelectionChange]
  );

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (!selectable) return;

    setSelectedRows(prevSelected => {
      const newSelected = new Set(prevSelected);
      const currentIds = getPaginationInfo.currentData.map(item => item.id);

      if (selectAll) {
        currentIds.forEach(id => newSelected.delete(id));
      } else {
        currentIds.forEach(id => newSelected.add(id));
      }

      setTimeout(() => {
        onSelectionChange(Array.from(newSelected));
      }, 0);

      return newSelected;
    });
  }, [selectable, selectAll, getPaginationInfo.currentData, onSelectionChange]);

  // Update select all state based on current page selections
  useEffect(() => {
    if (getPaginationInfo.currentData.length > 0 && selectable) {
      const currentIds = getPaginationInfo.currentData.map(item => item.id);
      const allCurrentSelected =
        currentIds.every(id => selectedRows.has(id)) && currentIds.length > 0;
      setSelectAll(allCurrentSelected);
    } else {
      setSelectAll(false);
    }
  }, [getPaginationInfo.currentData, selectedRows, selectable]);

  // Handle page change
  const handlePageChange = useCallback(
    page => {
      onPageChange(page);
    },
    [onPageChange]
  );

  // Handle rows per page change
  const handleRowsPerPageChange = useCallback(
    newRowsPerPage => {
      const numRowsPerPage = parseInt(newRowsPerPage);
      onRowsPerPageChange(numRowsPerPage);
    },
    [onRowsPerPageChange]
  );

  // Prepare bulk actions options for GlobalSelect
  const bulkActionsOptions = useMemo(
    () =>
      bulkActions.map(action => ({
        id: action.id,
        value: action.value,
        label: action.label,
        disabled: action.disabled || false,
      })),
    [bulkActions]
  );

  // Prepare rows per page options for GlobalSelect
  const rowsPerPageSelectOptions = useMemo(
    () =>
      rowsPerPageOptions.map(option => ({
        value: option.toString(),
        label: option.toString(),
      })),
    [rowsPerPageOptions]
  );

  const getSortDirection = useCallback(
    columnKey => {
      return sortBy === columnKey ? sortOrder : null;
    },
    [sortBy, sortOrder]
  );

  // Prepare dropdown options for each sortable column
  const getSortDropdownOptions = useCallback(
    columnKey => {
      const currentDirection = getSortDirection(columnKey);

      return [
        {
          label: 'Asc',
          icon: <ChevronUp className="w-3 h-3" />,
          onClick: () => handleSort(columnKey, 'asc'),
          className: currentDirection === 'asc' ? 'bg-accent-cyan/10 text-accent-cyan' : '',
        },
        {
          label: 'Desc',
          icon: <ChevronDown className="w-3 h-3" />,
          onClick: () => handleSort(columnKey, 'desc'),
          className: currentDirection === 'desc' ? 'bg-accent-cyan/10 text-accent-cyan' : '',
        },
      ];
    },
    [getSortDirection, handleSort]
  );

  return (
    <div className={`w-full bg-white/70 ${className}`}>
      {/* Controls Section */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 p-3 bg-white/60 border-b border-line-soft relative z-50">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
          {/* Search Input with Spinner */}
          {showSearch && (
            <div className="flex items-center gap-2 w-full md:w-auto">
              <GlobalInput
                id={searchItemId}
                label=""
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={onSearchChange}
                width="w-full md:w-48"
                height="h-10"
              />
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin text-accent-cyan flex-shrink-0" />
              )}
            </div>
          )}

          {/* Bulk Actions using GlobalSelect */}
          {selectedRows.size > 0 && bulkActions.length > 0 && (
            <div
              className="flex items-center gap-2 w-full md:w-auto"
              style={{ zIndex: 100, position: 'relative' }}
            >
              <GlobalSelect
                id={bulkActionId}
                value={bulkActionValue}
                onValueChange={handleBulkActionChange}
                placeholder="Bulk Actions"
                className="cursor-pointer w-full md:w-auto"
                options={bulkActionsOptions}
                size="small"
                width="w-full md:w-40"
                triggerClassName="h-[36px]"
              />
            </div>
          )}
        </div>

        {/* Add Button */}
        {showAddButton && (
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Button id={addButtonId} className="rounded-lg w-full" onClick={onAddClick}>
              <AddBtnIcon className="w-4 h-4" />
              <span className="ml-2">{addButtonText}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Table Container */}
      <div className="border-line relative">
        <div style={{ overflowX: 'auto' }} data-table-container="true">
          <div className="min-w-full">
            {/* Table */}
            <table className={`w-full ${tableClassName} min-w-max`}>
              <thead className={`bg-surface-2/60 border-b border-line-soft ${headerClassName}`}>
                <tr>
                  {/* Select All Checkbox */}
                  {selectable && (
                    <th className="text-left p-2.5 w-10 sticky left-0 bg-surface-2/90 z-10">
                      <Checkbox.Root
                        id={checkAllId}
                        checked={selectAll}
                        onCheckedChange={handleSelectAll}
                        className="flex h-4 w-4 items-center cursor-pointer justify-center rounded border border-line bg-surface-1 hover:bg-surface-2 focus:outline-none data-[state=checked]:bg-accent-cyan data-[state=checked]:border-accent-cyan data-[state=checked]:text-[#04121a]"
                      >
                        <Checkbox.Indicator>
                          <Check className="h-3 w-3" />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                    </th>
                  )}

                  {columns.map((column, index) => (
                    <th
                      key={column.key || index}
                      className={`text-left p-0 text-[11px] uppercase tracking-[0.1em] font-medium text-ink-2 whitespace-nowrap ${column.headerClassName || ''} ${
                        index === 0 && !selectable ? 'sticky left-0 bg-surface-2' : ''
                      }`}
                      style={{
                        width: column.width || 'auto',
                        minWidth: column.minWidth || '100px',
                        position: 'relative',
                        zIndex: index === 0 && !selectable ? 10 : 1,
                      }}
                    >
                      <div
                        className={`w-full flex ${column.align === 'center' ? 'justify-center' : column.align === 'right' ? 'justify-end' : ''}`}
                      >
                        {column.accessor ? (
                          <DropdownMenuRadix
                            trigger={
                              <button className="flex items-center gap-1  px-4 py-1 rounded-md hover:bg-surface-3 transition-colors cursor-pointer">
                                <span className="truncate">{column.header}</span>

                                {getSortDirection(column.key) && (
                                  <span className="ml-1 flex-shrink-0">
                                    {getSortDirection(column.key) === 'asc' ? (
                                      <ArrowUp className="w-4 h-4 text-accent-cyan" />
                                    ) : (
                                      <ArrowDown className="w-4 h-4 text-accent-cyan" />
                                    )}
                                  </span>
                                )}

                                {/* Dropdown Arrow - Only show when column is NOT sorted */}
                                {!getSortDirection(column.key) && (
                                  <ChevronDown className="w-4 h-4 ml-1  flex-shrink-0 text-ink-2" />
                                )}
                              </button>
                            }
                            options={getSortDropdownOptions(column.key)}
                            side="bottom"
                            align="start"
                            sideOffset={4}
                          />
                        ) : (
                          <div className="px-2.5 py-1.5">
                            <span className="truncate">{column.header}</span>
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {getPaginationInfo.currentData.length === 0 && !loading ? (
                  <tr>
                    <td
                      colSpan={columns.length + (selectable ? 1 : 0)}
                      className="text-center p-8 text-ink-2"
                    >
                      {searchTerm ? `No results found matching "${searchTerm}"` : noDataText}
                    </td>
                  </tr>
                ) : (
                  getPaginationInfo.currentData.map((item, index) => (
                    <React.Fragment key={item.id}>
                      <tr
                        className={`border-b border-line-soft hover:bg-brand-wash/40 transition-colors ${rowClassName} ${
                          loading ? 'opacity-60 pointer-events-none' : ''
                        }`}
                        onClick={() => onRowClick(item)}
                      >
                        {selectable && (
                          <td className="p-2.5 sticky left-0 bg-white/90 z-10">
                            <Checkbox.Root
                              checked={selectedRows.has(item.id)}
                              onCheckedChange={() => handleRowSelect(item.id)}
                              className="flex h-4 w-4 items-center justify-center cursor-pointer rounded border border-line bg-surface-1 hover:bg-surface-2 focus:outline-none focus:ring-offset-1 data-[state=checked]:bg-accent-cyan data-[state=checked]:border-accent-cyan data-[state=checked]:text-[#04121a]"
                            >
                              <Checkbox.Indicator>
                                <Check className="h-3 w-3" />
                              </Checkbox.Indicator>
                            </Checkbox.Root>
                          </td>
                        )}

                        {columns.map((column, colIndex) => (
                          <td
                            key={column.key || colIndex}
                            className={`px-3 py-3 ${cellPadding} whitespace-nowrap ${column.cellClassName || ''} ${
                              colIndex === 0 && !selectable ? 'sticky left-0 bg-surface-1 z-10' : ''
                            }`}
                            style={{
                              minWidth: column.minWidth || '100px',
                            }}
                          >
                            <div
                              className={`${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : ''} ${
                                column.truncate !== false ? 'truncate' : ''
                              }`}
                              title={
                                column.accessor && typeof item[column.accessor] === 'string'
                                  ? item[column.accessor]
                                  : undefined
                              }
                            >
                              {column.render
                                ? column.render(item[column.accessor], item, index)
                                : item[column.accessor]}
                            </div>
                          </td>
                        ))}
                      </tr>
                      {isRowExpanded?.(item) && renderExpandedRow && (
                        <tr className="border-b border-line bg-surface-2/40">
                          <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-0">
                            {renderExpandedRow(item)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pagination && getPaginationInfo.totalItems > 0 && (
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 border-t border-line-soft">
            <div className="flex items-center justify-between md:justify-start gap-2 text-sm text-ink-1">
              <span className="whitespace-nowrap">Rows per page</span>
              <GlobalSelect
                value={rowsPerPage.toString()}
                onValueChange={handleRowsPerPageChange}
                options={rowsPerPageSelectOptions}
                size="small"
                width="w-20"
                triggerClassName="h-7"
              />
            </div>

            <div className="flex flex-col md:flex-row items-center gap-3">
              <span className="text-sm text-ink-1 whitespace-nowrap">
                {getPaginationInfo.startIndex} - {getPaginationInfo.endIndex} of{' '}
                {getPaginationInfo.totalItems}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(Math.max(1, getPaginationInfo.currentPage - 1))}
                  disabled={getPaginationInfo.currentPage === 1}
                  className="px-3 py-1 text-sm hover:bg-surface-3 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ‹
                </button>

                <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] md:max-w-none">
                  {Array.from({ length: Math.min(getPaginationInfo.totalPages, 5) }, (_, i) => {
                    let pageNum;
                    if (getPaginationInfo.totalPages <= 5) {
                      pageNum = i + 1;
                    } else {
                      const current = getPaginationInfo.currentPage;
                      const total = getPaginationInfo.totalPages;

                      if (current <= 3) {
                        pageNum = i + 1;
                      } else if (current >= total - 2) {
                        pageNum = total - 4 + i;
                      } else {
                        pageNum = current - 2 + i;
                      }
                    }

                    if (pageNum < 1 || pageNum > getPaginationInfo.totalPages) return null;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-[9px] cursor-pointer py-0.5 rounded text-sm whitespace-nowrap ${
                          getPaginationInfo.currentPage === pageNum
                            ? 'bg-surface-3'
                            : 'hover:bg-surface-3 text-ink-1'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() =>
                    handlePageChange(
                      Math.min(getPaginationInfo.totalPages, getPaginationInfo.currentPage + 1)
                    )
                  }
                  disabled={getPaginationInfo.currentPage === getPaginationInfo.totalPages}
                  className="px-3 py-1 text-sm hover:bg-surface-3 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataTable;
