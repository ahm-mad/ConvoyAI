// src/components/PaginatedList.jsx

import React, { useState, useRef, useEffect } from 'react';
import { Pagination } from '@mui/material';
import { usePaginatedQuery } from '@hooks/usePaginatedQuery';
import Loader from './Loader';

const PaginatedList = ({
  url,
  queryKey,
  limit = 10,
  search = '',
  otherParams = {},
  renderItem,
  enabled = true,
}) => {
  const [page, setPage] = useState(1);
  const previousDataRef = useRef(null);

  const { data, isLoading, isError } = usePaginatedQuery({
    key: queryKey,
    url,
    currentPage: page,
    limit,
    search,
    otherParams,
    enabled,
  });

  useEffect(() => {
    if (data) {
      previousDataRef.current = data;
    }
  }, [data]);

  const displayData = data || previousDataRef.current;

  const totalCount = displayData?.data?.total || 0;
  const totalPages = Math.ceil(totalCount / limit);

  const handleChange = (_, value) => {
    setPage(value);
  };

  if (isError) return <p>Something went wrong</p>;

  return (
    <div className="relative rounded-lg">
      {isLoading && (
        <div className="absolute top-2 left-2 z-10">
          <Loader />
        </div>
      )}

      <div className="space-y-2">{displayData?.data?.data?.map(item => renderItem(item))}</div>

      <Pagination
        count={totalPages}
        page={page}
        onChange={handleChange}
        sx={{ mt: 2, justifySelf: 'end' }}
      />
    </div>
  );
};

export default PaginatedList;
