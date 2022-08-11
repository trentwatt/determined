import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';

import useSettings, { BaseType, SettingsConfig } from 'hooks/useSettings';
import useStorage from 'hooks/useStorage';
import { getTrialsCollections, patchTrialsCollection } from 'services/api';
import {
  TrialSorterNamespace,
  V1OrderBy,
  V1TrialSorter,
} from 'services/api-ts-sdk';
import { isNumber } from 'shared/utils/data';

import { decodeTrialsCollection, encodeTrialsCollection } from './api';

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
  saveCollection: () => Promise<void>;
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
    const _collection = collections.find((c) => c.name === name);
    if (_collection?.name != null) {
      updateSettings({ collection: _collection.name });
    }
  }, [ collections, updateSettings ]);

  const fetchCollections = useCallback(async () => {
    const id = parseInt(projectId);
    if (isNumber(id)) {
      const response = await getTrialsCollections(id);
      setCollections(
        response.collections?.map(decodeTrialsCollection) ?? [],
      );
    }
  }, [ projectId ]);

  useEffect(() => {
    fetchCollections();
  }, [ fetchCollections ]);

  const saveCollection = useCallback(async () => {
    const _collection = collections.find((c) => c.name === settings?.collection);
    const newCollection = { ..._collection, filters, sorter } as TrialsCollection;
    await patchTrialsCollection(encodeTrialsCollection(newCollection));
    fetchCollections();

  }, [ collections, filters, settings?.collection, sorter, fetchCollections ]);

  useEffect(() => {
    const _collection = collections.find((c) => c.name === settings?.collection);
    const previousCollection = getPreviousCollection();
    if (_collection && (JSON.stringify(_collection) !== JSON.stringify(previousCollection))) {
      _setFilters(_collection.filters);
      setPreviousCollection(_collection);
    }
  }, [ settings?.collection, collections, getPreviousCollection, setPreviousCollection ]);

  return {
    collection: settings.collection,
    collections,
    fetchCollections,
    filters,
    resetFilters,
    saveCollection,
    setCollection,
    setFilters,
    setSorter,
    sorter,
  };
};
