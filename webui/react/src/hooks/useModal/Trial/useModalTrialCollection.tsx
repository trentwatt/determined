import { Input, InputRef } from 'antd';
import { ModalFuncProps } from 'antd/es/modal/Modal';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import {
  encodeFilters,
  getDescriptionText,
  isTrialsSelection,
  TrialsSelectionOrCollection,
} from 'pages/TrialsComparison/utils/filters';
import { createTrialCollection, patchBulkTrials, patchTrials } from 'services/api';
import useModal, { ModalHooks as Hooks } from 'shared/hooks/useModal/useModal';

import css from './useModalTrialCollection.module.scss';

interface Props {
  onClose?: () => void;
  projectId: string;

}

export interface ShowModalProps {
  initialModalProps?: ModalFuncProps;
  trials?: TrialsSelectionOrCollection
}

interface ModalHooks extends Omit<Hooks, 'modalOpen'> {
  modalOpen: (props: ShowModalProps) => void;
}

const useModalTrialCollection = ({
  onClose,
  projectId,

}: Props): ModalHooks => {
  const inputRef = useRef<InputRef>(null);
  const [ name, setName ] = useState('');
  const handleClose = useCallback(() => onClose?.(), [ onClose ]);
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
  }, []);
  const { modalOpen: openOrUpdate, modalRef, ...modalHook } = useModal({ onClose: handleClose });

  const modalContent = useMemo(() => {
    return (
      <div className={css.base}>
        <Input
          allowClear
          bordered={true}
          placeholder="collection name"
          ref={inputRef}
          value={name}
          onChange={handleChange}
        />
      </div>
    );
  }, [ name, handleChange ]);

  // clean this up
  const handleOk = useCallback(
    async (name: string, target: TrialsSelectionOrCollection) => {
      try {
        await createTrialCollection({
          filters: encodeFilters({ tags: [ 'name' ] }),
          name,
          projectId: parseInt(projectId),
        });
        const patch = { tags: [ { key: name, value: '1' } ] };

        if (isTrialsSelection(target))
          await patchTrials({
            patch,
            trialIds: target.trialIds,
          });

        else {
          await patchBulkTrials({
            filters: encodeFilters(target.filters),
            patch,
          });
        }
      } catch (error) {
        // duly noted
      }
    },
    [ projectId ],
  );

  const getModalProps = useCallback(
    (trials): ModalFuncProps => {
      return {
        closable: true,
        content: modalContent,
        icon: null,
        okText: 'Create Collection',
        onOk: handleOk,
        title: `Create Collection for ${getDescriptionText(trials)}`,
      };
    },
    [ handleOk, modalContent ],
  );

  const modalOpen = useCallback(
    ({ initialModalProps, trials }: ShowModalProps) => {
      openOrUpdate({
        ...getModalProps(trials),
        ...initialModalProps,
      });
    },
    [ getModalProps, openOrUpdate ],
  );

  /**
   * When modal props changes are detected, such as modal content
   * title, and buttons, update the modal.
   */

  return { modalOpen, modalRef, ...modalHook };
};

export default useModalTrialCollection;
