import { FilterDropdownProps } from 'antd/lib/table/interface';
import React, { MutableRefObject, useCallback, useEffect, useMemo, useState } from 'react';

import HumanReadableNumber from 'components/HumanReadableNumber';
import InteractiveTable, { InteractiveTableSettings } from 'components/InteractiveTable';
import Link from 'components/Link';
import MetricBadgeTag from 'components/MetricBadgeTag';
import { defaultRowClassName, getPaginationConfig, MINIMUM_PAGE_SIZE } from 'components/Table';
import TableFilterRange from 'components/TableFilterRange';
import useSettings, { UpdateSettings } from 'hooks/useSettings';
import { paths } from 'routes/utils';
import { Primitive, RawJson, RecordKey } from 'shared/types';
import { ColorScale, glasbeyColor, rgba2str, rgbaFromGradient,
  str2rgba } from 'shared/utils/color';
import { isNumber } from 'shared/utils/data';
import { alphaNumericSorter, numericSorter, primitiveSorter } from 'shared/utils/sort';
import {
  HyperparametersFlattened, HyperparameterType, MetricName,
} from 'types';

import { HpValsMap } from '../TrialsComparison';

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
  hyperparameters: HyperparametersFlattened;
  metric: MetricName;
  metrics: MetricName[];
  onMouseEnter?: (event: React.MouseEvent, record: TrialHParams) => void;
  onMouseLeave?: (event: React.MouseEvent, record: TrialHParams) => void;
  selectDisabled: boolean;
  selectedRowKeys?: number[];
  selection?: boolean;
  trialHps: TrialHParams[];
  trialIds: number[];

}

export interface TrialHParams {
  experimentId: number,
  hparams: Record<RecordKey, Primitive>;
  id: number;
  metric: number | null;
  metrics: Record<RecordKey, Primitive>
}

export interface TrialMetrics {
  id: number;
  metrics: Record<RecordKey, Primitive>;
}

