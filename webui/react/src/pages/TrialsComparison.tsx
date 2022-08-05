import { Tabs } from 'antd';
import queryString from 'query-string';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import LearningCurveChart from 'components/LearningCurveChart';
import Page from 'components/Page';
import Section from 'components/Section';
import TableBatch from 'components/TableBatch';
import useModalTrialTag from 'hooks/useModal/Trial/useModalTrialTag';
import MetricsView, {
  Layout,
  MetricView,
} from 'pages/TrialsComparison/MetricsView';
import ComparisonHeader from 'pages/TrialsComparison/TrialsComparisonHeader';
import TrialsTable from 'pages/TrialsComparison/TrialsTable/TrialsTable';
import { TrialFilters } from 'pages/TrialsComparison/types';
import {
  aggregrateTrialsMetadata,
  defaultTrialData,
  TrialsWithMetadata,
} from 'pages/TrialsComparison/utils/trialData';
import { compareTrials, openOrCreateTensorBoard, queryTrials } from 'services/api';
import {
  TrialSorterNamespace,
  V1AugmentedTrial,
  V1OrderBy,
  V1TrialSorter,
} from 'services/api-ts-sdk';
import Spinner from 'shared/components/Spinner';
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
import { openCommand } from 'wait';

import css from './TrialsComparison.module.scss';
import useHighlight from './TrialsComparison/hooks/useHighlight';
import { encodeFilters } from './TrialsComparison/utils/trialFilters';

const BATCH_PADDING = 50;

const batchActions = [
  { label: TrialAction.OpenTensorBoard, value: TrialAction.OpenTensorBoard },
  { label: TrialAction.AddTags, value: TrialAction.AddTags },
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
  projectId?: number;
}

function log<T>(x: T): T {
  console.log(x);
  return x;
}

const TrialsComparison: React.FC<Props> = () => {

  const location = useLocation();
  const queries = queryString.parse(location.search);
  let experimentIds: string[];
  if (queries.id && typeof queries.id === 'string'){
    experimentIds = [ queries.id ];
  } else if (queries.id && typeof queries.id === 'object') {
    experimentIds = queries.id;
  } else {
    experimentIds = [];
  }
  const [ trialData, settrialData ] = useState<TrialsWithMetadata>(defaultTrialData);
  const [ seriesData, setSeriesData ] = useState<SeriesData>();
  const [ filters, setFilters ] = useState<TrialFilters>({ experimentIds });
  const [ sorter, setSorter ] = useState<V1TrialSorter>({
    field: 'trialId',
    namespace: TrialSorterNamespace.TRIALS,
    orderBy: V1OrderBy.ASC,
  });
  const [ view, setView ] = useState<MetricView>();
  const [ selectedTrialIds, setSelectedTrialIds ] = useState<number[]>([]);

  const highlight = useHighlight(getTrialId);

  const [ selectAllMatching, setSelectAllMatching ] = useState<boolean>(false);
  const handleChangeSelectionMode = useCallback(() => setSelectAllMatching((prev) => !prev), []);

  const pageRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLElement>(null);

  const {
    contextHolder: modalTrialTagContextHolder,
    modalOpen: openTagModal,
  } = useModalTrialTag({ filters, selectAllMatching });

  const submitBatchAction = useCallback(async (action: TrialAction) => {
    try {
      if (action === TrialAction.AddTags){
        openTagModal({ trialIds: selectAllMatching ? trialData.trialIds : selectedTrialIds });
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
  }, [ selectedTrialIds, openTagModal, trialData.trialIds, selectAllMatching ]);

  const handleTableRowSelect = useCallback((rowKeys) => setSelectedTrialIds(rowKeys), []);

  const clearSelected = useCallback(() => {
    setSelectedTrialIds([]);
  }, []);

  const handleViewChange = useCallback((view: MetricView) => {
    setView(view);
  }, []);

  const fetchTrials = useCallback(async () => {
    console.log("fetching useing filers", filters);
    try {
      const response = await queryTrials(
        { filters: encodeFilters(filters, sorter) },
      );
      console.log("resp", response);
      settrialData((prev) =>
        response.trials?.reduce(aggregrateTrialsMetadata, clone(defaultTrialData))
       ?? prev);

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
    console.log("TrialData", trialData);
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

  const hasLoaded = !!trialData.trialIds.length;

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
    <Page
      bodyNoPadding
      containerRef={pageRef}
      headerComponent={(
        <ComparisonHeader />
      )}
      stickyHeader
      title="Compare Experiments">
      <React.Suspense fallback={<Spinner tip="Loading experiment visualization..." />}>
        <div className={css.base}>
          <Tabs
            activeKey="X"
            destroyInactiveTabPane
            type="card">
            <Tabs.TabPane
              key="X"
              tab="Learning Curve">
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
                    <TrialsTable
                      containerRef={containerRef}
                      filters={filters}
                      handleTableRowSelect={handleTableRowSelect}
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
              </Page>
            </Tabs.TabPane>
          </Tabs>
        </div>
      </React.Suspense>
    </Page>
  );
};

export default TrialsComparison;
