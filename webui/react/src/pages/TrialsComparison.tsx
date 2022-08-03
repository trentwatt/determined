import { Tabs } from 'antd';
import queryString from 'query-string';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import LearningCurveChart from 'components/LearningCurveChart';
import Page from 'components/Page';
import Section from 'components/Section';
import TableBatch from 'components/TableBatch';
import useModalTrialTag from 'hooks/useModal/Trial/useModalTrialTag';
import { compareTrials, openOrCreateTensorBoard, queryTrials } from 'services/api';
import { V1AugmentedTrial, V1TrialFilters } from 'services/api-ts-sdk';
import Spinner from 'shared/components/Spinner';
import { Primitive } from 'shared/types';
import { clone } from 'shared/utils/data';
import { ErrorLevel, ErrorType } from 'shared/utils/error';
import {
  CommandTask,
  ExperimentVisualizationType,
  MetricName,
  Scale,
  TrialAction,
} from 'types';
import handleError from 'utils/error';
import { metricNameToValue } from 'utils/metric';
import { openCommand } from 'wait';

import css from './TrialsComparison.module.scss';
import MetricsView, {
  MetricView,
  ViewType,
} from './TrialsComparison/MetricsView';
import ComparisonHeader from './TrialsComparison/TrialsComparisonHeader';
import TrialsTable from './TrialsComparison/TrialsTable/TrialsTable';

export type HpValsMap = Record<string, Set<Primitive>>

const DEFAULT_TYPE_KEY = ExperimentVisualizationType.LearningCurve;

interface TrialsWithMetadata {
  hpVals: HpValsMap;
  metrics: MetricName[];
  trialIds: number[];
  trials: V1AugmentedTrial[];
}

const defaultTrialsData: TrialsWithMetadata = {
  hpVals: {},
  metrics: [],
  trialIds: [],
  trials: [],
};

const metricInList = (metric: MetricName, metrics: MetricName[]): boolean => {
  return metrics.some((m) => m.type === metric.type && m.name === metric.name);
};

const aggregrateTrialsMetadata =
(agg: TrialsWithMetadata, trial: V1AugmentedTrial): TrialsWithMetadata => ({
  hpVals: {},
  metrics: [
    ...agg.metrics,
    ...trial.validationMetrics.filter((m :MetricName) => !metricInList(m, agg.metrics)),
    ...trial.trainingMetrics.filter((m :MetricName) => !metricInList(m, agg.metrics)),
  ],
  trialIds: [ ...agg.trialIds, trial.trialId ],
  trials: [ ...agg.trials, trial ],
});

// `${MetricName.type}|${MetricName.name}`
type Metric = string

const batchActions = [
  { label: TrialAction.OpenTensorBoard, value: TrialAction.OpenTensorBoard },
  { bulk: true, label: TrialAction.AddTags, value: TrialAction.AddTags },

];

interface SeriesData {
  batches: number[];
  metrics: Record<Metric, (number | null)[][]>
}

const ExperimentComparison: React.FC = () => {

  const location = useLocation();
  const [ trialsData, setTrialsData ] = useState<TrialsWithMetadata>(defaultTrialsData);
  const [ seriesData, setSeriesData ] = useState<SeriesData>();
  const [ filters, setFilters ] = useState<V1TrialFilters>();
  const [ view, setView ] = useState<MetricView>({ scale: Scale.Linear, view: ViewType.Grid });
  const [ selectAllMatching, setSelectAllMatching ] = useState<boolean>(false);

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

  const [ selectedTrialIds, setSelectedTrialIds ] = useState<number[]>([]);
  const [ highlightedTrialId, setHighlightedTrialId ] = useState<number>();

  const {
    contextHolder: modalTrialTagContextHolder,
    modalOpen: openTagModal,
  } = useModalTrialTag({});

  const handleTrialFocus = useCallback((trialId: number | null) => {
    setHighlightedTrialId(trialId != null ? trialId : undefined);
  }, []);

  const handleTableMouseEnter = useCallback((event: React.MouseEvent, record: V1AugmentedTrial) => {
    if (record.trialId) setHighlightedTrialId(record.trialId);
  }, []);

  const handleTableMouseLeave = useCallback(() => {
    setHighlightedTrialId(undefined);
  }, []);

  const clearSelected = useCallback(() => {
    setSelectedTrialIds([]);
  }, []);

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

  const fetchSeriesData = useCallback(async () => {
    if (!trialsData.trialIds || !trialsData.metrics.length) return;

    const response = await compareTrials({
      maxDatapoints: 1000,
      metricNames: trialsData.metrics,
      trialIds: trialsData.trialIds,
    });

    // setSeriesData(!!response && {});
  }, [ trialsData.trialIds, trialsData.metrics ]);

  useEffect(() => {
    fetchSeriesData();
  }, [ fetchSeriesData ]);

  const typeKey = DEFAULT_TYPE_KEY;

  const hasLoaded = !!trialsData.trialIds.length;

  const chartData = view.metric
    && metricNameToValue(view.metric)
    && seriesData?.metrics?.[metricNameToValue(view.metric)];

  const metricsViewSelect = (
    <MetricsView
      metrics={trialsData.metrics}
      view={view}
      onChange={handleViewChange}
    />
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
            activeKey={typeKey}
            destroyInactiveTabPane
            type="card">
            <Tabs.TabPane
              key={ExperimentVisualizationType.LearningCurve}
              tab="Learning Curve">
              {view.metric && chartData && (
                <Page className={css.base} containerRef={containerRef}>
                  <Section
                    bodyBorder
                    bodyScroll
                    filters={metricsViewSelect}
                    loading={!hasLoaded}>
                    <div className={css.container}>
                      <div className={css.chart}>
                        <LearningCurveChart
                          data={chartData}
                          focusedTrialId={highlightedTrialId}
                          selectedMetric={view.metric}
                          selectedScale={view.scale}
                          selectedTrialIds={selectedTrialIds}
                          trialIds={trialsData.trialIds}
                          xValues={seriesData.batches}
                          onTrialFocus={handleTrialFocus}
                        />
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
                        highlightedTrialId={highlightedTrialId}
                        hpVals={trialsData.hpVals}
                        metrics={trialsData.metrics}
                        selectAllMatching={selectAllMatching}
                        selectedTrialIds={selectedTrialIds}
                        selection={true}
                        trialIds={trialsData.trialIds}
                        trials={trialsData.trials}
                        onMouseEnter={handleTableMouseEnter}
                        onMouseLeave={handleTableMouseLeave}
                      />
                    </div>
                  </Section>
                  {modalTrialTagContextHolder}
                </Page>
              )}
            </Tabs.TabPane>
          </Tabs>
        </div>
      </React.Suspense>
    </Page>
  );
};

export default ExperimentComparison;
