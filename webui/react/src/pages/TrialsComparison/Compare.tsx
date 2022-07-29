import { Alert } from 'antd';
import React, { useCallback, useRef, useState } from 'react';

import LearningCurveChart from 'components/LearningCurveChart';
import Section from 'components/Section';
import TableBatch, {SelectionMode} from 'components/TableBatch';
import { openOrCreateTensorBoard } from 'services/api';
import Spinner from 'shared/components/Spinner/Spinner';
import { ErrorLevel, ErrorType } from 'shared/utils/error';
import { Scale } from 'types';
import {
  ExperimentAction as Action, TrialAction, CommandTask, Hyperparameter,
  MetricName,
} from 'types';
import handleError from 'utils/error';
import { openCommand } from 'utils/wait';

import { ErrorLevel, ErrorType } from 'shared/utils/error';
import { HpValsMap } from './TrialsComparison';

import css from './Compare.module.scss';
import CompareTable, { TrialHParams, TrialMetrics } from './TrialsTable/TrialsTable';
import Page from 'components/Page';

interface Props {
  batches: number[]
  chartData: (number | null)[][];
  filters?: React.ReactNode;
  // fullHParams: string[];
  hasLoaded: boolean;
  hpVals: HpValsMap
  hyperparameters: Record<string, Hyperparameter>;
  selectedMaxTrial: number;
  selectedMetric: MetricName
  selectedScale: Scale;
  trialHps: TrialHParams[];
  trialIds: number[];
  metrics: MetricName[];
  colorMap?: Record<number, string>;
}

const Compare: React.FC<Props> = ({
  hpVals,
  filters,
  // fullHParams,
  selectedMetric,
  selectedScale,
  trialHps,
  chartData,
  trialIds,
  batches,
  hyperparameters,
  hasLoaded,
  metrics,
  colorMap
}: Props) => {
  const containerRef = useRef<HTMLElement>(null);

  const [ selectedRowKeys, setSelectedRowKeys ] = useState<number[]>([]);
  const [ highlightedTrialId, setHighlightedTrialId ] = useState<number>();
  const [selectDisabled, setSelectDisabled] = useState(false);
  const [selectionMode, setSelectionMode,] = useState<SelectionMode>();
  const hasTrials = trialIds.length !== 0;

  const handleTrialFocus = useCallback((trialId: number | null) => {
    setHighlightedTrialId(trialId != null ? trialId : undefined);
  }, []);

  const handleTableMouseEnter = useCallback((event: React.MouseEvent, record: TrialHParams) => {
    if (record.id) setHighlightedTrialId(record.id);
  }, []);

  const handleTableMouseLeave = useCallback(() => {
    setHighlightedTrialId(undefined);
  }, []);

  const clearSelected = useCallback(() => {
    setSelectedRowKeys([]);
  }, []);

  const handleSelectMatching = useCallback(() => {
    setSelectDisabled(true);
    setSelectionMode(SelectionMode.SELECT_MATCHING);
  }, []);
  
  const handleSelectIndividual = useCallback(() => {
    setSelectDisabled(false);
    setSelectionMode(SelectionMode.SELECT_INDIVIDUAL);
  }, []);

  const sendBatchActions = useCallback(async (action: Action) => {
    if (action === Action.OpenTensorBoard) {
      return await openOrCreateTensorBoard({ trialIds: selectedRowKeys });
    }
  }, [ selectedRowKeys ]);

  const submitBatchAction = useCallback(async (action: Action) => {
    try {
      const result = await sendBatchActions(action);
      if (action === Action.OpenTensorBoard && result) {
        openCommand(result as CommandTask);
      }
    } catch (e) {
      const publicSubject = action === Action.OpenTensorBoard ?
        'Unable to View TensorBoard for Selected Trials' :
        `Unable to ${action} Selected Trials`;
      handleError(e, {
        level: ErrorLevel.Error,
        publicMessage: 'Please try again later.',
        publicSubject,
        silent: false,
        type: ErrorType.Server,
      });
    }
  }, [ sendBatchActions ]);

  const handleTableRowSelect = useCallback((rowKeys) => setSelectedRowKeys(rowKeys), []);

  if (hasLoaded && !hasTrials) {
    return (
      <div className={css.waiting}>
        <Alert
          description="Please wait until the experiment is further along."
          message="Not enough data points to plot."
        />
        <Spinner />
      </div>
    );
  }

  return (
    <Page containerRef={containerRef} className={css.base}>
      <Section bodyBorder bodyScroll filters={filters} loading={!hasLoaded}>
        <div className={css.container}>
          <div className={css.chart}>
            <LearningCurveChart
              colorMap={colorMap}
              data={chartData}
              focusedTrialId={highlightedTrialId}
              selectedMetric={selectedMetric}
              selectedScale={selectedScale}
              selectedTrialIds={selectedRowKeys}
              trialIds={trialIds}
              xValues={batches}
              onTrialFocus={handleTrialFocus}
            />
          </div>
          <TableBatch
            actions={[
              { label: Action.OpenTensorBoard, value: Action.OpenTensorBoard },
              { label: TrialAction.BulkAddTags, value: TrialAction.BulkAddTags },
              { label: TrialAction.BulkRemoveTags, value: TrialAction.BulkRemoveTags },
            ]}
            selectedRowCount={selectedRowKeys.length}
            onAction={action => submitBatchAction(action as Action)}
            onSelectMatching={handleSelectMatching}
            onSelectIndividual={handleSelectIndividual}
            selectionMode={selectionMode}
            onClear={clearSelected}
          />
          <CompareTable
            containerRef={containerRef}
            handleTableRowSelect={handleTableRowSelect}
            highlightedTrialId={highlightedTrialId}
            hpVals={hpVals}
            hyperparameters={hyperparameters}
            metric={selectedMetric}
            selectedRowKeys={selectedRowKeys}
            selection={true}
            trialHps={trialHps}
            trialIds={trialIds}
            metrics={metrics}
            onMouseEnter={handleTableMouseEnter}
            onMouseLeave={handleTableMouseLeave}
            selectDisabled={selectDisabled}
          />
        </div>
      </Section>
    </Page>
  );
};

export default Compare;
