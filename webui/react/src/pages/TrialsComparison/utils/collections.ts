import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';

import useSettings, { BaseType, SettingsConfig } from 'hooks/useSettings';
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
  collection: string;
  collections: TrialsCollection[];
  fetchCollections: () => Promise<void>;
  filters: TrialFilters;
  resetFilters: () => void;
  setCollection: (name: string) => void;
  setFilters: SetFilters;
  setSorter :Dispatch<SetStateAction<V1TrialSorter>>
  sorter: V1TrialSorter;
}

const collectionStoragePath = (projectId: string) => `collection/${projectId}`;

const config = (projectId: string): SettingsConfig => ({
  applicableRoutespace: '/trials',
  settings: [
    {
      defaultValue: '',
      key: 'collection',
      storageKey: 'collection',
      type: { baseType: BaseType.String },
    } ],
  storagePath: collectionStoragePath(projectId),
});

const getDefaultFilters = (projectId: string) => (
  { projectIds: [ String(projectId) ] }
);

export const useTrialCollections = (projectId: string): TrialsCollectionInterface => {
  const filterStorage = useStorage(`trial-filters}/${projectId ?? 1}`);
  const initFilters = filterStorage.getWithDefault<TrialFilters>(
    'filters',
    getDefaultFilters(projectId),
  );

  const [ sorter, setSorter ] = useState<V1TrialSorter>({
    field: 'trialId',
    namespace: TrialSorterNamespace.TRIALS,
    orderBy: V1OrderBy.ASC,
  });

  const [ filters, _setFilters ] = useState<TrialFilters>(initFilters);

  const setFilters = useCallback((fs: FilterSetter) => {
    _setFilters((filters) => {
      if (!filters) return filters;
      const f = fs(filters);
      filterStorage.set('filters', f);
      return f;
    });
  }, [ filterStorage ]);

  const saveCollection = useCallback(() => {

  }, []);

  const resetFilters = useCallback(() => {
    filterStorage.remove('filters');
  }, [ filterStorage ]);

  const [ collections, setCollections ] = useState<TrialsCollection[]>([]);

  const { settings, updateSettings } =
  useSettings<{collection: string}>(config(projectId));

  const previousCollectionStorage = useStorage(`previous-collection/${projectId}`);

  const getPreviousCollection = useCallback(
    () => previousCollectionStorage.get('collection'),
    [ previousCollectionStorage ],
  );

  const setPreviousCollection = useCallback(
    (c) => previousCollectionStorage.set('collection', c),
    [ previousCollectionStorage ],
  );

  const setCollection = useCallback((name: string) => {
    const collection = collections.find((c) => c.name === name);
    if (collection?.name != null) {
      updateSettings({ collection: collection.name });
    }
  }, [ collections, updateSettings ]);

  useEffect(() => {
    const collection = collections.find((c) => c.name === settings?.collection);
    const previousCollection = getPreviousCollection();
    if (collection && (JSON.stringify(collection) !== JSON.stringify(previousCollection))) {
      _setFilters(collection.filters);
      setPreviousCollection(collection);
    }
  }, [ settings?.collection, collections, getPreviousCollection, setPreviousCollection ]);

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

  return {
    collection: settings.collection,
    collections,
    fetchCollections,
    filters,
    resetFilters,
    setCollection,
    setFilters,
    setSorter,
    sorter,
  };
};
