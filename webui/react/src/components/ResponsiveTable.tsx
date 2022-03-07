// @ts-nocheck
import { Table } from 'antd';
import { SpinProps } from 'antd/es/spin';
import { TableProps } from 'antd/es/table';
import { SorterResult } from 'antd/es/table/interface';
import { createContext, useEffect, useRef, useState, useContext } from 'react';
import useResize from 'hooks/useResize';
import Spinner from './Spinner';

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Comparable = any;
const RowContext = createContext({});
interface Settings {
  sortDesc: boolean;
  sortKey: Comparable;
  tableLimit: number;
  tableOffset: number;
}

/* eslint-disable-next-line @typescript-eslint/ban-types */
type ResponsiveTable = <T extends object>(props: TableProps<T>) => JSX.Element;


const Row = ({
  className,
  children,
  record,
  isRowRightClickable,
  DropdownComponent,
  areRowsSelected,
  ...props
}) => {

  const [rowHovered, setRowHovered] = useState(false);
  const [rightClickableCellHovered, setRightClickableCellHovered] = useState(false);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  
  if (areRowsSelected) {
    return <tr className={className} {...props }>{children}</tr>;
  }

  const rightClickableCellProps = {
    onMouseEnter: () => setRightClickableCellHovered(true),
    onMouseLeave: () => setRightClickableCellHovered(false),
    onContextMenu: (e) => e.stopPropagation(),
  };

  const rowContextMenuActive =
    (rowHovered && !rightClickableCellHovered) || contextMenuOpened;

  return record ? (
    <RowContext.Provider value={{ rightClickableCellProps }}>
      <DropdownComponent record={record} onVisibleChange={setContextMenuOpened}>
        <tr
          onMouseEnter={() => setRowHovered(true)}
          onMouseLeave={() => setRowHovered(false)}
          className={rowContextMenuActive ? `${className} ant-table-row-selected` :className}
          {...props}
        >
          {children}
        </tr>
      </DropdownComponent>
    </RowContext.Provider>
  ) : (
    <tr {...{ className, children, ...props }} />
  );
}

const Cell = ({ children, isCellRightClickable,...props }) => {
  if (!isCellRightClickable) return <td {...props}>{children}</td>;
  const { rightClickableCellProps } = useContext(RowContext)
  return (
    <td {...props}>
      <div {...rightClickableCellProps}>
        {children}
      </div>
    </td>
  );
}


export const handleTableChange = (
  columns: {key?: Comparable}[],
  settings: Settings,
  updateSettings: (s: Settings, b: boolean) => void,
) => {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (tablePagination: any, tableFilters: any, tableSorter: any): void => {
    if (Array.isArray(tableSorter)) return;

    const { columnKey, order } = tableSorter as SorterResult<unknown>;
    if (!columnKey || !columns.find(column => column.key === columnKey)) return;

    const newSettings = {
      sortDesc: order === 'descend',
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      sortKey: columnKey as any,
      tableLimit: tablePagination.pageSize,
      tableOffset: (tablePagination.current - 1) * tablePagination.pageSize,
    };
    const shouldPush = settings.tableOffset !== newSettings.tableOffset;
    updateSettings(newSettings, shouldPush);
  };
};

const ResponsiveTable: ResponsiveTable = ({
  loading,
  scroll,
  areRowsRightClickable,
  DropdownComponent,
  areRowsSelected,
  ...props
}) => {
  const [ hasScrollBeenEnabled, setHasScrollBeenEnabled ] = useState<boolean>(false);
  const [ tableScroll, setTableScroll ] = useState(scroll);
  const tableRef = useRef<HTMLDivElement>(null);
  const resize = useResize(tableRef);
  const spinning = !!(loading as SpinProps)?.spinning || loading === true;

  useEffect(() => {
    if (!tableRef.current || resize.width === 0) return;

    const tables = tableRef.current.getElementsByTagName('table');
    if (tables.length === 0) return;

    const rect = tables[0].getBoundingClientRect();

    /*
     * ant table scrolling has an odd behaviour. If scroll.x is set to 'max-content' initially
     * it will show the scroll bar. We need to set it to undefined the first time if scrolling
     * is not needed, and 'max-content' if we want to disable scrolling after it has been displayed.
     */
    let scrollX: 'max-content'|undefined|number = (
      hasScrollBeenEnabled ? 'max-content' : undefined
    );
    if (rect.width > resize.width) {
      scrollX = rect.width;
      setHasScrollBeenEnabled(true);
    }

    setTableScroll({
      x: scrollX,
      y: scroll?.y,
    });
  }, [ hasScrollBeenEnabled, resize, scroll ]);


  return (
    <div ref={tableRef}>
      <Spinner spinning={spinning}>
        <Table
          onRow={(record) => ({
            record,
            // areRowsRightClickable,
            areRowsSelected,
            DropdownComponent,
          })} // put the record in the row props so RightClickableRow can grab it
          components={
            areRowsRightClickable && {
              body: {
                row: Row,
                cell: Cell,
              },
            }
          }
          scroll={tableScroll}
          tableLayout="auto"
          {...props}
        />
      </Spinner>
    </div>
  );
};

export default ResponsiveTable;
