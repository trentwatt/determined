import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import queryString from 'query-string';
import Page from 'components/Page';
import { terminalRunStates } from 'constants/states';
import { useStore } from 'contexts/Store';
import usePolling from 'hooks/usePolling';
import ExperimentDetailsHeader from 'pages/ExperimentDetails/ExperimentDetailsHeader';
import {
  getExperimentDetails, getExpValidationHistory, isNotFound,
} from 'services/api';
import Message, { MessageType } from 'shared/components/Message';
import Spinner from 'shared/components/Spinner/Spinner';
import { isEqual } from 'shared/utils/data';
import { ExperimentBase, TrialDetails, ValidationHistory } from 'types';
import { isSingleTrialExperiment } from 'utils/experiment';

import { isAborted } from '../shared/utils/service';

import ExperimentMultiTrialTabs from './ExperimentDetails/ExperimentMultiTrialTabs';
import ExperimentSingleTrialTabs from './ExperimentDetails/ExperimentSingleTrialTabs';

interface Query {
  id?: string[];
}

const ExperimentComparison: React.FC = () => {
  const location = useLocation();
  const query: Query = queryString.parse(location.search);
  const experimentIds = query.id ? query.id : [];
  
  const { auth: { user } } = useStore();
  const [ canceler ] = useState(new AbortController());
  const [ experiment, setExperiment ] = useState<ExperimentBase>();
  const [ trial, setTrial ] = useState<TrialDetails>();
  const [ valHistory, setValHistory ] = useState<ValidationHistory[]>([]);
  const [ pageError, setPageError ] = useState<Error>();
  const [ isSingleTrial, setIsSingleTrial ] = useState<boolean>();
  const pageRef = useRef<HTMLElement>(null);

  const fetchExperimentDetails = useCallback(async () => {
    try {
      const [ experimentData ] = await Promise.all(
        experimentIds.map(id => getExperimentDetails({id: parseInt(id)}, { signal: canceler.signal }))
      );
      if (!isEqual(experimentData, experiment)) setExperiment(experimentData);
    } catch (e) {
      if (!pageError && !isAborted(e)) setPageError(e as Error);
    }
  }, [
    experiment,
    experimentIds,
    canceler.signal,
    pageError,
    valHistory,
  ]);

  const { stopPolling } = usePolling(fetchExperimentDetails);

  const handleSingleTrialUpdate = useCallback((trial: TrialDetails) => {
    setTrial(trial);
  }, []);

  useEffect(() => {
    if (experiment && terminalRunStates.has(experiment.state)) {
      stopPolling();
    }
  }, [ experiment, stopPolling ]);

  useEffect(() => {
    return () => canceler.abort();
  }, [ canceler ]);

  if (!experimentIds) {
    return <Message title='No Experiments chosen for comparison'/>;
  } else if (pageError) {
    return <Message title="Unable to compare experiments" type={MessageType.Warning} />;
  } 

  return (
    <Page
      bodyNoPadding
      containerRef={pageRef}
      // headerComponent={(
      //   <ExperimentDetailsHeader
      //     curUser={user}
      //     experiment={experiment}
      //     fetchExperimentDetails={fetchExperimentDetails}
      //     trial={trial}
      //   />
      // )}
      stickyHeader
      title="Compare Experiments">
        {/* <ExperimentMultiTrialTabs
          experiment={experiment}
          fetchExperimentDetails={fetchExperimentDetails}
          pageRef={pageRef}
        /> */}
    </Page>
  );
};

export default ExperimentComparison;
