import { Radio } from 'antd';
import React, { useMemo, useState } from 'react';

import Page from 'components/Page';
import Section from 'components/Section';
import { V1RPQueueStat } from 'services/api-ts-sdk';
import { DURATION_DAY, secondToHour } from 'utils/datetime';

import ClusterHistoricalUsageChart from '../Cluster/ClusterHistoricalUsageChart';

import css from './ClustersQueuedChart.module.scss';

interface Props {
  poolStats: V1RPQueueStat | undefined;
}

const ClustersQueuedChart: React.FC<Props> = ({ poolStats }:Props) => {

  const [ viewDays, setViewDays ] = useState(7);

  const queuedStats = useMemo(() => {
    if(!poolStats) return;
    const { aggregates } = poolStats;
    if(aggregates) {
      const agg = aggregates.filter(
        item => Date.parse(item.periodStart) >= Date.now() - viewDays * DURATION_DAY,
      );
      // If aggregates only has one record of today, then do not display.
      const aggd = agg.length > 1 ? agg : [];
      return ({
        hoursAverage: { average: aggd.map(item => secondToHour(item.seconds)) },
        time: aggd.map(item => item.periodStart),
      });
    }
  }, [ poolStats, viewDays ]);

  if(!queuedStats) return <div />;
  return (
    <Page title="Avg Queue Time">
      <Section bodyBorder>
        <Radio.Group
          className={css.filter}
          value={viewDays}
          onChange={e => setViewDays(e.target.value)}>
          <Radio.Button value={7}>7 days</Radio.Button>
          <Radio.Button value={30}>30 days</Radio.Button>
        </Radio.Group>
        <ClusterHistoricalUsageChart
          hoursByLabel={queuedStats.hoursAverage}
          label="Queued Hours"
          time={queuedStats.time}
        />
      </Section>
    </Page>
  );
};

export default ClustersQueuedChart;
