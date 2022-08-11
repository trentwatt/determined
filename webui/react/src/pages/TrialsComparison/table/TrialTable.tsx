import { FilterDropdownProps } from 'antd/lib/table/interface';
import React, { MutableRefObject, useCallback, useEffect, useMemo } from 'react';

import BadgeTag from 'components/BadgeTag';
import HumanReadableNumber from 'components/HumanReadableNumber';
import InteractiveTable, { InteractiveTableSettings } from 'components/InteractiveTable';
import Link from 'components/Link';
import MetricBadgeTag from 'components/MetricBadgeTag';
import { defaultRowClassName, getPaginationConfig } from 'components/Table';
import TableFilterDropdown from 'components/TableFilterDropdown';
import TableFilterSearch from 'components/TableFilterSearch';
import useSettings, { UpdateSettings } from 'hooks/useSettings';
import { TrialFilters } from 'pages/TrialsComparison/utils/collections';
import { HpValsMap } from 'pages/TrialsComparison/utils/data';
import { paths } from 'routes/utils';
import { V1AugmentedTrial, V1TrialSorter } from 'services/api-ts-sdk';
import { Primitive, RecordKey } from 'shared/types';
import { ColorScale, glasbeyColor } from 'shared/utils/color';
import { isNumber } from 'shared/utils/data';
import { Metric, MetricType } from 'types';
import { metricKeyToName, metricToKey } from 'utils/metric';

import { SetFilters } from '../utils/collections';

import rangeFilterForPrefix, { rangeFilterIsActive } from './rangeFilter';
import css from './TrialTable.module.scss';
import settingsConfig, {
  CompareTableSettings,
} from './TrialTable.settings';
import Tags, { addTagFunc, removeTagFunc } from './TrialTags';

interface Props {
  colorScale?: ColorScale[];
  containerRef: MutableRefObject<HTMLElement | null>,
  filteredTrialIdMap?: Record<number, boolean>;
  filters: TrialFilters;
  // handleTableChange : (pageSize: any) => void;

  handleTableRowSelect?: (rowKeys: unknown) => void;
  highlightedTrialId?: number;
  hpVals: HpValsMap
  metrics: Metric[];
  onMouseEnter?: (event: React.MouseEvent, record: V1AugmentedTrial) => void;
  onMouseLeave?: (event: React.MouseEvent, record: V1AugmentedTrial) => void;
  // pageSize: number;

  selectAllMatching: boolean;
  selectedTrialIds?: number[];
  selection?: boolean;
  setFilters?: SetFilters;
  trialIds: number[];
  trials: V1AugmentedTrial[];
}

const hpTitle = (hp: string) => <BadgeTag label={hp} tooltip="Hyperparameter">H</BadgeTag>;

export interface TrialMetrics {
  id: number;
  metrics: Record<RecordKey, Primitive>;
}

