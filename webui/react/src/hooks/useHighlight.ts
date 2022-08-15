import { useCallback, useState } from 'react';

import { defaultRowClassName } from 'components/Table';

export interface Highlights<RecordType> {
  focus: (id: number | null) => void;
  id: number | undefined;
  onMouseEnter: (event: React.MouseEvent, record: RecordType) => void;
  onMouseLeave: () => void;
  onTableRow: (record: RecordType) => void;
  rowClassName: (record: RecordType) => string;
}

type GetId<RecordType> = (record: RecordType) => number

function useHighlights<RecordType>(getId: GetId<RecordType>): Highlights<RecordType> {

  const [ highlightedId, setHighlightedId ] = useState<number>();

  const handleFocus = useCallback((id: number | null) => {
    setHighlightedId(id ?? undefined);
  }, []);

  const onMouseEnter = useCallback((event: React.MouseEvent, record: RecordType) => {
    if (getId(record)) setHighlightedId(getId(record));
  }, [ getId ]);

  const onMouseLeave = useCallback(() => {
    setHighlightedId(undefined);
  }, []);

  const onTableRow = useCallback((record: RecordType) => ({
    onMouseEnter: (event: React.MouseEvent) => onMouseEnter(event, record),
    onMouseLeave: () => onMouseLeave(),

  }), [ onMouseEnter, onMouseLeave ]);

  const rowClassName = useCallback((record: RecordType) => {
    return defaultRowClassName({
      clickable: false,
      highlighted: getId(record) === highlightedId,
    });
  }, [ highlightedId, getId ]);

  return {
    focus: handleFocus,
    id: highlightedId,
    onMouseEnter,
    onMouseLeave,
    onTableRow,
    rowClassName,
  };
}

export default useHighlights;
