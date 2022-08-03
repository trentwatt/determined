import { Tabs } from 'antd';
import queryString from 'query-string';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { useStore } from 'contexts/Store';
import { compareTrials, getExperimentDetails } from 'services/api';
import { queryTrials } from 'services/api';
import { detApi } from 'services/apiConfig';
import { CompareTrialsParams } from 'services/types';
import Message, { MessageType } from 'shared/components/Message';
import Spinner from 'shared/components/Spinner/Spinner';
import { Primitive } from 'shared/types';
import { isEqual, isNumber } from 'shared/utils/data';
import { flattenObject } from 'shared/utils/data';
import { alphaNumericSorter } from 'shared/utils/sort';
import {
  ExperimentVisualizationType,
  Hyperparameter,
  HyperparameterType, MetricName, MetricType, metricTypeParamMap,
} from 'types';
import { Scale } from 'types';

import Compare from './Compare';
import TrialFilters, {
  ViewType, VisualizationFilters,
} from './TrialFilters';
import css from './TrialsComparison.module.scss';
import { TrialHParams, TrialMetrics } from './TrialsTable/TrialsTable';

enum PageError {
  MetricBatches,
  MetricHpImportance,
  MetricNames,
  ExperimentSample
}
export type HpValsMap = Record<string, Set<Primitive>>

const DEFAULT_TYPE_KEY = ExperimentVisualizationType.LearningCurve;
const DEFAULT_BATCH = 0;
const DEFAULT_BATCH_MARGIN = 10;
const DEFAULT_MAX_TRIALS = 100;
const DEFAULT_VIEW = ViewType.Grid;
const PAGE_ERROR_MESSAGES = {
  [PageError.MetricBatches]: 'Unable to retrieve experiment batches info.',
  [PageError.MetricHpImportance]: 'Unable to retrieve experiment hp importance.',
  [PageError.MetricNames]: 'Unable to retrieve experiment metric info.',
  [PageError.ExperimentSample]: 'Unable to retrieve experiment info.',
};

const TrialsComparison: React.FC = () => {

  const fullHParams = useRef<string[]>(
    [],
  );

  const defaultFilters: VisualizationFilters = {
    batch: DEFAULT_BATCH,
    batchMargin: DEFAULT_BATCH_MARGIN,
    hParams: [],
    maxTrial: DEFAULT_MAX_TRIALS,
    scale: Scale.Linear,
    view: DEFAULT_VIEW,
  };

  const location = useLocation();

  const experimentIds: number[] = useMemo(() => {
    const query = queryString.parse(location.search);
    if (query.id && typeof query.id === 'string'){
      return [ parseInt(query.id) ];
    } else if (Array.isArray(query.id)){
      return query.id.map((x) => parseInt(x));
    }
    return [];

  }, [ location.search ]);

  const [ filters, setFilters ] = useState<VisualizationFilters>(defaultFilters);
  const [ batches, setBatches ] = useState<number[]>([]);
  const [ metrics, setMetrics ] = useState<MetricName[]>([]);
  const [ pageError, setPageError ] = useState<PageError>();

  useEffect(() => {
    if (filters.metric) return;
    const id = experimentIds[0];
    getExperimentDetails({ id }).then((experiment) => {
      const metric = { name: experiment.config.searcher.metric, type: MetricType.Validation };
      setFilters((filters) => ({ ...filters, metric }));

    });
  }, [ filters.metric, experimentIds ]);
  //
  const [ trialIds, setTrialIds ] = useState<number[]>([]);
  const [ chartData, setChartData ] = useState<(number | null)[][]>([]);
  const [ trialHps, setTrialHps ] = useState<TrialHParams[]>([]);
  const [ trialHpMap, setTrialHpMap ] = useState<Record<number, TrialHParams>>({});
  const [ trialMetrics, setTrialMetrics ] = useState<Record<number, TrialMetrics>>({});
  const [ hyperparameters, setHyperparameters ] = useState<Record<string, Hyperparameter>>({});
  const [ hpVals, setHpVals ] = useState<HpValsMap>({});
  const typeKey = DEFAULT_TYPE_KEY;
  const hasLoaded = !!trialIds.length;
  const handleFiltersChange = useCallback((filters: VisualizationFilters) => {
    setFilters(filters);
  }, [ ]);

  const handleMetricChange = useCallback((metric: MetricName) => {
    setFilters((filters) => ({ ...filters, metric }));
  }, []);

  const fetchTrials = useCallback(async () => {
    try {

      const response = await queryTrials(
        { filters: { experimentIds: experimentIds } },
      );
      setTrialIds(response?.trials?.map((t) => t.trialId).filter(isNumber) ?? []);
    } catch (e){
      console.error(e);
    }
  }, [ experimentIds ]);

  useEffect(() => {
    fetchTrials();
  }, [ fetchTrials ]);

  useEffect(() => {
    if (!trialIds || !metrics.length) return;
    const newTrialMetrics: Record<number, TrialMetrics> = {};
    const compareTrialsParams: CompareTrialsParams = {
      maxDatapoints: 1000,
      metricNames: metrics,
      trialIds: trialIds,
    };
    compareTrials(compareTrialsParams).then((metricData) => {
      metricData.forEach(
        (trialData) => {
          const tData: TrialMetrics = {
            id: trialData.id,
            metrics: {},
          };
          trialData.metrics.forEach((metricType) => {
            metricType.data.forEach((dataPoint) => {
              tData.metrics[metricType.name] = dataPoint.value;
            });
            newTrialMetrics[tData.id] = tData;
          });
        },
      );
      setTrialMetrics(newTrialMetrics);
    });
  }, [ trialIds, metrics ]);

  if (!experimentIds.length) {
    return (
      <div className={css.alert}>
        <Spinner center className={css.alertSpinner} />
      </div>
    );
  } else if (pageError) {
    return <Message title={PAGE_ERROR_MESSAGES[pageError]} type={MessageType.Alert} />;
  }

  const visualizationFilters = (
    <TrialFilters
      batches={[]}
      filters={filters}
      fullHParams={fullHParams.current}
      metrics={metrics || []}
      type={typeKey}
      onChange={handleFiltersChange}
      onMetricChange={handleMetricChange}
    />
  );
  return (
    <div className={css.base}>
      <Tabs
        activeKey={typeKey}
        destroyInactiveTabPane
        type="card">
        <Tabs.TabPane
          key={ExperimentVisualizationType.LearningCurve}
          tab="Learning Curve">
          {(experimentIds.length > 0 && filters.metric?.name && (
            <Compare
              batches={batches}
              chartData={chartData}
              filters={visualizationFilters}
              hasLoaded={hasLoaded}
              hpVals={hpVals}
              hyperparameters={hyperparameters}
              metrics={metrics || []}
              selectedMaxTrial={filters.maxTrial}
              selectedMetric={filters.metric}
              selectedScale={filters.scale}
              trialHps={trialHps}
              trialIds={trialIds}
            />
          ))}
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default TrialsComparison;