const TrialTable: React.FC<Props> = ({
  filters,
  highlightedTrialId,
  hpVals,
  onMouseEnter,
  onMouseLeave,
  trials,
  selection,
  handleTableRowSelect,
  // handleTableChange,
  // pageSize,
  setFilters,
  selectedTrialIds,
  selectAllMatching,
  metrics,
  trialIds,
  containerRef,
}: Props) => {

  const { settings, updateSettings } = useSettings<CompareTableSettings>(settingsConfig);

  const idColumn = useMemo(() => ({
    dataIndex: 'id',
    defaultWidth: 60,
    key: 'id',
    render: (_: string, record: V1AugmentedTrial) => {
      const color = glasbeyColor(record.trialId);
      return (
        <div className={css.idLayout}>
          <div className={css.colorLegend} style={{ backgroundColor: color }} />
          <Link path={paths.trialDetails(record.trialId, record.experimentId)}>
            {record.trialId}
          </Link>
        </div>
      );
    },
    sorter: true,
    title: 'Trial ID',
  }), []);

  const experimentIdColumn = useMemo(() => ({
    dataIndex: 'experimentId',
    defaultWidth: 60,
    filterDropdown: (filterProps: FilterDropdownProps) => (
      <TableFilterDropdown
        {...filterProps}
        multiple
        searchable
        validatorRegex={/\D/}
        values={filters.experimentIds}
        onAddFilter={(experimentId: string) => setFilters?.((filters) =>
          ({
            ...filters,
            experimentIds: [ experimentId, ...(filters.experimentIds ?? []) ],
          }))}
        onReset={() => setFilters?.((filters) => ({ ...filters, experimentIds: [] }))}
      />
    ),
    isFiltered: () => !!filters.experimentIds?.length,
    key: 'experimentId',
    render: (_: string, record: V1AugmentedTrial) => (
      <Link path={paths.experimentDetails(record.experimentId)}>
        {record.experimentId}
      </Link>
    ),
    sorter: true,
    title: 'Exp ID',
  }), [ filters.experimentIds, setFilters ]);

  const expRankColumn = useMemo(
    () => ({
      dataIndex: 'rank',
      defaultWidth: 60,
      filterDropdown: (filterProps: FilterDropdownProps) => (
        <TableFilterSearch
          {...filterProps}
          value={filters.ranker?.rank || ''}
          onReset={() =>
            setFilters?.((filters) => ({
              ...filters,
              // TODO handle invalid type assertion below
              ranker: { rank: '', sorter: filters.ranker?.sorter as V1TrialSorter },
            }))
          }
          onSearch={(r) =>
            setFilters?.((filters) => ({
              ...filters,
              // TODO handle invalid type assertion below
              ranker: { rank: r, sorter: filters.ranker?.sorter as V1TrialSorter },
            }))
          }
        />
      ),
      isFiltered: () => !!filters.ranker?.rank,
      key: 'rank',
      render: (_: string, record: V1AugmentedTrial) => (
        <div className={css.idLayout}>{record.rankWithinExp}</div>
      ),
      title: 'Rank in Exp',
    }),
    [ filters.ranker?.rank, setFilters ],
  );

  const hpColumns = useMemo(() => Object
    .keys(hpVals || {})
    .filter((hpParam) => hpVals[hpParam]?.size > 1)
    .map((key) => {
      return {
        dataIndex: key,
        defaultWidth: 130,
        filterDropdown: rangeFilterForPrefix('hparams', filters, setFilters)(key),
        isFiltered: () => rangeFilterIsActive(filters, 'hparams', key),
        key,
        render: (_: string, record: V1AugmentedTrial) => {
          const value = record.hparams[key];
          if (isNumber(value)) {
            return <HumanReadableNumber num={value} />;
          } else if (!value) {
            return '-';
          }
          return value + '';
        },
        sorter: true,
        title: hpTitle(key),
      };
    }), [ filters, hpVals, setFilters ]);

  const tagColumn = useMemo(() => ({
    dataIndex: 'tags',
    defaultWidth: 60,
    filterDropdown: (filterProps: FilterDropdownProps) => (
      <TableFilterDropdown
        {...filterProps}
        multiple
        searchable
        validatorRegex={/[^a-zA-Z0-9]+$/} // need fix ?
        values={filters.tags}
        onAddFilter={(tag: string) => setFilters?.((filters) =>
          ({
            ...filters,
            tags: [ tag, ...(filters.tags ?? []) ],
          }))}
        onReset={() => setFilters?.((filters) => ({ ...filters, tags: [] }))}
      />
    ),
    isFiltered: () => !!filters.tags?.length,
    key: 'labels',
    render: (value: string, record: V1AugmentedTrial) => (
      <Tags
        tags={Object.keys(record.tags)}
        onAdd={addTagFunc(record.trialId)}
        onRemove={removeTagFunc(record.trialId)}
      />
    ),
    sorter: true,
    title: 'Tags',
  }), [ filters.tags, setFilters ]);

  const trainingMetricColumns = useMemo(() => metrics
    .filter((metric) => metric.type = MetricType.Training).map((metric) => {
      const key = metricToKey(metric);
      return {
        dataIndex: key,
        defaultWidth: 100,
        filterDropdown: rangeFilterForPrefix(
          'trainingMetrics',
          filters,
          setFilters,
        )(metric.name),
        isFiltered: () => rangeFilterIsActive(filters, 'trainingMetrics', metric.name),
        key,
        render: (_: string, record: V1AugmentedTrial) => {
          const value = record.trainingMetrics?.[metricKeyToName(key)];
          return isNumber(value) ? <HumanReadableNumber num={value} /> : '-';
        },
        sorter: true,
        title: <MetricBadgeTag metric={metric} />,

      };
    }), [ filters, metrics, setFilters ]);

  // const validationMetricColumns = useMemo(() => metrics
  //   .filter((metric) => metric.type = MetricType.Validation).map((metric) => {
  //     const key = metricToKey(metric);
  //     return {
  //       dataIndex: key,
  //       defaultWidth: 100,
  //       filterDropdown: rangeFilterForPrefix(
  //         'validationMetrics',
  //         filters,
  //         setFilters,
  //       )(metric.name),
  //       isFiltered: () => rangeFilterIsActive(filters, 'validationMetrics', metric.name),
  //       key,
  //       render: (_: string, record: V1AugmentedTrial) => {
  //         const value = record.validationMetrics?.[metricKeyToName(key)];
  //         return isNumber(value) ? <HumanReadableNumber num={value} /> : '-';
  //       },
  //       sorter: true,
  //       title: <MetricBadgeTag metric={metric} />,
  //     };
  //   }), [ filters, metrics, setFilters ]);

  // console.log(metrics);

  const columns = useMemo(() => [
    idColumn,
    experimentIdColumn,
    expRankColumn,
    tagColumn,
    ...hpColumns,
    ...trainingMetricColumns,
    // ...validationMetricColumns,
  ], [
    idColumn,
    experimentIdColumn,
    expRankColumn,
    tagColumn,
    hpColumns,
    trainingMetricColumns,
    // validationMetricColumns,
  ]);

  useEffect(() => {
    // const newColumns = [
    //   ...settings.columns.filter((c) => columns.some((_c) => _c.dataIndex === c)),
    //   ...columns.filter((c) => !settings.columns
    //        .some((_c) => _c === c.dataIndex))
    //        .map((c) => c.dataIndex),

    // ];
    // updateSettings({
    //   columns: columns.map((c) => c.dataIndex),
    //   columnWidths: columns.map((c) => c.defaultWidth),
    // });
  }, [ columns.length ]);

  // const handleTableChange = useCallback((paginationConfig, tableFilters, tableSorter) => {
  //   // console.log(tableFilters, tableSorter);
  //   // handleTableChange(paginationConfig.pageSize);
  // }, []);
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
      pagination={getPaginationConfig(trials.length, 10)}
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

export default TrialTable;
