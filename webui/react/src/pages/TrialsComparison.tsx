import React, { useCallback, useEffect, useRef, useState } from 'react';

import LearningCurveChart from 'components/LearningCurveChart';
import Page from 'components/Page';
import Section from 'components/Section';
import TableBatch from 'components/TableBatch';
import useModalTrialCollection from 'hooks/useModal/Trial/useModalTrialCollection';
import useModalTrialTag from 'hooks/useModal/Trial/useModalTrialTag';
import MetricsView, {
  Layout,
  MetricView,
} from 'pages/TrialsComparison/MetricsView';
import TrialTable from 'pages/TrialsComparison/TrialTable/TrialTable';
import {
  aggregrateTrialsMetadata,
  defaultTrialData,
  TrialsWithMetadata,
} from 'pages/TrialsComparison/utils/data';
import { compareTrials, openOrCreateTensorBoard, queryTrials } from 'services/api';
import {
  TrialSorterNamespace,
  V1AugmentedTrial,
  V1OrderBy,
  V1TrialSorter,
} from 'services/api-ts-sdk';
import { clone } from 'shared/utils/data';
import { ErrorLevel, ErrorType } from 'shared/utils/error';
import {
  CommandTask,
  Metric,
  MetricType,
  Scale,
  TrialAction,
} from 'types';
import handleError from 'utils/error';
import { metricToKey } from 'utils/metric';
import { openCommand } from 'utils/wait';

import css from './TrialsComparison.module.scss';
import useHighlight from './TrialsComparison/hooks/useHighlight';
import {
  encodeFilters,
  encodeTrialSorter,
  useTrialFilters,
} from './TrialsComparison/utils/filters';

const BATCH_PADDING = 50;

const batchActions = [
  { label: TrialAction.OpenTensorBoard, value: TrialAction.OpenTensorBoard },
  { label: TrialAction.AddTags, value: TrialAction.AddTags },
  { label: TrialAction.CreateCollection, value: TrialAction.CreateCollection },
];

type ChartData = (number | null)[][]
interface SeriesData {
  batches: number[];
  metrics: Record<string, ChartData>
}

const emptyChartData = (rows: number, columns: number): ChartData =>
  [ ...Array(rows) ].map(() => Array(columns).fill(null));

const seq = (n: number) => [ ...Array(n) ].map((_, i) => i + 1);

const getTrialId = (trial: V1AugmentedTrial): number => trial.trialId;

interface Props {
  projectId: string;
}

