// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import Button from './Button';
import GlobalInput from './Input';
import GlobalSelect from './RadixDropDown';
import { Check, ChevronDown, Search, ChevronUp, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import AddBtnIcon from '@assets/icons/MUIicons/AddBtnIcon';

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
  loading = false,
  loadingText = 'Loading...',
  noDataText = 'No data found.',
  className = '',
  tableClassName = '',
  headerClassName = 'bg-gray-50',
  rowClassName = 'hover:bg-gray-50',
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
}) => {
  // Stable data state to hold last successfully loaded data
  const [stableData, setStableData] = useState([]);
  const [stableTotalItems, setStableTotalItems] = useState(0);

  // Selection state
  const [selectedRows, setSelectedRows] = useState(new Set(selectedItems || []));
  const [selectAll, setSelectAll] = useState(false);

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState(null);
  const [bulkActionValue, setBulkActionValue] = useState('');
  const dropdownRefs = useRef({});

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

  useEffect(() => {
    const handleClickOutside = event => {
      if (openDropdown && dropdownRefs.current[openDropdown]) {
        if (!dropdownRefs.current[openDropdown].contains(event.target)) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);

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
      setOpenDropdown(null);
    },
    [onSort]
  );

  const toggleDropdown = useCallback(
    columnKey => {
      if (openDropdown === columnKey) {
        setOpenDropdown(null);
      } else {
        setOpenDropdown(columnKey);
      }
    },
    [openDropdown]
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

  return (
    <div className={`w-full bg-white ${className}`}>
      {/* Controls Section */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 p-3 bg-gray-50 border-b border-gray-200 relative z-50">
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
              {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-600 flex-shrink-0" />}
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
            <Button
              id={addButtonId}
              sx={{ borderRadius: '6px', width: '100%' }}
              onClick={onAddClick}
            >
              <AddBtnIcon className="w-4 h-4" />
              <span className="ml-2">{addButtonText}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Table Container */}
      <div className="border-gray-200 relative z-10" style={{ overflow: 'visible' }}>
        <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <div className="min-w-full">
            {/* Table */}
            <table className={`w-full ${tableClassName} min-w-max`}>
              <thead className={`border-b border-gray-200 ${headerClassName}`}>
                <tr>
                  {/* Select All Checkbox */}
                  {selectable && (
                    <th className="text-left p-4 w-12 border-r border-gray-200 sticky left-0 bg-gray-50 z-10">
                      <Checkbox.Root
                        id={checkAllId}
                        checked={selectAll}
                        onCheckedChange={handleSelectAll}
                        className="flex h-4 w-4 items-center cursor-pointer justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 focus:outline-none data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white"
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
                      className={`text-left p-0 text-sm border font-medium text-gray-700 border-r border-gray-200 whitespace-nowrap ${column.headerClassName || ''} ${
                        index === 0 && !selectable ? 'sticky left-0 bg-gray-50' : ''
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
                        <div
                          onClick={column.accessor ? () => toggleDropdown(column.key) : undefined}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md ${column.accessor ? 'cursor-pointer px-4 py-1 hover:bg-gray-100 transition-colors' : ''}`}
                          ref={
                            column.accessor
                              ? el => (dropdownRefs.current[column.key] = el)
                              : undefined
                          }
                        >
                          <span className="truncate">{column.header}</span>

                          {column.accessor && getSortDirection(column.key) && (
                            <span className="ml-1 flex-shrink-0">
                              {getSortDirection(column.key) === 'asc' ? (
                                <ArrowUp className="w-4 h-4 text-blue-600" />
                              ) : (
                                <ArrowDown className="w-4 h-4 text-blue-600" />
                              )}
                            </span>
                          )}

                          {/* Dropdown Arrow - Only show when column is NOT sorted */}
                          {column.accessor && !getSortDirection(column.key) && (
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ml-1 flex-shrink-0 ${
                                openDropdown === column.key ? 'rotate-180' : ''
                              } text-gray-400`}
                            />
                          )}

                          {column.accessor && openDropdown === column.key && (
                            <div
                              className="bg-white border border-gray-200 rounded-md shadow-lg min-w-[120px]"
                              style={{
                                position: 'fixed',
                                zIndex: 99999,
                                top:
                                  dropdownRefs.current[column.key]?.getBoundingClientRect().bottom +
                                    4 || 0,
                                left:
                                  dropdownRefs.current[column.key]?.getBoundingClientRect().left ||
                                  0,
                              }}
                            >
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  handleSort(column.key, 'asc');
                                }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${
                                  getSortDirection(column.key) === 'asc'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-700'
                                }`}
                              >
                                <ChevronUp className="w-3 h-3" />
                                Asc
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  handleSort(column.key, 'desc');
                                }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${
                                  getSortDirection(column.key) === 'desc'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-700'
                                }`}
                              >
                                <ChevronDown className="w-3 h-3" />
                                Desc
                              </button>
                            </div>
                          )}
                        </div>
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
                      className="text-center p-8 text-gray-500"
                    >
                      {searchTerm ? `No results found matching "${searchTerm}"` : noDataText}
                    </td>
                  </tr>
                ) : (
                  getPaginationInfo.currentData.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-200 ${rowClassName} ${
                        loading ? 'opacity-60 pointer-events-none' : ''
                      }`}
                      onClick={() => onRowClick(item)}
                    >
                      {selectable && (
                        <td className="p-4 border-r border-gray-200 sticky left-0 bg-white z-10">
                          <Checkbox.Root
                            checked={selectedRows.has(item.id)}
                            onCheckedChange={() => handleRowSelect(item.id)}
                            className="flex h-4 w-4 items-center justify-center cursor-pointer rounded border border-gray-300 bg-white hover:bg-gray-50 focus:outline-none focus:ring-offset-1 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white"
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
                          className={`px-3 py-2 ${cellPadding} border-r border-gray-200 whitespace-nowrap ${column.cellClassName || ''} ${
                            colIndex === 0 && !selectable ? 'sticky left-0 bg-white z-10' : ''
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pagination && getPaginationInfo.totalItems > 0 && (
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 border-t border-gray-200">
            <div className="flex items-center justify-between md:justify-start gap-2 text-sm text-gray-600">
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
              <span className="text-sm text-gray-600 whitespace-nowrap">
                {getPaginationInfo.startIndex} - {getPaginationInfo.endIndex} of{' '}
                {getPaginationInfo.totalItems}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(Math.max(1, getPaginationInfo.currentPage - 1))}
                  disabled={getPaginationInfo.currentPage === 1}
                  className="px-3 py-1 text-sm hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
                            ? 'bg-[#eceef2]'
                            : 'hover:bg-gray-100 text-gray-700'
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
                  className="px-3 py-1 text-sm hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
