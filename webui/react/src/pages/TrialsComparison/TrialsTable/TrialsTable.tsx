import { FilterDropdownProps } from 'antd/lib/table/interface';
import React, { MutableRefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { alphaNumericSorter, primitiveSorter } from 'utils/sort';

import HumanReadableNumber from 'components/HumanReadableNumber';
import InteractiveTable, { InteractiveTableSettings } from 'components/InteractiveTable';
import Link from 'components/Link';
import { defaultRowClassName, getPaginationConfig, MINIMUM_PAGE_SIZE } from 'components/Table';
import TableFilterRange from 'components/TableFilterRange';
import useSettings, { UpdateSettings } from 'hooks/useSettings';
import { TrialFilters } from 'pages/TrialsComparison/types';
import { HpValsMap } from 'pages/TrialsComparison/utils/trialData';
import { paths } from 'routes/utils';
import { V1AugmentedTrial } from 'services/api-ts-sdk';
import { Primitive, RawJson, RecordKey } from 'shared/types';
import { ColorScale, glasbeyColor } from 'shared/utils/color';
import { isNumber } from 'shared/utils/data';
import { alphaNumericSorter, numericSorter, primitiveSorter } from 'shared/utils/sort';
import { MetricName } from 'types';

import css from './TrialsTable.module.scss';
import settingsConfig, {
  CompareTableSettings,
} from './TrialsTable.settings';

interface Props {
  colorScale?: ColorScale[];
  containerRef: MutableRefObject<HTMLElement | null>,
  filteredTrialIdMap?: Record<number, boolean>;
  handleTableRowSelect?: (rowKeys: unknown) => void;
  highlightedTrialId?: number;
  hpVals: HpValsMap
  metrics: MetricName[];
  onFilterChange?: (filters: TrialFilters) => void;
  onMouseEnter?: (event: React.MouseEvent, record: V1AugmentedTrial) => void;
  onMouseLeave?: (event: React.MouseEvent, record: V1AugmentedTrial) => void;
  selectAllMatching: boolean;
  selectedTrialIds?: number[];
  selection?: boolean;
  trialIds: number[];
  trials: V1AugmentedTrial[];
}

export interface TrialMetrics {
  id: number;
  metrics: Record<RecordKey, Primitive>;
}

const TrialsTable: React.FC<Props> = ({
  highlightedTrialId,
  hpVals,
  onMouseEnter,
  onMouseLeave,
  trials,
  selection,
  handleTableRowSelect,
  onFilterChange,
  selectedTrialIds,
  selectAllMatching,
  metrics,
  trialIds,
  containerRef,
}: Props) => {
  // console.log(selectedTrialIds, trialIds);
  const [ pageSize, setPageSize ] = useState(MINIMUM_PAGE_SIZE);

  // PLACHOLDER, would actually be passed in
  const [ filters, setFilters ] = useState<RawJson>({});

  const { settings, updateSettings } = useSettings<CompareTableSettings>(settingsConfig);

  const columns = useMemo(() => {
    const idRenderer = (_: string, record: V1AugmentedTrial) => {

      const color = glasbeyColor(record.trialId);

      return (
        <div className={css.idLayout}>
          <div className={css.colorLegend} style={{ backgroundColor: color }} />
          <Link path={paths.trialDetails(record.trialId, record.experimentId)}>
            {record.trialId}
          </Link>
        </div>
      );
    };
    const idSorter = (
      a: V1AugmentedTrial,
      b: V1AugmentedTrial,
    ): number => alphaNumericSorter(a.trialId, b.trialId);
    const experimentIdSorter = (a: V1AugmentedTrial, b: V1AugmentedTrial): number =>
      alphaNumericSorter(a.experimentId, b.experimentId);
    const idColumn = {
      dataIndex: 'id',
      defaultWidth: 60,
      key: 'id',
      render: idRenderer,
      sorter: idSorter,
      title: 'Trial ID',
    };

    const metricsRenderer = (key: string) => {
      return (_: string, record: V1AugmentedTrial) => {
        if (record.validationMetrics && isNumber(record.validationMetrics[key])){
          const value = record.validationMetrics[key] as number;
          return <HumanReadableNumber num={value} />;
        }
        return '-' ;
      };
    };

    const metricsSorter = (key: string) => {
      return (recordA: V1AugmentedTrial, recordB: V1AugmentedTrial): number => {
        const a = recordA.validationMetrics[key] as Primitive;
        const b = recordB.validationMetrics[key] as Primitive;
        return primitiveSorter(a, b);
      };
    };

    const experimentIdColumn = {
      dataIndex: 'experimentId',
      defaultWidth: 60,
      key: 'experimentId',
      render: (_: string, record: V1AugmentedTrial) => (
        <Link path={paths.experimentDetails(record.experimentId)}>
          {record.experimentId}
        </Link>
      ),
      sorter: experimentIdSorter,
      title: 'Exp ID',
    };

    const hpRenderer = (key: string) => {
      return (_: string, record: V1AugmentedTrial) => {
        const value = record.hparams[key];

        if (isNumber(value)) {
          return <HumanReadableNumber num={value} />;
        } else if (!value) {
          return '-';
        }
        return value + '';
      };
    };
    const hpColumnSorter = (key: string) => {
      return (recordA: V1AugmentedTrial, recordB: V1AugmentedTrial): number => {
        const a = recordA.hparams[key] as Primitive;
        const b = recordB.hparams[key] as Primitive;
        return primitiveSorter(a, b);
      };
    };

    const hpFilterRange = (hp: string) => (filterProps: FilterDropdownProps) => {

      const handleHpRangeApply = (min: string, max: string) => {
        filters[hp] = { max, min };
      };

      const handleHpRangeReset = () => {
        filters[hp] = undefined;
        setFilters(filters);
      };

      return (
        <TableFilterRange
          {...filterProps}
          max={filters[hp]?.max}
          min={filters[hp]?.min}
          onReset={handleHpRangeReset}
          onSet={handleHpRangeApply}
        />
      );
    };

    const hpColumns = Object
      .keys(hpVals || {})
      .filter((hpParam) => hpVals[hpParam]?.size > 1)
      .map((key) => {
        return {
          dataIndex: key,
          defaultWidth: 60,
          filterDropdown: hpFilterRange(key),
          key,
          render: hpRenderer(key),
          sorter: hpColumnSorter(key),
          title: key,
        };
      });

    const metricsColumns = metrics
      .map((metric) => {
        const key = metric.name;
        return {
          dataIndex: key,
          defaultWidth: 60,
          key,
          render: metricsRenderer(key),
          sorter: metricsSorter(key),
          title: key,
        };
      });

    return [ idColumn, experimentIdColumn, ...hpColumns, ...metricsColumns ];
  }, [ hpVals, filters, metrics ]);

  useEffect(() => {
    updateSettings({
      columns: columns.map((c) => c.dataIndex),
      columnWidths: columns.map(() => 100),
    });
  }, [ columns, updateSettings ]);

  const handleTableChange = useCallback((tablePagination, tableFilters, tableSorter) => {
    setPageSize(tablePagination.pageSize);
  }, []);

  const handleTableRow = useCallback((record: V1AugmentedTrial) => ({
    onMouseEnter: (event: React.MouseEvent) => {
      if (onMouseEnter) onMouseEnter(event, record);
    },
    onMouseLeave: (event: React.MouseEvent) => {
      if (onMouseLeave) onMouseLeave(event, record);
    },
  }), [ onMouseEnter, onMouseLeave ]);

  const rowClassName = useCallback((record: V1AugmentedTrial) => {
    return defaultRowClassName({
      clickable: false,
      highlighted: record.trialId === highlightedTrialId,
    });
  }, [ highlightedTrialId ]);

  return (
    <InteractiveTable<V1AugmentedTrial>
      columns={columns}
      containerRef={containerRef}
      dataSource={trials}
      pagination={getPaginationConfig(trials.length, pageSize)}
      rowClassName={rowClassName}
      rowKey="trialId"
      rowSelection={selection ? {
        getCheckboxProps: () => {
          return { disabled: selectAllMatching };
        },
        onChange: handleTableRowSelect,
        preserveSelectedRowKeys: true,
        selectedRowKeys: selectAllMatching ? trialIds : selectedTrialIds,
      } : undefined}
      scroll={{ x: 1000 }}
      settings={settings as InteractiveTableSettings}
      showSorterTooltip={false}
      size="small"
      sortDirections={[ 'ascend', 'descend', 'ascend' ]}
      updateSettings={updateSettings as UpdateSettings<InteractiveTableSettings>}
      // onChange={handleTableChange}
      onRow={handleTableRow}
    />
  );
};

export default TrialsTable;