const TrialsComparison: React.FC<Props> = ({ projectId }) => {

  const [ trialData, settrialData ] = useState<TrialsWithMetadata>(defaultTrialData);
  const [ seriesData, setSeriesData ] = useState<SeriesData>();
  const [ sorter ] = useState<V1TrialSorter>({
    field: 'trialId',
    namespace: TrialSorterNamespace.TRIALS,
    orderBy: V1OrderBy.ASC,
  });

  const { filters, setFilters } = useTrialFilters(projectId ?? '1');

  const [ view, setView ] = useState<MetricView>();
  // const [ pageSize, setPageSize ] = useState(MINIMUM_PAGE_SIZE);
  const [ selectedTrialIds, setSelectedTrialIds ] = useState<number[]>([]);

  const highlight = useHighlight(getTrialId);

  const [ selectAllMatching, setSelectAllMatching ] = useState<boolean>(false);
  const handleChangeSelectionMode = useCallback(() => setSelectAllMatching((prev) => !prev), []);

  // const pageRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const {
    contextHolder: modalTrialTagContextHolder,
    modalOpen: openTagModal,
  } = useModalTrialTag({});

  const {
    contextHolder: modalTrialCollectionContextHolder,
    modalOpen: openCreateCollectionModal,
  } = useModalTrialCollection({ projectId });

  const submitBatchAction = useCallback(async (action: TrialAction) => {
    try {
      if (action === TrialAction.AddTags){
        openTagModal({
          trials: selectAllMatching
            ? { filters, sorter }
            : { trialIds: selectedTrialIds },
        });
      } else if (action === TrialAction.CreateCollection) {
        openCreateCollectionModal({
          trials: selectAllMatching
            ? { filters, sorter }
            : { trialIds: selectedTrialIds },
        });
      } else if (action === TrialAction.OpenTensorBoard) {
        const result = await openOrCreateTensorBoard({ trialIds: selectedTrialIds });
        if (result) openCommand(result as CommandTask);
      }
    } catch (e) {
      const publicSubject = action === TrialAction.OpenTensorBoard ?
        'Unable to View TensorBoard for Selected Trials' :
        `Unable to ${action} Selected Trials`;
      handleError(e, {
        level: ErrorLevel.Error,
        publicMessage: 'Please try again later.',
        publicSubject,
        silent: false,
        type: ErrorType.Server,
      });
    }
  }, [ selectedTrialIds,
    openTagModal,
    selectAllMatching,
    openCreateCollectionModal,
    sorter,
    filters,
  ]);

  const handleTableRowSelect = useCallback((rowKeys) => setSelectedTrialIds(rowKeys), []);
  // const handleTableChange = useCallback((pageSize) => setPageSize(pageSize), []);

  const clearSelected = useCallback(() => {
    setSelectedTrialIds([]);
  }, []);

  const handleViewChange = useCallback((view: MetricView) => {
    setView(view);
  }, []);

  const fetchTrials = useCallback(async () => {
    try {
      const response = await queryTrials({
        filters: encodeFilters(filters),
        // limit: pageSize,
        sorter: encodeTrialSorter(sorter),
      });

      settrialData((prev) => {
        const d: TrialsWithMetadata = response.trials
          ?.reduce(
            aggregrateTrialsMetadata,
            clone(defaultTrialData),
          ) ?? prev;
        return d;
      });

    } catch (e) {
      handleError(e, { publicSubject: 'Unable to fetch trials.' });
    }
  }, [ filters, sorter ]);

  useEffect(() => {
    fetchTrials();
  }, [ fetchTrials ]);

  // to do: use polling

  useEffect(() => {
    // set the default metric
    if (!view && trialData.metrics.length) {
      const defaultMetric = trialData.metrics
        .filter((m) => m.type === MetricType.Validation)[0]
        ?? trialData.metrics[0];
      setView({ layout: Layout.Grid, metric: defaultMetric, scale: Scale.Linear });
    }
  }, [ view, trialData.metrics ]);

  const fetchSeriesData = useCallback(async () => {
    if (!trialData.trialIds || !trialData.metrics.length) return;

    // preparing the new data structure to store API response
    const metricKeys = trialData.metrics.map((metric: Metric) => metricToKey(metric));

    const metricValsMap: Record<string, ChartData> = metricKeys
      .map((metricKey) => ({
        [metricKey]: emptyChartData(
          trialData.trialIds.length,
          trialData.maxBatch + BATCH_PADDING,
        ),
      })).reduce((a, b) => ({ ...a, ...b }), {});

    const newSeriesData: SeriesData = {
      batches: seq(trialData.maxBatch + BATCH_PADDING),
      metrics: metricValsMap,
    };

    // calling the API
    const trials = await compareTrials({
      maxDatapoints: 1000,
      metricNames: trialData.metrics,
      trialIds: trialData.trialIds,
    });

    // populating the data structure with the API results

    trials.forEach((trial) => {
      const trialRowIndex = trialData.trialIds.indexOf(trial.id);
      if (trialRowIndex === -1) return;
      trial.metrics.forEach((metric) => {
        const metricKey = metricToKey(metric);
        if (!newSeriesData.metrics[metricKey]) return;
        metric.data.forEach(({ batches, value }) => {
          newSeriesData.metrics[metricKey][trialRowIndex][batches] = value;
        });
      });
    });
    setSeriesData(newSeriesData);

  }, [ trialData.trialIds, trialData.metrics, trialData.maxBatch ]);

  useEffect(() => {
    fetchSeriesData();
  }, [ fetchSeriesData ]);

  const chartData = view?.metric
    && metricToKey(view.metric)
    && seriesData?.metrics?.[metricToKey(view.metric)];

  const metricsViewSelect = (
    view && (
      <MetricsView
        metrics={trialData.metrics}
        view={view}
        onChange={handleViewChange}
      />
    )
  );

  return (
    <Page className={css.base} containerRef={containerRef}>
      <Section
        bodyBorder
        bodyScroll
        filters={metricsViewSelect}>
        <div className={css.container}>
          <div className={css.chart}>
            {view?.metric && chartData && (
              <LearningCurveChart
                data={chartData}
                focusedTrialId={highlight.id}
                selectedMetric={view.metric}
                selectedScale={view.scale}
                selectedTrialIds={selectedTrialIds}
                trialIds={trialData.trialIds}
                xValues={seriesData.batches}
                onTrialFocus={highlight.focus}
              />
            )}
          </div>
          <TableBatch
            actions={batchActions}
            selectAllMatching={selectAllMatching}
            selectedRowCount={selectedTrialIds.length}
            onAction={(action) => submitBatchAction(action as TrialAction)}
            onChangeSelectionMode={handleChangeSelectionMode}
            onClear={clearSelected}
          />
          <TrialTable
            containerRef={containerRef}
            filters={filters}
            handleTableRowSelect={handleTableRowSelect}
            // handleTableChange={handleTableChange}
            // pageSize={pageSize}
            highlightedTrialId={highlight.id}
            hpVals={trialData.hpVals}
            metrics={trialData.metrics}
            selectAllMatching={selectAllMatching}
            selectedTrialIds={selectedTrialIds}
            selection={true}
            setFilters={setFilters}
            trialIds={trialData.trialIds}
            trials={trialData.trials}
            onMouseEnter={highlight.mouseEnter}
            onMouseLeave={highlight.mouseLeave}
          />
        </div>
      </Section>
      {modalTrialTagContextHolder}
      {modalTrialCollectionContextHolder}
    </Page>

  );
};

export default TrialsComparison;
