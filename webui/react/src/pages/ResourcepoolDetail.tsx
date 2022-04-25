import { Divider, Tabs } from 'antd';
import React, { Fragment, useCallback, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router';

import Icon from 'components/Icon';
import Json from 'components/Json';
import Page from 'components/Page';
import { poolLogo } from 'components/ResourcePoolCard';
import { RenderAllocationBarResourcePool } from 'components/ResourcePoolCardLight';
import Section from 'components/Section';
import { useStore } from 'contexts/Store';
import { paths } from 'routes/utils';
import { ShirtSize } from 'themes';
import { ResourceState } from 'types';
import { JobState } from 'types';
import { getSlotContainerStates } from 'utils/cluster';
import { clone } from 'utils/data';
import { camelCaseToSentence } from 'utils/string';

import ClustersQueuedChart from './Clusters/ClustersQueuedChart';
import JobQueue from './JobQueue/JobQueue';
import css from './ResourcepoolDetail.module.scss';

interface Params {
  poolname?: string;
  tab?: TabType;
}
const { TabPane } = Tabs;

enum TabType {
  Active = 'active',
  Queued = 'queued',
  Stats = 'stats',
  Configuration = 'configuration'
}
const DEFAULT_TAB_KEY = TabType.Active;

const ResourcepoolDetail: React.FC = () => {

  const { poolname } = useParams<Params>();
  const { agents, resourcePools } = useStore();

  const pool = useMemo(() => {
    return resourcePools.find(pool => pool.name === poolname);
  }, [ poolname, resourcePools ]);

  const usage = useMemo(() => {
    if(!pool) return 0;
    // const isAux = pool.auxContainerCapacityPerAgent > 0;
    const totalSlots = pool.maxAgents * (pool.slotsPerAgent ?? 0);
    const resourceStates = getSlotContainerStates(agents || [], pool.slotType, pool.name);
    const runningState = resourceStates.filter(s => s === ResourceState.Running).length;
    const slotsPotential = pool.maxAgents * (pool.slotsPerAgent ?? 0);
    const slotsAvaiablePer = slotsPotential && slotsPotential > totalSlots
      ? (totalSlots / slotsPotential) : 1;
    return totalSlots < 1 ? 0 : (runningState / totalSlots) * slotsAvaiablePer;
  }, [ pool, agents ]);

  const { tab } = useParams<Params>();

  const history = useHistory();

  const [ tabKey, setTabKey ] = useState<TabType>(tab || DEFAULT_TAB_KEY);

  const handleTabChange = useCallback(key => {
    if(!pool) return;
    setTabKey(key);
    const basePath = paths.resourcePool(pool.name);
    history.replace(key === DEFAULT_TAB_KEY ? basePath : `${basePath}/${key}`);
  }, [ history, pool ]);

  const renderPoolConfig = useCallback(() => {
    if(!pool) return;
    const details = clone(pool.details);
    for (const key in details) {
      if (details[key] === null) {
        delete details[key];
      }
    }

    const mainSection = clone(pool);
    delete mainSection.details;
    return (
      <Page>
        <Json json={mainSection} translateLabel={camelCaseToSentence} />
        {Object.keys(details).map(key => (
          <Fragment key={key}>
            <Divider />
            <div className={css.subTitle}>{camelCaseToSentence(key)}</div>
            <Json json={details[key]} translateLabel={camelCaseToSentence} />
          </Fragment>
        ))}
      </Page>
    );
  }, [ pool ]);

  if(!pool) return <div />;
  return (
    <Page>
      <Section>
        <div className={css.nav} onClick={() => history.goBack()}>
          <Icon name="arrow-left" size="tiny" />
          <div className={css.icon}>{poolLogo(pool.type)}</div>
          <div>{`${pool.name} ${usage ? `- ${(usage * 100).toFixed()}%` : '' } `}</div>
        </div>

      </Section>
      <Section>
        <RenderAllocationBarResourcePool resourcePool={pool} size={ShirtSize.huge} />
      </Section>
      <Section>
        <Tabs
          className="no-padding"
          defaultActiveKey={tabKey}
          destroyInactiveTabPane={true}
          onChange={handleTabChange}>
          <TabPane key="active" tab={`Active ${pool.stats?.scheduledCount}`}>
            <JobQueue jobState={JobState.SCHEDULED} selected={pool} />
          </TabPane>
          <TabPane key="queued" tab={`Queued ${pool.stats?.queuedCount}`}>
            <JobQueue jobState={JobState.QUEUED} selected={pool} />
          </TabPane>
          <TabPane key="stats" tab="Stats">
            <ClustersQueuedChart poolName={pool.name} />
          </TabPane>
          <TabPane key="configuration" tab="Configuration">
            {renderPoolConfig()}
          </TabPane>
        </Tabs>
      </Section>

    </Page>
  );

};

export default ResourcepoolDetail;