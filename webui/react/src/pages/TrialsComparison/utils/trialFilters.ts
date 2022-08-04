import { NumberRangeDict, TrialFilters } from 'pages/TrialsComparison/types';
import { V1NumberRangeFilter,
  V1TrialFilters,
  V1TrialSorter } from 'services/api-ts-sdk';
import { camelCaseToSnake } from 'shared/utils/string';

const encodeNumberRangeDict = (d :NumberRangeDict): Array<V1NumberRangeFilter> =>
  Object.entries(d).map(([ key, range ]) => ({ max: range[1], min: range[0], name: key }));

export const encodeTrialSorter = (s: V1TrialSorter): V1TrialSorter => ({
  field: camelCaseToSnake(s.field),
  namespace: s.namespace,
  orderBy: s.orderBy,
});

export const encodeFilters = (f: TrialFilters, s: V1TrialSorter): V1TrialFilters => {
  return {
    experimentIds: f.experimentIds,
    hparams: encodeNumberRangeDict(f.hparams ?? {}),
    projectIds: f.projectIds,
    rankWithinExp: { rank: f.rankWithinExp, sorter: encodeTrialSorter(s) },
    searcher: f.searcher,
    tags: f.tags?.map((tag) => ({ key: tag })),
    trainingMetrics: encodeNumberRangeDict(f.trainingMetrics ?? {}),
    userIds: f.userIds,
    validationMetrics: encodeNumberRangeDict(f.validationMetrics ?? {}),
    workspaceIds: f.workspaceIds,
  };
};
