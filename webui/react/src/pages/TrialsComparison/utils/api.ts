import {
  NumberRange,
  NumberRangeDict,
  TrialFilters,
  TrialsCollection,
} from 'pages/TrialsComparison/utils/collections';
import {
  TrialSorterNamespace,
  V1NumberRangeFilter,
  V1OrderBy,
  V1TrialFilters,
  V1TrialsCollection,
  V1TrialSorter,
  V1TrialTag,
} from 'services/api-ts-sdk';
import {
  isNumber,
  numberElseUndefined,
} from 'shared/utils/data';
import { camelCaseToSnake, snakeCaseToCamelCase } from 'shared/utils/string';

export const encodeTrialSorter = (s?: V1TrialSorter): V1TrialSorter =>
  s ? ({
    field: camelCaseToSnake(s.field),
    namespace: s.namespace,
    orderBy: s.orderBy,
  }) : {
    field: 'trialId',
    namespace: TrialSorterNamespace.TRIALS,
    orderBy: V1OrderBy.ASC,
  };

export const decodeTrialSorter = (s?: V1TrialSorter): V1TrialSorter =>
  s ? ({
    field: snakeCaseToCamelCase(s.field),
    namespace: s.namespace,
    orderBy: s.orderBy,
  })
    : {
      field: 'trialId',
      namespace: TrialSorterNamespace.TRIALS,
      orderBy: V1OrderBy.ASC,
    };

const encodeIdList = (l?: string[]): number[] | undefined =>
  l?.map((i) => parseInt(i)).filter((i) => isNumber(i));

const encodeNumberRangeDict = (d: NumberRangeDict): Array<V1NumberRangeFilter> =>
  Object.entries(d).map(([ key, range ]) => ({
    max: numberElseUndefined((range as NumberRange).max),
    min: numberElseUndefined((range as NumberRange).min),
    name: key,
  }));

const decodeNumberRangeDict = (d: Array<V1NumberRangeFilter>): NumberRangeDict =>
  d.map((f) => (
    {
      [f.name]: {
        max: f.max ? String(f.max) : undefined,
        min: f.min ? String(f.min) : undefined,
      },
    })).reduce((a, b) => ({ ...a, ...b }), {});

export const encodeFilters = (f: TrialFilters): V1TrialFilters => {
  return {
    experimentIds: encodeIdList(f.experimentIds),
    hparams: encodeNumberRangeDict(f.hparams ?? {}),
    projectIds: encodeIdList(f.projectIds),
    rankWithinExp: f.ranker?.rank
      ? { rank: numberElseUndefined(f.ranker.rank), sorter: encodeTrialSorter(f.ranker.sorter) }
      : undefined,
    searcher: f.searcher,
    tags: f.tags?.map((tag: string) => ({ key: tag, value: '1' })),
    trainingMetrics: encodeNumberRangeDict(f.trainingMetrics ?? {}),
    userIds: encodeIdList(f.userIds),
    validationMetrics: encodeNumberRangeDict(f.validationMetrics ?? {}),
    workspaceIds: encodeIdList(f.workspaceIds),
  };
};
export const decodeFilters = (f: V1TrialFilters): TrialFilters => ({
  experimentIds: f.experimentIds?.map(String),
  hparams: decodeNumberRangeDict(f.hparams ?? []),
  projectIds: f.projectIds?.map(String),
  ranker: {
    rank: String(f.rankWithinExp?.rank ?? 0),
    sorter: decodeTrialSorter(f.rankWithinExp?.sorter),
  },
  searcher: f.searcher,
  tags: f.tags?.map((tag: V1TrialTag) => tag.key),
  trainingMetrics: decodeNumberRangeDict(f.trainingMetrics ?? []),
  userIds: f.userIds?.map(String),
  validationMetrics: decodeNumberRangeDict(f.validationMetrics ?? []),
  workspaceIds: f.workspaceIds?.map(String),
});

export const decodeTrialsCollection = (c: V1TrialsCollection): TrialsCollection =>
  ({
    filters: decodeFilters(c.filters),
    id: String(c.id),
    name: c.name,
    projectId: String(c.projectId),
    sorter: decodeTrialSorter(c.sorter),
    userId: String(c.userId),
  });

export const encodeTrialsCollection = (c: TrialsCollection): V1TrialsCollection => ({
  filters: encodeFilters(c.filters),
  id: parseInt(c.id),
  name: c.name,
  projectId: parseInt(c.projectId),
  sorter: encodeTrialSorter(c.sorter),
  userId: parseInt(c.userId),
});
