import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';

import { BaseType, SettingsConfig } from 'hooks/useSettings';
import useStorage from 'hooks/useStorage';
import { getTrialCollection } from 'services/api';
import {

  TrialSorterNamespace,
  V1OrderBy,
  V1TrialSorter,
} from 'services/api-ts-sdk';
import { isNumber } from 'shared/utils/data';

import { decodeTrialsCollection } from './api';

export interface NumberRange {
  max?: string;
  min?: string;
}

export type NumberRangeDict = Record<string, NumberRange>

interface ranker {
  rank?: string;
  sorter: V1TrialSorter;
}

export interface TrialFilters {
  experimentIds?: string[];
  hparams?: NumberRangeDict;
  projectIds?: string[];
  ranker?: ranker;
  searcher?: string;
  tags?: string[];
  trainingMetrics?: NumberRangeDict;
  userIds?: string[];
  validationMetrics?:NumberRangeDict;
  workspaceIds?: string[];
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

export interface TrialsCollection {
  filters: TrialFilters;
  id: string;
  name: string;
  projectId: string;
  sorter: V1TrialSorter;
  userId: string;
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

export type SetFilters = (fs: FilterSetter) => void;

interface TrialsCollectionInterface {
  collectionId: string;
  collections: TrialsCollection[];
  fetchCollections: () => Promise<void>;
  filters: TrialFilters;
  resetFilters: () => void;
  setCollectionId: Dispatch<SetStateAction<string>>;
  setFilters: SetFilters;
  setSorter :Dispatch<SetStateAction<V1TrialSorter>>
  sorter: V1TrialSorter;
}
const config: SettingsConfig = {
  applicableRoutespace: '/trials',
  settings: [
    {
      defaultValue: '',
      key: 'collection',
      storageKey: 'collection',
      type: { baseType: BaseType.String },
    } ],
  storagePath: 'trials-collection',
};

const getDefaultFilters = (projectId: string) => (
  { projectIds: [ String(projectId) ] }
);

export const useTrialCollections = (projectId: string): TrialsCollectionInterface => {
  const storage = useStorage(`trial-filters}/${projectId ?? 1}`);
  const initFilters = storage.getWithDefault<TrialFilters>(
    'filters',
    getDefaultFilters(projectId),
  );

  const [ collections, setCollections ] = useState<TrialsCollection[]>([]);
  const [ collectionId, setCollectionId ] = useState<string>('');
  const [ sorter, setSorter ] = useState<V1TrialSorter>({
    field: 'trialId',
    namespace: TrialSorterNamespace.TRIALS,
    orderBy: V1OrderBy.ASC,
  });

  const fetchCollections = useCallback(async () => {
    const id = parseInt(projectId);
    if (isNumber(id)) {
      const response = await getTrialCollection(id);
      setCollections(
        response.collections?.map(decodeTrialsCollection) ?? [],
      );

    }
  }, [ projectId ]);

  useEffect(() => {
    fetchCollections();
  }, [ fetchCollections ]);

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
    collectionId,
    collections,
    fetchCollections,
    filters,
    resetFilters,
    setCollectionId,
    setFilters,
    setSorter,
    sorter,
  };
};
