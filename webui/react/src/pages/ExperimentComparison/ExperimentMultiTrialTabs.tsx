import { Tabs } from 'antd';
import React, { useCallback, useState } from 'react';
import { useHistory, useParams } from 'react-router';

import ExperimentTrials from 'pages/ExperimentDetails/ExperimentTrials';
import { paths } from 'routes/utils';
import Spinner from 'shared/components/Spinner/Spinner';
import { ExperimentBase, ExperimentVisualizationType } from 'types';
import handleError from 'utils/error';

import { ErrorLevel, ErrorType } from '../../shared/utils/error';

const { TabPane } = Tabs;

enum TabType {
  Configuration = 'configuration',
  Trials = 'trials',
  Visualization = 'visualization',
  Notes = 'notes',
}

interface Params {
  ids: string;
  viz?: ExperimentVisualizationType;
}

const TAB_KEYS = Object.values(TabType);
const DEFAULT_TAB_KEY = TabType.Visualization;

const ExperimentVisualization = React.lazy(() => {
  return import('./ExperimentVisualization');
});

export interface Props {
  experiment: ExperimentBase;
  fetchExperimentDetails: () => void;
  pageRef: React.RefObject<HTMLElement>;
}

const ExperimentMultiTrialTabs: React.FC<Props> = (
  { experiment, pageRef }: Props,
) => {
  const { viz, ids } = useParams<Params>();

  return (
    <Tabs className="no-padding" defaultActiveKey="visualization">
      <TabPane key="visualization" tab="Visualization">
        <React.Suspense fallback={<Spinner tip="Loading experiment visualization..." />}>
          <ExperimentVisualization
            basePath="experiment-comparison"
            experiment={experiment}
            type={viz}
          />
        </React.Suspense>
      </TabPane>
      <TabPane key="trials" tab="Trials">
        <ExperimentTrials experiment={experiment} pageRef={pageRef} />
      </TabPane>

    </Tabs>
  );
};

export default ExperimentMultiTrialTabs;
