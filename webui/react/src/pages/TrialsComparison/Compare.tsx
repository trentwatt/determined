import { Alert } from 'antd';
import React, { useCallback, useRef, useState } from 'react';
import { openCommand } from 'wait';

import LearningCurveChart from 'components/LearningCurveChart';
import Page from 'components/Page';
import Section from 'components/Section';
import TableBatch, { SelectionMode } from 'components/TableBatch';
import useModalTrialTag from 'hooks/useModal/Trial/useModalTrialTag';
import { openOrCreateTensorBoard } from 'services/api';
import Spinner from 'shared/components/Spinner/Spinner';
import { ErrorLevel, ErrorType } from 'shared/utils/error';
import { Scale } from 'types';
import {
  CommandTask, Hyperparameter, MetricName,
  TrialAction,
} from 'types';
import handleError from 'utils/error';

import css from './Compare.module.scss';
import { HpValsMap } from './TrialsComparison';
import CompareTable, { TrialHParams, TrialMetrics } from './TrialsTable/TrialsTable';

interface Props {
  batches: number[]
  chartData: (number | null)[][];
  colorMap?: Record<number, string>;
  filters?: React.ReactNode;
  // fullHParams: string[];
  hasLoaded: boolean;
  hpVals: HpValsMap
  hyperparameters: Record<string, Hyperparameter>;
  metrics: MetricName[];
  selectedMaxTrial: number;
  selectedMetric: MetricName
  selectedScale: Scale;
  trialHps: TrialHParams[];
  trialIds: number[];
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
  colorMap,
}: Props) => {
  const containerRef = useRef<HTMLElement>(null);

  const [ selectedRowKeys, setSelectedRowKeys ] = useState<number[]>([]);
  const [ highlightedTrialId, setHighlightedTrialId ] = useState<number>();
  const [ selectDisabled, setSelectDisabled ] = useState(false);
  const [ selectionMode, setSelectionMode ] = useState<SelectionMode>();
  const hasTrials = trialIds.length !== 0;

  const {
    contextHolder: modalTrialTagContextHolder,
    modalOpen: openModalCreate,
  } = useModalTrialTag({});

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

  const sendBatchActions = useCallback(async (action: TrialAction) => {
    if (action === TrialAction.OpenTensorBoard) {
      return await openOrCreateTensorBoard({ trialIds: selectedRowKeys });
    }
  }, [ selectedRowKeys ]);

  const submitBatchAction = useCallback(async (action: TrialAction) => {
    try {
      if (action == TrialAction.BulkAddTags){
        openModalCreate({ trialIds: trialIds });
      } else {
        const result = await sendBatchActions(action);
        if (action === TrialAction.OpenTensorBoard && result) {
          openCommand(result as CommandTask);
        }
      }
    } catch (e) {
      const publicSubject = action === TrialAction.OpenTensorBoard ?
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

  const individualBatchActions = [
    { label: TrialAction.OpenTensorBoard, value: TrialAction.OpenTensorBoard },
  ];

  const filterBatchActions = [ { label: TrialAction.BulkAddTags, value: TrialAction.BulkAddTags },
    { label: TrialAction.BulkRemoveTags, value: TrialAction.BulkRemoveTags },
  ];
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
    <Page className={css.base} containerRef={containerRef}>
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
            actions={selectDisabled ? filterBatchActions : individualBatchActions}
            selectedRowCount={selectedRowKeys.length}
            selectionMode={selectionMode}
            onAction={(action) => submitBatchAction(action as TrialAction)}
            onClear={clearSelected}
            onSelectIndividual={handleSelectIndividual}
            onSelectMatching={handleSelectMatching}
          />
          <CompareTable
            containerRef={containerRef}
            handleTableRowSelect={handleTableRowSelect}
            highlightedTrialId={highlightedTrialId}
            hpVals={hpVals}
            hyperparameters={hyperparameters}
            metric={selectedMetric}
            metrics={metrics}
            selectDisabled={selectDisabled}
            selectedRowKeys={selectedRowKeys}
            selection={true}
            trialHps={trialHps}
            trialIds={trialIds}
            onMouseEnter={handleTableMouseEnter}
            onMouseLeave={handleTableMouseLeave}
          />
        </div>
      </Section>
      {modalTrialTagContextHolder}
    </Page>
  );
};

export default Compare;
