// @ts-nocheck
import { Table } from 'antd';
import { SpinProps } from 'antd/es/spin';
import { TableProps } from 'antd/es/table';
import { ColumnsType, ColumnType, SorterResult } from 'antd/es/table/interface';
import useResize from 'hooks/useResize';
import { DEFAULT_COLUMN_WIDTHS, Settings } from 'pages/ExperimentList.settings';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import 'antd/dist/antd.min.css';
import { useDrag, useDragLayer, useDrop } from 'react-dnd';
import { DraggableCore } from 'react-draggable';
import { throttle } from 'throttle-debounce';
import {
  ExperimentItem,
} from 'types';

import css from './InteractiveTable.module.scss';
import Spinner from './Spinner';

const DEFAULT_RESIZE_THROTTLE_TIME = 10;

const type = 'DraggableColumn';

type ResizeCallback = ((e: React.SyntheticEvent, data: ResizeCallbackData) => void) | undefined;

type DndItem = {
  index?: number;
}
interface ContextMenuProps {
  onVisibleChange: (visible: boolean) => void;
  record: Record<string, unknown>;
}

interface ColumnDef<RecordType> extends ColumnType<RecordType> {
  isFiltered?: (s: Settings) => boolean;
}
export type ColumnDefs<ColumnName extends string, RecordType> = Record<
  ColumnName,
  ColumnDef<RecordType>
>;

interface InteractiveTableProps<RecordType> extends TableProps<RecordType> {
  ContextMenu?: React.FC<ContextMenuProps>;
  areRowsRightClickable?: boolean;
  areRowsSelected?: boolean;
  columnSpec: ColumnDefs<string, RecordType>;
  settings: Settings;
  updateSettings: (settings: Partial<Settings>, shouldPush?: boolean) => void;
}

/* eslint-disable-next-line @typescript-eslint/ban-types */
type InteractiveTable = <T extends object>(props: InteractiveTableProps<T>) => JSX.Element;

// enum DragState {
//   NotDragging,
//   DraggingRight,
//   DraggingLeft,
// }
interface RowProps {
  ContextMenu: React.FC<ContextMenuProps>;
  areRowsSelected?: boolean;
  children?: React.ReactNode;
  className?: string;
  record: Record<string, unknown>;
}

interface HeaderCellProps {
  className: string;
  columnName: string;
  filterActive: boolean;
  index: number;
  moveColumn: (source: number, destination: number) => void;
  onResize: ResizeCallback;
  onResizeStart: ResizeCallback;
  onResizeStop: ResizeCallback;
  title: unknown;
  width: number;
}

interface CellProps {
  children?: React.ReactNode;
  isCellRightClickable?: boolean;
}

const RightClickableRowContext = createContext({});

const Row = ({
  className,
  children,
  record,
  ContextMenu,
  areRowsSelected,
  ...props
}: RowProps) => {
  const classes = [ className, css.row ];

  const [ rowHovered, setRowHovered ] = useState(false);
  const [ rightClickableCellHovered, setRightClickableCellHovered ] = useState(false);
  const [ contextMenuOpened, setContextMenuOpened ] = useState(false);

  if (areRowsSelected) {
    return <tr className={classes.join(' ')} {...props}>{children}</tr>;
  }

  const rightClickableCellProps = {
    onContextMenu: (e : React.MouseEvent) => e.stopPropagation(),
    onMouseEnter: () => setRightClickableCellHovered(true),
    onMouseLeave: () => setRightClickableCellHovered(false),
  };

  const rowContextMenuTriggerableOrOpen =
    (rowHovered && !rightClickableCellHovered) || contextMenuOpened;

  if (rowContextMenuTriggerableOrOpen) {
    classes.push('ant-table-row-selected');
  }
  return record ? (
    <RightClickableRowContext.Provider value={{ ...rightClickableCellProps }}>
      <ContextMenu record={record} onVisibleChange={setContextMenuOpened}>
        <tr
          className={
            classes.join(' ')
          }
          onMouseEnter={() => setRowHovered(true)}
          onMouseLeave={() => setRowHovered(false)}
          {...props}>
          {children}
        </tr>
      </ContextMenu>
    </RightClickableRowContext.Provider>
  ) : (
    <tr className={classes.join(' ')} {...props}>{children}</tr>
  );
};

const Cell = ({ children, className, isCellRightClickable, ...props }: CellProps) => {
  const rightClickableCellProps = useContext(RightClickableRowContext);
  const classes = [ className, css.cell ];
  if (!isCellRightClickable) return <td className={classes.join(' ')} {...props}>{children}</td>;
  return (
    <td className={classes.join(' ')} {...props}>
      <div className={css.rightClickableCellWrapper} {...rightClickableCellProps}>
        {children}
      </div>
    </td>
  );
};

