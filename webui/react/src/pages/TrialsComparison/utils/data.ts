import { V1AugmentedTrial } from 'services/api-ts-sdk';
import { Primitive, RawJson } from 'shared/types';
import { flattenObject } from 'shared/utils/data';
import { union } from 'shared/utils/set';
import {
  Metric,
  MetricType,
} from 'types';

function log<T>(x: T, annotation?: string): T {
  /* eslint-disable-next-line no-console */
  if (annotation) console.log(annotation, x);
  return x;
}

const metricEquals = (A: Metric, B: Metric) => {
  return (A.type === B.type) && (A.name === B.name);
};

export function mergeLists<T>(
  A: Array<T>,
  B: Array<T>,
  equalFn?: (a: T, b: T) => boolean,
): Array<T> {
  const e = (a: T, b: T) => a === b;
  const eq = equalFn ?? e;
  const res = [ ...A, ...B.filter((b) => A.every((a) => !eq(a, b))) ];
  // if (equalFn) console.log({ A, B, eq, res });
  return res;
}

const valMapForHParams = (hparams: RawJson): HpValsMap =>
  Object.entries(flattenObject(hparams || {}))
    .map(([ key, value ]) => ({ [String(key)]: new Set([ value ]) }))
    .reduce((a, b) => ({ ...a, ...b }), {});

const mergeHpValMaps = (A: HpValsMap, B: HpValsMap): HpValsMap => {
  const hps = mergeLists(Object.keys(A), Object.keys(B));
  return hps.map((hp) => ({ [hp]: union(A[hp] ?? new Set(), B[hp] ?? new Set()) }))
    .reduce((a, b) => ({ ...a, ...b }), {});
};

const aggregateHpVals = (agg: HpValsMap, hparams: RawJson) =>
  mergeHpValMaps(agg, valMapForHParams(hparams));

const metricsToList = (trainingMetrics: RawJson, validationMetrics: RawJson): Metric[] =>
  [ ...Object.keys(trainingMetrics)
    .map((name) => ({ name, type: MetricType.Training } as Metric)),
  ...Object.keys(validationMetrics)
    .map((name) => ({ name, type: MetricType.Validation } as Metric)),
  ];

export type HpValsMap = Record<string, Set<Primitive>>

export interface TrialsWithMetadata {
  hpVals: HpValsMap;
  maxBatch: number;
  metrics: Metric[];
  trialIds: number[];
  trials: V1AugmentedTrial[];
}

export const aggregrateTrialsMetadata =
(agg: TrialsWithMetadata, trial: V1AugmentedTrial): TrialsWithMetadata => ({

  hpVals: aggregateHpVals(agg.hpVals, trial.hparams),
  maxBatch: Math.max(agg.maxBatch, trial.totalBatches),
  metrics: log(mergeLists(
    log(agg.metrics, ''),
    log(metricsToList(trial.trainingMetrics, trial.validationMetrics), ''),
    metricEquals,
  ), ''),
  trialIds: [ ...agg.trialIds, trial.trialId ],
  trials: [ ...agg.trials, trial ],
});

export const defaultTrialData: TrialsWithMetadata = {
  hpVals: {},
  maxBatch: 1,
  metrics: [],
  trialIds: [],
  trials: [],
};
