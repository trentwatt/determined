import { Button, Select } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import LearningCurveChart from 'components/LearningCurveChart';
import Page from 'components/Page';
import Section from 'components/Section';
import TableBatch from 'components/TableBatch';
import usePolling from 'hooks/usePolling';
import MetricsView, {
  Layout,
  MetricView,
} from 'pages/TrialsComparison/MetricsView';
import TrialTable from 'pages/TrialsComparison/table/TrialTable';
import {
  aggregrateTrialsMetadata,
  defaultTrialData,
  TrialsWithMetadata,
} from 'pages/TrialsComparison/utils/data';
import {
  queryTrials,
} from 'services/api';
import { V1AugmentedTrial } from 'services/api-ts-sdk';
import { clone } from 'shared/utils/data';
import { ErrorLevel, ErrorType } from 'shared/utils/error';
import { noOp } from 'shared/utils/service';
import {
  MetricType,
  Scale,
} from 'types';
import handleError from 'utils/error';
import { metricToKey } from 'utils/metric';

import css from './TrialsComparison.module.scss';
import useHighlight from './TrialsComparison/hooks/useHighlight';
import useLearningCurve from './TrialsComparison/hooks/useLearningCurve';
import useModalTrialCollection from './TrialsComparison/modal/useModalTrialCollection';
import useModalTrialTag from './TrialsComparison/modal/useModalTrialTag';
import {
  dispatchTrialAction,
  openTensorBoard,
  TrialAction,
  trialActionDefs,
  TrialsActionHandler,
} from './TrialsComparison/utils/action';
import { encodeFilters, encodeTrialSorter } from './TrialsComparison/utils/api';
import {
  TrialsCollection,
  useTrialCollections,
} from './TrialsComparison/utils/collections';
const { Option } = Select;

interface Props {
  projectId: string;
}

