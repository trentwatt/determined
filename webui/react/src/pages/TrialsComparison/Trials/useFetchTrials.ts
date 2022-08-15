import { useCallback, useState } from 'react';

import usePolling from 'hooks/usePolling';
import { queryTrials } from 'services/api';
import { V1TrialSorter } from 'services/api-ts-sdk';
import handleError from 'utils/error';

import { encodeFilters, encodeTrialSorter } from '../api';
import { TrialFilters } from '../Collections/filters';

import { decodeTrialsWithMetadata, defaultTrialData, TrialsWithMetadata } from './data';

interface Props {
  filters: TrialFilters;
  sorter: V1TrialSorter;
}
export const useFetchTrials = ({ filters, sorter }: Props): TrialsWithMetadata => {
  const [ trials, setTrials ] = useState<TrialsWithMetadata>(defaultTrialData());
  const fetchTrials = useCallback(async () => {
    try {
      const response = await queryTrials({
        filters: encodeFilters(filters),
        // limit: pageSize,
        sorter: encodeTrialSorter(sorter),
      });
      const newTrials = decodeTrialsWithMetadata(response.trials);
      if (newTrials)
        setTrials(newTrials);

    } catch (e) {
      handleError(e, { publicSubject: 'Unable to fetch trials.' });
    }
  }, [ filters, sorter ]);

  usePolling(fetchTrials, { interval: 200000, rerunOnNewFn: true });

  return trials;
};
