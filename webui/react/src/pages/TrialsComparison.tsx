import { Tabs } from 'antd';
import queryString from 'query-string';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import LearningCurveChart from 'components/LearningCurveChart';
import Page from 'components/Page';
import Section from 'components/Section';
import TableBatch from 'components/TableBatch';
import useModalTrialTag from 'hooks/useModal/Trial/useModalTrialTag';
import MetricsView, {
  MetricView,
  ViewType,
} from 'pages/TrialsComparison/MetricsView';
import ComparisonHeader from 'pages/TrialsComparison/TrialsComparisonHeader';
import TrialsTable from 'pages/TrialsComparison/TrialsTable/TrialsTable';
import {
  aggregrateTrialsMetadata,
  defaultTrialsData,
  TrialsWithMetadata,
} from 'pages/TrialsComparison/utils/trialsData';
import { compareTrials, openOrCreateTensorBoard, queryTrials } from 'services/api';
import { V1AugmentedTrial, V1TrialFilters } from 'services/api-ts-sdk';
import Spinner from 'shared/components/Spinner';
import { clone } from 'shared/utils/data';
import { ErrorLevel, ErrorType } from 'shared/utils/error';
import {
  CommandTask,
  MetricName,
  MetricType,
  Scale,
  TrialAction,
} from 'types';
import handleError from 'utils/error';
import { metricNameToValue } from 'utils/metric';
import { openCommand } from 'wait';

import css from './TrialsComparison.module.scss';
import useHighlight from './TrialsComparison/hooks/useHighlight';

type Metric = string

const BATCH_PADDING = 50;

const batchActions = [
  { label: TrialAction.OpenTensorBoard, value: TrialAction.OpenTensorBoard},
  { label: TrialAction.AddTags, value: TrialAction.AddTags },
];

type ChartData = (number | null)[][]
interface SeriesData {
  batches: number[];
  metrics: Record<Metric, ChartData>
}

const emptyChartData = (rows: number, columns: number): ChartData =>
  [ ...Array(rows) ].map(() => Array(columns).fill(null));

const seq = (n: number) => [ ...Array(n) ].map((_, i) => i + 1);

const getTrialId = (trial: V1AugmentedTrial): number => trial.trialId;

