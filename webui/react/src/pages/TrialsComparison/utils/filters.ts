import { useCallback, useState } from 'react';

import useStorage from 'hooks/useStorage';
import { V1NumberRangeFilter,
  V1TrialFilters,
  V1TrialSorter } from 'services/api-ts-sdk';
import { isNumber, numberElseUndefined } from 'shared/utils/data';
import { camelCaseToSnake } from 'shared/utils/string';

interface NumberRange {
  max?: string;
  min?: string;
}

export type NumberRangeDict = Record<string, NumberRange>

interface ranker {
  rank?: string;
  sorter: V1TrialSorter;
}

export interface TrialFilters {
  experimentIds?: Array<string>;
  hparams?: NumberRangeDict;
  projectIds?: Array<string>;
  ranker?: ranker;
  searcher?: string;
  tags?: string[];
  trainingMetrics?: NumberRangeDict;
  userIds?: Array<string>;
  validationMetrics?:NumberRangeDict;
  workspaceIds?: Array<string>;
}

export type FilterSetter = (prev: TrialFilters) => TrialFilters

export interface TrialsSelection {
  sorter?: V1TrialSorter;
  trialIds: number[];
}
export interface TrialsCollectionSpec {
  filters: TrialFilters;
  sorter?: V1TrialSorter;
}

export type TrialsSelectionOrCollection = TrialsSelection | TrialsCollectionSpec

export const isTrialsSelection = (t: TrialsSelectionOrCollection): t is TrialsSelection =>
  ('trialIds' in t);

export const isTrialsCollection = (t: TrialsSelectionOrCollection): t is TrialsCollectionSpec =>
  ('filters' in t);

export const getDescriptionText = (t: TrialsSelectionOrCollection): string =>
  isTrialsCollection(t)
    ? 'filtered trials'
    : t.trialIds.length === 1
      ? `trial ${t.trialIds[0]}`
      : `${t.trialIds.length} trials`;

const encodeNumberRangeDict = (d :NumberRangeDict): Array<V1NumberRangeFilter> =>
  Object.entries(d).map(([ key, range ]) =>
    ({
      max: numberElseUndefined((range as NumberRange).max),
      min: numberElseUndefined((range as NumberRange).min),
      name: key,
    }));

export const encodeTrialSorter = (s: V1TrialSorter): V1TrialSorter => ({
  field: camelCaseToSnake(s.field),
  namespace: s.namespace,
  orderBy: s.orderBy,
});

const encodeIdList = (l?: string[]): number[] | undefined =>
  l?.map((i) => parseInt(i))
    .filter((i) => isNumber(i));

export const encodeFilters = (f: TrialFilters): V1TrialFilters => {
  return {
    experimentIds: encodeIdList(f.experimentIds),
    hparams: encodeNumberRangeDict(f.hparams ?? {}),
    projectIds: encodeIdList(f.projectIds),
    rankWithinExp:
      (f.ranker?.rank)
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

export type SetFilters = (fs: FilterSetter) => void;

interface TrialFiltersInterface {
  filters: TrialFilters;
  resetFilters: () => void;
  setFilters: SetFilters;
}

const getDefaultFilters = (projectId: string) => (
  { projectIds: [ String(projectId) ] }
);

export const useTrialFilters = (projectId: string): TrialFiltersInterface => {
  const storage = useStorage(`trial-filters}/${projectId ?? 1}`);
  const initFilters = storage.getWithDefault<TrialFilters>(
    'filters',
    getDefaultFilters(projectId),
  );

  const [ filters, _setFilters ] = useState<TrialFilters>(initFilters);

  const setFilters = useCallback((fs: FilterSetter) => {
    _setFilters((filters) => {
      if (!filters) return filters;
      const f = fs(filters);
      storage.set('filters', f);
      return f;
    });
  }, [ storage ]);

  const resetFilters = useCallback(() => {
    storage.remove('filters');
  }, [ storage ]);

  return {
    filters,
    resetFilters,
    setFilters,
  };
};
