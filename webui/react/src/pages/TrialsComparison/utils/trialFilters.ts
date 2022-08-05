import { NumberRangeDict, TrialFilters } from 'pages/TrialsComparison/types';
import { V1NumberRangeFilter,
  V1TrialFilters,
  V1TrialSorter } from 'services/api-ts-sdk';
import { isNumber, numberElseUndefined } from 'shared/utils/data';
import { camelCaseToSnake } from 'shared/utils/string';

const encodeNumberRangeDict = (d :NumberRangeDict): Array<V1NumberRangeFilter> =>
  Object.entries(d).map(([ key, range ]) =>
    ({
      max: numberElseUndefined(range.max),
      min: numberElseUndefined(range.min),
      name: key,
    }));

export const encodeTrialSorter = (s: V1TrialSorter): V1TrialSorter => ({
  field: camelCaseToSnake(s.field),
  namespace: s.namespace,
  orderBy: s.orderBy,
});

const encodeIdList = (l?: string[]): number[] | undefined => l?.map((i) => parseInt(i)).filter((i) => isNumber(i));
export const encodeFilters = (f: TrialFilters, s: V1TrialSorter): V1TrialFilters => {
  return {
    experimentIds: encodeIdList(f.experimentIds),
    hparams: encodeNumberRangeDict(f.hparams ?? {}),
    projectIds: encodeIdList(f.projectIds),
    rankWithinExp: { rank: f.rankWithinExp, sorter: encodeTrialSorter(s) },
    searcher: f.searcher,
    tags: f.tags?.map((tag) => ({ key: tag })),
    trainingMetrics: encodeNumberRangeDict(f.trainingMetrics ?? {}),
    userIds: encodeIdList(f.userIds),
    validationMetrics: encodeNumberRangeDict(f.validationMetrics ?? {}),
    workspaceIds: encodeIdList(f.workspaceIds),
  };
};
