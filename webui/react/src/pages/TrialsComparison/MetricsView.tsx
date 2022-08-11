import React, { useCallback, useEffect, useReducer } from 'react';

// import IconButton from 'components/IconButton';
import MetricSelectFilter from 'components/MetricSelectFilter';
import ScaleSelectFilter from 'components/ScaleSelectFilter';
import { Scale } from 'types';
import { Metric } from 'types';

// import css from './MetricsView.module.scss';

export enum Layout {
  Grid = 'grid',
  List = 'list',
}

export interface MetricView {
  layout: Layout;
  metric: Metric;
  scale: Scale;
}

interface Props {
  metrics: Metric[];
  onChange?: (view: MetricView) => void;
  onReset?: () => void;
  view: MetricView;
}

enum ActionType {
  Set,
  SetMetric,
  SetLayout,
  SetScale,
}
type Action =
| { type: ActionType.Set; value: MetricView }
| { type: ActionType.SetMetric; value: Metric }
| { type: ActionType.SetLayout; value: Layout }
| { type: ActionType.SetScale; value: Scale }

export const MAX_HPARAM_COUNT = 10;

const reducer = (state: MetricView, action: Action) => {
  switch (action.type) {
    case ActionType.SetMetric:
      return { ...state, metric: action.value };
    case ActionType.SetLayout:
      return { ...state, view: action.value };
    case ActionType.SetScale:
      return { ...state, scale: action.value };
    default:
      return state;
  }
};

const MetricsView: React.FC<Props> = ({
  view,
  metrics,
  onChange,
  // onReset,
}: Props) => {
  const [ localView, dispatch ] = useReducer(reducer, view);

  // const handleLayoutChange = useCallback((layout: SelectValue) => {
  //   dispatch({ type: ActionType.SetLayout, value: layout as Layout });
  // }, []);

  const handleScaleChange = useCallback((scale: Scale) => {
    dispatch({ type: ActionType.SetScale, value: scale });
  }, []);

  const handleMetricChange = useCallback((metric: Metric) => {
    dispatch({ type: ActionType.SetMetric, value: metric });
  }, [ ]);

  // const handleReset = useCallback(() => {
  //   dispatch({ type: ActionType.Set, value: view });
  //   if (onReset) onReset();
  // }, [ onReset, view ]);

  useEffect(() => {
    if (onChange) onChange(localView);
  }, [ localView, onChange ]);

  return (
    <>
      <MetricSelectFilter
        defaultMetrics={metrics}
        label="Metric"
        metrics={metrics}
        multiple={false}
        value={localView.metric}
        width={'100%'}
        onChange={handleMetricChange}
      />
      <ScaleSelectFilter value={localView.scale} onChange={handleScaleChange} />
    </>
  );
};

export default MetricsView;
