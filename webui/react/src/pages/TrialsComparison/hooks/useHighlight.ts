import { useCallback, useMemo, useState } from 'react';

interface Highlights<RecordType> {
  focus: (id: number | null) => void;
  id: number | undefined;
  mouseEnter: (event: React.MouseEvent, record: RecordType) => void;
  mouseLeave: (event: React.MouseEvent, record: RecordType) => void;
}

type GetId<RecordType> = (record: RecordType) => number

function useHighlights<RecordType>(getId: GetId<RecordType>): Highlights<RecordType> {

  const [ highlightedId, setHighlightedId ] = useState<number>();

  const handleFocus = useCallback((id: number | null) => {
    setHighlightedId(id ?? undefined);
  }, []);

  const handleMouseEnter = useCallback((event: React.MouseEvent, record: RecordType) => {
    if (getId(record)) setHighlightedId(getId(record));
  }, [ getId ]);

  const handleMouseLeave = useCallback(() => {
    setHighlightedId(undefined);
  }, []);

  return useMemo(() => ({
    focus: handleFocus,
    id: highlightedId,
    mouseEnter: handleMouseEnter,
    mouseLeave: handleMouseLeave,
  }), [ handleFocus, handleMouseEnter, handleMouseLeave, highlightedId ]);
}

export default useHighlights;