const HeaderCell = ({
  onResize,
  onResizeStart,
  onResizeStop,
  width,
  className,
  columnName,
  filterActive,
  moveColumn,
  index,
  title: unusedTitleFromAntd,
  isResizing,
  dropRightStyle,
  dropLeftStyle,
  dragState,
  ...props
}: HeaderCellProps) => {
  const resizingRef = useRef<HTMLDivElement>(null);

  const headerCellClasses = [ css.headerCell ];
  const dropTargetClasses = [ css.dropTarget ];
  const [ , drag ] = useDrag({
    canDrag: () => !isResizing,
    item: { index },
    type,
  });

  const [ { isOver, dropClassName }, drop ] = useDrop({
    accept: type,
    collect: (monitor) => {
      const dragItem = (monitor.getItem() || {}); // as DndItem;
      const dragIndex = dragItem?.index;
      if (dragIndex == null || dragIndex === index) {
        return {};
      }
      return {
        dropClassName: dragIndex > index ? css.dropOverLeftward : css.dropOverRightward,
        isOver: monitor.isOver(),
      };
    },
    drop: (item: DndItem) => {
      if (item.index != null) {
        moveColumn(item.index, index);
      }
    },
  });

  if (isOver) {
    headerCellClasses.push(dropClassName ?? '');
    dropTargetClasses.push(css.dropTargetActive);
  }
  if (filterActive) headerCellClasses.push(css.headerFilterOn);

  if (!columnName) {
    return <th className={className} {...props} />;
  }

  const tableCell = (
    <th
      className={headerCellClasses.join(' ')}>
      <div
        className={`${className} ${css.columnDraggingDiv}`}
        ref={drag}
        title={columnName}
        onClick={(e) => e.stopPropagation()}
        {...props}
      />
      <DraggableCore
        nodeRef={resizingRef}
        onDrag={onResize}
        onStart={onResizeStart}
        onStop={onResizeStop}>
        <span
          className={css.columnResizeHandle}
          ref={resizingRef}
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
      </DraggableCore>
      <span
        className={dropTargetClasses.join(' ')}
        ref={drop}
        style={
          dragState === 'draggingRight'
            ? dropRightStyle
            : dragState === 'draggingLeft'
              ? dropLeftStyle
              : {}
        }
      />
    </th>
  );
  return tableCell;
};