const TrialsComparison: React.FC = () => {
  const location = useLocation();
  const [ trialsData, setTrialsData ] = useState<TrialsWithMetadata>(defaultTrialsData);
  const [ seriesData, setSeriesData ] = useState<SeriesData>();
  const [ filters, setFilters ] = useState<V1TrialFilters>();
  const [ view, setView ] = useState<MetricView>();
  const [ selectAllMatching, setSelectAllMatching ] = useState<boolean>(false);
  const [ selectedTrialIds, setSelectedTrialIds ] = useState<number[]>([]);
  const highlight = useHighlight(getTrialId);
  const handleChangeSelectionMode = useCallback(() => setSelectAllMatching((prev) => !prev), []);

  const experimentIds: number[] = useMemo(() => {
    const query = queryString.parse(location.search);
    if (query.id && typeof query.id === 'string'){
      return [ parseInt(query.id) ];
    } else if (Array.isArray(query.id)) {
      return query.id.map((x) => parseInt(x));
    }
    return [];
  }, [ location.search ]);

  const pageRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLElement>(null);

  const {
    contextHolder: modalTrialTagContextHolder,
    modalOpen: openTagModal,
  } = useModalTrialTag({trialIds: selectAllMatching ? trialsData.trialIds : selectedTrialIds});

  const submitBatchAction = useCallback(async (action: TrialAction) => {
    try {
      if (action === TrialAction.AddTags){
        openTagModal({ trialIds: trialsData.trialIds });
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
  }, [ selectedTrialIds, openTagModal, trialsData.trialIds ]);

  const clearSelected = useCallback(() => {
    setSelectedTrialIds([]);
  }, []);

  const handleTableRowSelect = useCallback((rowKeys) => setSelectedTrialIds(rowKeys), []);

  const handleViewChange = useCallback((view: MetricView) => {
    setView(view);
  }, []);

  const fetchTrials = useCallback(async () => {
    try {
      const response = await queryTrials(
        { filters: { experimentIds: experimentIds } },
      );
      setTrialsData((prev) =>
        response.trials?.reduce(aggregrateTrialsMetadata, clone(defaultTrialsData))
       ?? prev);

    } catch (e) {
      handleError(e, { publicSubject: 'Unable to fetch trials.' });
    }
  }, [ experimentIds ]);

  useEffect(() => {
    fetchTrials();
  }, [ fetchTrials ]);

  // to do: use polling

  useEffect(() => {
    if (!view && trialsData.metrics.length) {
      const defaultMetric = trialsData.metrics
        .filter((m) => m.type === MetricType.Validation)[0]
        ?? trialsData.metrics[0];
      setView({ metric: defaultMetric, scale: Scale.Linear, view: ViewType.Grid });
    }
  }, [ view, trialsData.metrics ]);

  const fetchSeriesData = useCallback(async () => {
    if (!trialsData.trialIds || !trialsData.metrics.length) return;

    // preparing the new data structure
    const metricKeys = trialsData.metrics.map((metric: MetricName) => metricNameToValue(metric));

    const metricValsMap = metricKeys
      .map((key) => ({
        [key]: emptyChartData(
          trialsData.trialIds.length,
          trialsData.maxBatch + BATCH_PADDING,
        ),
      })).reduce((a, b) => ({ ...a, ...b }), {});

    const newSeriesData: SeriesData = {
      batches: seq(trialsData.maxBatch + BATCH_PADDING),
      metrics: metricValsMap,
    };

    // calling the api

    const trials = await compareTrials({
      maxDatapoints: 1000,
      metricNames: trialsData.metrics,
      trialIds: trialsData.trialIds,
    });

    // populating the data structure with the API results

    trials.forEach((trial) => {
      const trialRowIndex = trialsData.trialIds.indexOf(trial.id);
      if (trialRowIndex === -1) return;
      trial.metrics.forEach((metric) => {
        const metricKey = metricNameToValue(metric);
        if (!newSeriesData.metrics[metricKey]) return;
        metric.data.forEach(({ batches, value }) => {
          newSeriesData.metrics[metricKey][trialRowIndex][batches] = value;
        });
      });
    });

    setSeriesData(newSeriesData);
  }, [ trialsData.trialIds, trialsData.metrics, trialsData.maxBatch ]);

  useEffect(() => {
    fetchSeriesData();
  }, [ fetchSeriesData ]);

  const hasLoaded = !!trialsData.trialIds.length;

  const chartData = view?.metric
    && metricNameToValue(view.metric)
    && seriesData?.metrics?.[metricNameToValue(view.metric)];

  const metricsViewSelect = (
    view && (
      <MetricsView
        metrics={trialsData.metrics}
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
                  filters={metricsViewSelect}
                  loading={!hasLoaded}>
                  <div className={css.container}>
                    <div className={css.chart}>
                      {view?.metric && chartData && (
                        <LearningCurveChart
                          data={chartData}
                          focusedTrialId={highlight.id}
                          selectedMetric={view.metric}
                          selectedScale={view.scale}
                          selectedTrialIds={selectedTrialIds}
                          trialIds={trialsData.trialIds}
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
                      handleTableRowSelect={handleTableRowSelect}
                      highlightedTrialId={highlight.id}
                      hpVals={trialsData.hpVals}
                      metrics={trialsData.metrics}
                      selectAllMatching={selectAllMatching}
                      selectedTrialIds={selectedTrialIds}
                      selection={true}
                      trialIds={trialsData.trialIds}
                      trials={trialsData.trials}
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