const CompareTable: React.FC<Props> = ({
  colorScale,
  filteredTrialIdMap,
  hyperparameters,
  highlightedTrialId,
  hpVals,
  metric,
  onMouseEnter,
  onMouseLeave,
  trialHps,
  trialIds,
  selectDisabled,
  selection,
  handleTableRowSelect,
  selectedRowKeys,
  metrics,
  containerRef,
}: Props) => {
  const [ pageSize, setPageSize ] = useState(MINIMUM_PAGE_SIZE);

  // PLACHOLDER, would actually be passed in
  const [ filters, setFilters ] = useState<RawJson>({});
  console.log({ filters });

  const { settings, updateSettings } = useSettings<CompareTableSettings>(settingsConfig);
  const dataSource = useMemo(() => {
    if (!filteredTrialIdMap) return trialHps;
    return trialHps.filter((trial) => filteredTrialIdMap[trial.id]);
  }, [ filteredTrialIdMap, trialHps ]);

  const columns = useMemo(() => {
    const idRenderer = (_: string, record: TrialHParams) => {
      const index = trialIds.findIndex((trialId) => trialId === record.id);
      let color = index !== -1 ? glasbeyColor(index) : 'rgba(0, 0, 0, 1.0)';
      if (record.metric != null && colorScale) {
        const scaleRange = colorScale[1].scale - colorScale[0].scale;
        const distance = (record.metric - colorScale[0].scale) / scaleRange;
        const rgbaMin = str2rgba(colorScale[0].color);
        const rgbaMax = str2rgba(colorScale[1].color);
        color = rgba2str(rgbaFromGradient(rgbaMin, rgbaMax, distance));
      }
      return (
        <div className={css.idLayout}>
          <div className={css.colorLegend} style={{ backgroundColor: color }} />
          <Link path={paths.trialDetails(record.id, record.experimentId)}>
            {record.id}
          </Link>
        </div>
      );
    };
    const idSorter = (a: TrialHParams, b: TrialHParams): number => alphaNumericSorter(a.id, b.id);
    const experimentIdSorter = (a: TrialHParams, b: TrialHParams): number =>
      alphaNumericSorter(a.experimentId, b.experimentId);
    const idColumn = {
      dataIndex: 'id',
      defaultWidth: 60,
      key: 'id',
      render: idRenderer,
      sorter: idSorter,
      title: 'Trial ID',
    };

    const metricRenderer = (_: string, record: TrialHParams) => {
      return <HumanReadableNumber num={record.metric} />;
    };

    const metricsRenderer = (key: string) => {
      return (_: string, record: TrialHParams) => {
        if (record.metrics && isNumber(record.metrics[key])){
          const value = record.metrics[key] as number;
          return <HumanReadableNumber num={value} />;
        }
        return '-' ;
      };
    };

    const metricsSorter = (key: string) => {
      return (recordA: TrialHParams, recordB: TrialHParams): number => {
        const a = recordA.metrics[key] as Primitive;
        const b = recordB.metrics[key] as Primitive;
        return primitiveSorter(a, b);
      };
    };

    const metricSorter = (recordA: TrialHParams, recordB: TrialHParams): number => {
      return numericSorter(recordA.metric ?? undefined, recordB.metric ?? undefined);
    };

    const metricColumn = {
      dataIndex: 'metric',
      defaultWidth: 60,
      key: 'metric',
      render: metricRenderer,
      sorter: metricSorter,
      title: <MetricBadgeTag metric={metric} />,
    };

    const experimentIdColumn = {
      dataIndex: 'experimentId',
      defaultWidth: 60,
      key: 'experimentId',
      render: (_: string, record: TrialHParams) => (
        <Link path={paths.experimentDetails(record.experimentId)}>
          {record.experimentId}
        </Link>
      ),
      sorter: experimentIdSorter,
      title: 'Exp ID',
    };

    const hpRenderer = (key: string) => {
      return (_: string, record: TrialHParams) => {
        const value = record.hparams[key];
        const type = hyperparameters[key].type;
        const isValidType = [
          HyperparameterType.Constant,
          HyperparameterType.Double,
          HyperparameterType.Int,
          HyperparameterType.Log,
        ].includes(type);
        if (isNumber(value) && isValidType) {
          return <HumanReadableNumber num={value} />;
        } else if (!value) {
          return '-';
        }
        return value + '';
      };
    };
    const hpColumnSorter = (key: string) => {
      return (recordA: TrialHParams, recordB: TrialHParams): number => {
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
      .keys(hyperparameters || {})
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
      .filter((metricEntry) => metricEntry.name !== metric.name)
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

    return [ idColumn, experimentIdColumn, metricColumn, ...hpColumns, ...metricsColumns ];
  }, [ colorScale, hyperparameters, metric, trialIds, hpVals, filters, metrics ]);

  useEffect(() => {
    updateSettings({
      columns: columns.map((c) => c.dataIndex),
      columnWidths: columns.map(() => 100),
    });
  }, [ columns, updateSettings ]);

  const handleTableChange = useCallback((tablePagination, tableFilters, tableSorter) => {
    console.log(tablePagination, tableFilters, tableSorter);
    setPageSize(tablePagination.pageSize);
  }, []);

  const handleTableRow = useCallback((record: TrialHParams) => ({
    onMouseEnter: (event: React.MouseEvent) => {
      if (onMouseEnter) onMouseEnter(event, record);
    },
    onMouseLeave: (event: React.MouseEvent) => {
      if (onMouseLeave) onMouseLeave(event, record);
    },
  }), [ onMouseEnter, onMouseLeave ]);

  const rowClassName = useCallback((record: TrialHParams) => {
    return defaultRowClassName({
      clickable: false,
      highlighted: record.id === highlightedTrialId,
    });
  }, [ highlightedTrialId ]);

  return (
    <InteractiveTable<TrialHParams>
      columns={columns}
      containerRef={containerRef}
      dataSource={dataSource}
      pagination={getPaginationConfig(dataSource.length, pageSize)}
      rowClassName={rowClassName}
      rowKey="id"
      rowSelection={selection ? {
        getCheckboxProps: () => {
          return { disabled: selectDisabled };
        },
        onChange: handleTableRowSelect,
        preserveSelectedRowKeys: true,
        selectedRowKeys,
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

export default CompareTable;
