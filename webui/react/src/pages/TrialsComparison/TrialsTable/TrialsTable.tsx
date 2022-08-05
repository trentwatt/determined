import { FilterDropdownProps } from 'antd/lib/table/interface';
import { record } from 'io-ts';
import React, { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';

import HumanReadableNumber from 'components/HumanReadableNumber';
import InteractiveTable, { InteractiveTableSettings } from 'components/InteractiveTable';
import Link from 'components/Link';
import MetricBadgeTag from 'components/MetricBadgeTag';
import { defaultRowClassName, getPaginationConfig, MINIMUM_PAGE_SIZE } from 'components/Table';
import TableFilterDropdown from 'components/TableFilterDropdown';
import TagList, { TagAction } from 'components/TagList';
import useSettings, { UpdateSettings } from 'hooks/useSettings';
import { FilterSetter, TrialFilters } from 'pages/TrialsComparison/types';
import { HpValsMap } from 'pages/TrialsComparison/utils/trialData';
import { paths } from 'routes/utils';
import { patchTrials } from 'services/api';
import { V1AugmentedTrial } from 'services/api-ts-sdk';
import { Primitive, RecordKey } from 'shared/types';
import { ColorScale, glasbeyColor } from 'shared/utils/color';
import { isNumber } from 'shared/utils/data';
import { alphaNumericSorter, primitiveSorter } from 'shared/utils/sort';
import { Metric, MetricType } from 'types';
import { metricKeyToName, metricKeyToType, metricToKey } from 'utils/metric';

import rangeFilterForPrefix from './rangeFilter';
import css from './TrialsTable.module.scss';
import settingsConfig, {
  CompareTableSettings,
} from './TrialsTable.settings';

interface Props {
  colorScale?: ColorScale[];
  containerRef: MutableRefObject<HTMLElement | null>,
  filteredTrialIdMap?: Record<number, boolean>;
  filters: TrialFilters;
  handleTableRowSelect?: (rowKeys: unknown) => void;
  highlightedTrialId?: number;
  hpVals: HpValsMap
  metrics: Metric[];
  onMouseEnter?: (event: React.MouseEvent, record: V1AugmentedTrial) => void;
  onMouseLeave?: (event: React.MouseEvent, record: V1AugmentedTrial) => void;
  selectAllMatching: boolean;
  selectedTrialIds?: number[];
  selection?: boolean;
  setFilters?: FilterSetter;
  trialIds: number[];
  trials: V1AugmentedTrial[];
}

export interface TrialMetrics {
  id: number;
  metrics: Record<RecordKey, Primitive>;
}

const TrialsTable: React.FC<Props> = ({
  filters,
  highlightedTrialId,
  hpVals,
  onMouseEnter,
  onMouseLeave,
  trials,
  selection,
  handleTableRowSelect,
  setFilters,
  selectedTrialIds,
  selectAllMatching,
  metrics,
  trialIds,
  containerRef,
}: Props) => {
  // console.log(selectedTrialIds, trialIds);
  const [ pageSize, setPageSize ] = useState(MINIMUM_PAGE_SIZE);

  // PLACHOLDER, would actually be passed in
  type FilterPrefix = 'hparams' | 'trainingMetrics' | 'validationMetrics'

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
        const metricName = metricKeyToName(key);
        const metricType = metricKeyToType(key);
        let value;
        if (metricType === MetricType.Validation) {
          value = record.validationMetrics?.[metricName];
        } else if (metricType === MetricType.Training) {
          value = record.trainingMetrics?.[metricName];
        }
        return isNumber(value) ? <HumanReadableNumber num={value} /> : '-';
      };
    };

    const metricsSorter = (key: string) => {
      return (recordA: V1AugmentedTrial, recordB: V1AugmentedTrial): number => {
        const a = recordA.validationMetrics[key] as Primitive;
        const b = recordB.validationMetrics[key] as Primitive;
        return primitiveSorter(a, b);
      };
    };

    const experimentFilterDropdown = (filterProps: FilterDropdownProps) => (
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
    );

    const experimentIdColumn = {
      dataIndex: 'experimentId',
      defaultWidth: 60,
      filterDropdown: experimentFilterDropdown,
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

    const hpFilterRange = rangeFilterForPrefix('hparams', filters, setFilters);

    const tagFilterDropdown = (filterProps: FilterDropdownProps) => (
      <TableFilterDropdown
        {...filterProps}

        multiple
        searchable
        validatorRegex={/[^a-zA-Z0-9]+$/} // need fix
        values={filters.tags}
        onAddFilter={(tag: string) => setFilters?.((filters) =>
          ({
            ...filters,
            tags: [ tag, ...(filters.tags ?? []) ],
          }))}
        onReset={() => setFilters?.((filters) => ({ ...filters, tags: [] }))}
      />
    );

    const tagsRenderer = (value: string, record: V1AugmentedTrial) => {
      const [tags, setTags] = useState(Object.keys(record.tags));
      const handleTagAction = async (action: TagAction, tag: string) => {
        try {
          if (action === TagAction.Add) {
            await patchTrials({
              patch: { tags: [ { key: tag, value: '1' } ] },
              trialIds: [ record.trialId ],
            });
            setTags([tag, ...tags])
          } else if (action === TagAction.Remove) {
            patchTrials({
              patch: { tags: [ { key: tag, value: '' } ] },
              trialIds: [ record.trialId ],
            });
          }
        } catch (error) {
          console.error(error);
        }
      };
      return (
        <TagList
          tags={tags}
          onAction={handleTagAction}
        />
      );
    };

    const tagColumn = {
      dataIndex: 'tags',
      defaultWidth: 60,
      filterDropdown: tagFilterDropdown,
      key: 'labels',
      render: tagsRenderer,
      title: 'Tags',
    };

    const validationMetricFilterRange =
      rangeFilterForPrefix(
        'validationMetrics',
        filters,
        setFilters,
      );

    const trainingMetricFilterRange = rangeFilterForPrefix(
      'trainingMetrics',
      filters,
      setFilters,
    );

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
        const key = metricToKey(metric);
        return {
          dataIndex: key,
          defaultWidth: 60,
          filterDropdown: metric.type === MetricType.Training
            ? trainingMetricFilterRange(metric.name)
            : metric.type === MetricType.Validation
              ? validationMetricFilterRange(metric.name)
              : undefined,
          key,
          render: metricsRenderer(key),
          sorter: metricsSorter(key),
          title: <MetricBadgeTag metric={metric} />,

        };
      });

    return [ idColumn, experimentIdColumn, tagColumn, ...hpColumns, ...metricsColumns ];
  }, [ hpVals, filters, metrics, setFilters ]);

  useEffect(() => {
    updateSettings({
      columns: columns.map((c) => c.dataIndex),
      columnWidths: columns.map(() => 100),
    });
  }, [ columns, updateSettings ]);

  const handleTableChange = useCallback((_, tableFilters, tableSorter) => {
    // console.log(tableFilters, tableSorter);
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