const TrialsComparison: React.FC<Props> = ({ projectId }) => {

  const [ trials, setTrials ] = useState<TrialsWithMetadata>(defaultTrialData);

  const {
    filters,
    setFilters,
    collectionId,
    fetchCollections,
    setCollectionId,
    sorter,
    setSorter,
    collections,
  } = useTrialCollections(projectId);

  // const [ pageSize, setPageSize ] = useState(MINIMUM_PAGE_SIZE);
  // const pageRef = useRef<HTMLElement>(null);

  const [ view, setView ] = useState<MetricView>();
  const [ selectedTrialIds, setSelectedTrialIds ] = useState<number[]>([]);

  const highlight = useHighlight((trial: V1AugmentedTrial): number => trial.trialId);

  const [ selectAllMatching, setSelectAllMatching ] = useState<boolean>(false);
  const handleChangeSelectionMode = useCallback(() => setSelectAllMatching((prev) => !prev), []);

  const containerRef = useRef<HTMLElement>(null);
  const {
    contextHolder: modalTrialTagContextHolder,
    modalOpen: openTagModal,
  } = useModalTrialTag({});

  const handleCollectionConfirm = useCallback((newCollection?: TrialsCollection) => {
    fetchCollections();
    if (newCollection) setCollectionId(newCollection.id);
  }, [ fetchCollections, setCollectionId ]);

  const {
    contextHolder: modalTrialCollectionContextHolder,
    modalOpen: openCreateCollectionModal,
  } = useModalTrialCollection({ onConfirm: handleCollectionConfirm, projectId });

  const createCollectionFromFilters = useCallback(() => {
    openCreateCollectionModal({ trials: { filters, sorter } });
  }, [ filters, openCreateCollectionModal, sorter ]);

  const handleBatchAction = useCallback(async (action: string) => {
    const trials = selectAllMatching
      ? { filters, sorter }
      : { sorter, trialIds: selectedTrialIds };

    const handle = async (handler: TrialsActionHandler) =>
      await dispatchTrialAction(action as TrialAction, trials, handler);

    await (
      action === TrialAction.AddTags
        ? handle(openTagModal)
        : action === TrialAction.CreateCollection
          ? handle(openCreateCollectionModal)
          : action === TrialAction.OpenTensorBoard
            ? handle(openTensorBoard)
            : Promise.resolve(noOp)
    );
  }, [
    selectedTrialIds,
    openTagModal,
    selectAllMatching,
    sorter,
    filters,
    openCreateCollectionModal,
  ]);

  const handleTableRowSelect = useCallback((rowKeys) => setSelectedTrialIds(rowKeys), []);
  // const handleTableChange = useCallback((pageSize) => setPageSize(pageSize), []);

  const clearSelected = useCallback(() => {
    setSelectedTrialIds([]);
  }, []);

  const handleViewChange = useCallback((view: MetricView) => {
    setView(view);
  }, []);

  const fetchTrials = useCallback(async () => {
    try {
      const response = await queryTrials({
        filters: encodeFilters(filters),
        // limit: pageSize,
        sorter: encodeTrialSorter(sorter),
      });

      setTrials((prev) => {
        const d: TrialsWithMetadata = response.trials
          ?.reduce(
            aggregrateTrialsMetadata,
            clone(defaultTrialData),
          ) ?? prev;
        return d;
      });

    } catch (e) {
      handleError(e, { publicSubject: 'Unable to fetch trials.' });
    }
  }, [ filters, sorter ]);

  usePolling(fetchTrials, { rerunOnNewFn: true });

  useEffect(() => {
    if (!view && trials.metrics.length) {
      const defaultMetric = trials.metrics
        .filter((m) => m.type === MetricType.Validation)[0]
        ?? trials.metrics[0];
      setView({ layout: Layout.Grid, metric: defaultMetric, scale: Scale.Linear });
    }
  }, [ view, trials.metrics ]);

  const chartSeries = useLearningCurve(trials.ids, trials.metrics, trials.maxBatch);

  const chartData = view?.metric
    && metricToKey(view.metric)
    && chartSeries?.metrics?.[metricToKey(view.metric)];

  const metricsViewSelect = (
    view && (
      <MetricsView
        metrics={trials.metrics}
        view={view}
        onChange={handleViewChange}
      />
    )
  );

  const collectionsControls = (
    <>
      <Button onClick={createCollectionFromFilters}>New Collection</Button>
      <Select
        placeholder={collections?.length ? 'Select Collection' : 'No collections created'}
        value={collectionId}
        onChange={(value) => setCollectionId(value)}>
        {[
          <Option key="" value="">
            No Collection Selected
          </Option>,
          ...collections?.map((collection) => (
            <Option key={collection.id} value={collection.id}>
              {collection.name}
            </Option>
          )) ?? [],
        ]}
      </Select>
    </>
  );

  return (
    <Page className={css.base} containerRef={containerRef}>
      <Section
        bodyBorder
        bodyScroll
        filters={[ metricsViewSelect, collectionsControls ]}>
        <div className={css.container}>
          <div className={css.chart}>
            {view?.metric && chartData && (
              <LearningCurveChart
                data={chartData}
                focusedTrialId={highlight.id}
                selectedMetric={view.metric}
                selectedScale={view.scale}
                selectedTrialIds={selectedTrialIds}
                trialIds={trials.ids}
                xValues={chartSeries.batches}
                onTrialFocus={highlight.focus}
              />
            )}
          </div>
          <TableBatch
            actions={Object.values(trialActionDefs)}
            selectAllMatching={selectAllMatching}
            selectedRowCount={selectedTrialIds.length}
            onAction={handleBatchAction}
            onChangeSelectionMode={handleChangeSelectionMode}
            onClear={clearSelected}
          />
          <TrialTable
            containerRef={containerRef}
            filters={filters}
            handleTableRowSelect={handleTableRowSelect}
            // handleTableChange={handleTableChange}
            // pageSize={pageSize}
            highlightedTrialId={highlight.id}
            hpVals={trials.hpVals}
            metrics={trials.metrics}
            selectAllMatching={selectAllMatching}
            selectedTrialIds={selectedTrialIds}
            selection={true}
            setFilters={setFilters}
            trialIds={trials.ids}
            trials={trials.data}
            onMouseEnter={highlight.mouseEnter}
            onMouseLeave={highlight.mouseLeave}
          />
        </div>
      </Section>
      {modalTrialTagContextHolder}
      {modalTrialCollectionContextHolder}
    </Page>

  );
};

export default TrialsComparison;
