import React, { useCallback, useMemo } from 'react';

import useSettings from 'hooks/useSettings';
import TrialInfoBox from 'pages/TrialDetails/TrialInfoBox';
import { ExperimentBase, Metric, MetricType, TrialDetails } from 'types';
import { extractMetrics } from 'utils/metric';

import TrialChart from './TrialChart';
import css from './TrialDetailsOverview.module.scss';
import settingsConfig, { Settings } from './TrialDetailsOverview.settings';
import TrialDetailsWorkloads from './TrialDetailsWorkloads';

export interface Props {
  experiment: ExperimentBase;
  trial?: TrialDetails;
}

const TrialDetailsOverview: React.FC<Props> = ({ experiment, trial }: Props) => {
  const storagePath = `trial-detail/experiment/${experiment.id}`;
  const {
    settings,
    updateSettings,
  } = useSettings<Settings>(settingsConfig, { storagePath });

  const { defaultMetrics, metrics, selectedMetrics } = useMemo(() => {
    const validationMetric = experiment?.config?.searcher.metric;
    const metrics = extractMetrics(trial?.workloads || []);
    const defaultValidationMetric = metrics.find((metricName) => (
      metricName.name === validationMetric && metricName.type === MetricType.Validation
    ));
    const fallbackMetric = metrics[0];
    const defaultMetric = defaultValidationMetric || fallbackMetric;
    const defaultMetrics = defaultMetric ? [ defaultMetric ] : [];
    const settingMetrics: Metric[] = (settings.metric || []).map((metric) => {
      const splitMetric = metric.split('|');
      return { name: splitMetric[1], type: splitMetric[0] as MetricType };
    });
    const selectedMetrics = settingMetrics.length !== 0 ? settingMetrics : defaultMetrics;
    return { defaultMetrics, metrics, selectedMetrics };
  }, [ experiment?.config?.searcher, settings.metric, trial?.workloads ]);

  const handleMetricChange = useCallback((value: Metric[]) => {
    const newMetrics = value.map((metricName) => `${metricName.type}|${metricName.name}`);
    updateSettings({ metric: newMetrics, tableOffset: 0 });
  }, [ updateSettings ]);

  return (
    <div className={css.base}>
      <TrialInfoBox experiment={experiment} trial={trial} />
      <TrialChart
        defaultMetrics={defaultMetrics}
        metrics={metrics}
        selectedMetrics={selectedMetrics}
        trialId={trial?.id}
        workloads={trial?.workloads}
        onMetricChange={handleMetricChange}
      />
      <TrialDetailsWorkloads
        defaultMetrics={defaultMetrics}
        experiment={experiment}
        selectedMetrics={metrics}
        settings={settings}
        trial={trial}
        updateSettings={updateSettings}
      />
    </div>
  );
};

export default TrialDetailsOverview;