const InteractiveTable: InteractiveTable = ({
  loading,
  scroll,
  dataSource,
  columnSpec,
  settings,
  updateSettings,
  areRowsRightClickable,
  ContextMenu,
  areRowsSelected,
  ...props
}) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [ widthData, setWidthData ] = useState({ widths: settings?.columnWidths });
  const [ isResizing, setIsResizing ] = useState(false);

  const { dragState } = useDragLayer((monitor) => {
    const deltaX = monitor.getDifferenceFromInitialOffset()?.x;
    const dragState = deltaX > 0 ? 'draggingRight' : deltaX < 0 ? 'draggingLeft' : 'notDragging';
    return ({ dragState });
  });

  const spinning = !!(loading as SpinProps)?.spinning || loading === true;

  useEffect(() => {

    const tableWidth = tableRef.current
      .getElementsByTagName('table')
      ?.[0].getBoundingClientRect()
      .width;

    const widths = settings.columnWidths;
    const sumOfWidths = widths.reduce((a, b) => a + b);
    const scalingFactor = tableWidth / sumOfWidths * .9;
    const dropRightStyles = widths.map((w, i) => ({
      left: `${(w / 2) * scalingFactor}px`,
      width: `${(w + (widths[i + 1] ?? 0)) * (scalingFactor / 2)}px`,
    }));
    const dropLeftStyles = widths.map((w, i) => ({
      left: `${-((widths[i - 1] ?? 0) / 2) * scalingFactor}px`,
      width: `${(w + (widths[i - 1] ?? 0)) * (scalingFactor / 2)}px`,
    }));
    setWidthData({ dropLeftStyles, dropRightStyles, widths });
  }, [
    settings.columnWidths,
  ]);

  const handleChange = useCallback(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (tablePagination: any, tableFilters: any, tableSorter: any): void => {
      if (Array.isArray(tableSorter)) return;

      const { columnKey, order } = tableSorter as SorterResult<unknown>;
      if (!columnKey || !settings.columns.find((col) => columnSpec[col]?.key === columnKey)) return;

      const newSettings = {
        sortDesc: order === 'descend',
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        sortKey: columnKey as any,
        tableLimit: tablePagination.pageSize,
        tableOffset: (tablePagination.current - 1) * tablePagination.pageSize,
      };
      const shouldPush = settings.tableOffset !== newSettings.tableOffset;
      updateSettings(newSettings, shouldPush);
    },
    [ settings, updateSettings, columnSpec ],
  );

  const moveColumn = useCallback(
    (fromIndex, toIndex) => {
      const reorderedColumns = [ ...settings.columns ];
      const reorderedWidths = [ ...settings.columnWidths ];
      const col = reorderedColumns.splice(fromIndex, 1)[0];
      const width = reorderedWidths.splice(fromIndex, 1)[0];
      reorderedColumns.splice(toIndex, 0, col);
      reorderedWidths.splice(toIndex, 0, width);
      updateSettings({ columns: reorderedColumns, columnWidths: reorderedWidths });
    },
    [ settings.columns, settings.columnWidths, updateSettings ],
  );

  const handleResize = useCallback(
    (index) => {
      return throttle(
        DEFAULT_RESIZE_THROTTLE_TIME,
        (e: Event, { x }: ResizeCallbackData) => {
          setWidthData(({ widths: prevWidths }) => {
            const column = settings.columns[index];
            const minWidth = DEFAULT_COLUMN_WIDTHS[column] * 0.70;
            if (x < minWidth) {
              return {
                widths: prevWidths.map((w: number, i: number) =>
                  index === i ? minWidth : w),
              };
            }
            const newWidth = x;
            const newWidths = prevWidths.map((w: number, i: number) =>
              index === i ? newWidth : w);
            return { widths: newWidths };

          });
        },
      );
    },
    [ settings.columns ],
  );

  const handleResizeStart = useCallback(
    (index) =>
      (e, { x }) => {
        setIsResizing(true);
        const column = settings.columns[index];
        const startWidth = settings.columnWidths[index];
        const minWidth = DEFAULT_COLUMN_WIDTHS[column] * 0.7;
        const deltaX = startWidth - minWidth;
        const minX = x - deltaX;
        setWidthData(({ widths }) => ({ minX, widths }));
      },
    [ setWidthData, settings.columns, settings.columnWidths ],
  );

  const handleResizeStop = useCallback(
    () => {
      const newWidths = widthData.widths.map(Math.floor);

      // const tables = tableRef.current.getElementsByTagName('table');
      // if (tables.length) {
      //   const sumOfWidths = newWidths.reduce((a, b) => a + b);
      //   const tableWidth = tables[0].getBoundingClientRect().width;
      //   if (sumOfWidths < tableWidth) {
      //   const scaleUp = tableWidth / sumOfWidths;
      //   newWidths = newWidths.map(w => w * scaleUp);
      //   }
      // }
      setIsResizing(false);
      setWidthData({ widths: newWidths });
      updateSettings({ columnWidths: newWidths });

    },
    [ updateSettings, widthData, setWidthData ],
  );

  const onHeaderCell = useCallback(
    (index, columnSpec) => {
      return () => {
        const filterActive = !!columnSpec?.isFiltered?.(settings);
        return {
          columnName: columnSpec.title,
          dragState,
          dropLeftStyle: { ...widthData?.dropLeftStyles?.[index] },
          dropRightStyle: { ...widthData?.dropRightStyles?.[index] },
          filterActive,
          index,
          isResizing,
          moveColumn,
          onResize: handleResize(index),
          onResizeStart: handleResizeStart(index),
          onResizeStop: handleResizeStop,
          width: widthData?.widths[index],
        };
      };
    },
    [
      handleResize,
      handleResizeStop,
      widthData,
      moveColumn,
      settings,
      handleResizeStart,
      dragState,
      isResizing,
    ],
  );

  const renderColumns: ColumnsType<ExperimentItem> = useMemo(
    () => [
      ...settings.columns.map((columnName, index) => {
        const column = columnSpec[columnName];
        const columnWidth = widthData.widths[index];
        const sortOrder =
          column.key === settings.sortKey ? (settings.sortDesc ? 'descend' : 'ascend') : null;

        return {
          onHeaderCell: onHeaderCell(index, column),
          sortOrder,
          width: columnWidth,
          ...column,
        };
      }, columnSpec.action) as ColumnsType<ExperimentItem>,
    ],
    [ settings.columns, widthData, settings.sortKey, settings.sortDesc, columnSpec, onHeaderCell ],
  );

  const components = {
    body: {
      cell: Cell,
      row: Row,
    },
    header: { cell: HeaderCell },
  };
  return (
    <div ref={tableRef}>
      <Spinner spinning={spinning}>
        <Table
          bordered
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          columns={renderColumns as ColumnsType<any>}
          components={components}
          dataSource={dataSource}
          tableLayout="fixed"
          onChange={handleChange}
          onRow={(record, index) => ({
            areRowsSelected,
            ContextMenu,
            index,
            record,
          } as React.HTMLAttributes<HTMLElement>)}
          {...props}
        />
      </Spinner>
    </div>
  );
};

export default InteractiveTable;
