import { V1AugmentedTrial } from 'services/api-ts-sdk';
import { Primitive, RawJson } from 'shared/types';
import { flattenObject } from 'shared/utils/data';
import { union } from 'shared/utils/set';
import {
  MetricName,
  MetricType,
} from 'types';

function log<T>(x: T): T {
  console.log(x);
  return x;
}

function mergeLists<T>(A: Array<T>, B: Array<T>, equalFn = (x: T, y: T) => x === y): Array<T> {
  return [ ...A, ...B.filter((b) => !A.some((a) => equalFn(a, b))) ];
}

const metricEquals = (A: MetricName, B: MetricName) => {
  return A.type === B.type && A.name === B.name;
};

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

const namesForMetrics = (trainingMetrics: RawJson, validationMetrics: RawJson): MetricName[] =>
  [ ...Object.keys(log(trainingMetrics))
    .map((name) => ({ name, type: MetricType.Training } as MetricName)),
  ...Object.keys(validationMetrics)
    .map((name) => ({ name, type: MetricType.Validation } as MetricName)),
  ];

export type HpValsMap = Record<string, Set<Primitive>>

export interface TrialsWithMetadata {
  hpVals: HpValsMap;
  maxBatch: number;
  metrics: MetricName[];
  trialIds: number[];
  trials: V1AugmentedTrial[];
}

export const aggregrateTrialsMetadata =
(agg: TrialsWithMetadata, trial: V1AugmentedTrial): TrialsWithMetadata => ({
  hpVals: aggregateHpVals(agg.hpVals, trial.hparams),
  maxBatch: Math.max(
    agg.maxBatch,
    // trial.maxBatch   need to add this to API
    0,
  ),
  metrics: mergeLists(
    agg.metrics,
    namesForMetrics(trial.trainingMetrics, trial.validationMetrics),
    metricEquals,
  ),
  trialIds: [ ...agg.trialIds, trial.trialId ],
  trials: [ ...agg.trials, trial ],
});

export const defaultTrialsData: TrialsWithMetadata = {
  hpVals: {},
  maxBatch: 100,
  metrics: [],
  trialIds: [],
  trials: [],
};
