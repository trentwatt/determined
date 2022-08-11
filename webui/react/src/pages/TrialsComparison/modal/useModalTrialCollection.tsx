import { Input, InputRef } from 'antd';
import { ModalFuncProps } from 'antd/es/modal/Modal';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getDescriptionText,
  isTrialsSelection,
  TrialsCollection,
  TrialsSelectionOrCollection,
} from 'pages/TrialsComparison/utils/collections';
import { createTrialsCollection, patchTrials } from 'services/api';
import useModal, { ModalHooks as Hooks } from 'shared/hooks/useModal/useModal';

import { encodeFilters, encodeTrialSorter } from '../utils/api';

import css from './useModalTrialCollection.module.scss';

interface Props {
  onClose?: () => void;
  onConfirm?: (newCollection?: TrialsCollection) => void;
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
  onConfirm,
}: Props): ModalHooks => {
  const inputRef = useRef<InputRef>(null);
  const handleClose = useCallback(() => onClose?.(), [ onClose ]);
  const [ name, setName ] = useState('');
  const [ trials, setTrials ] = useState<TrialsSelectionOrCollection>();
  const handleChange = useCallback((e) => setName(e.target.value), []);

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

  const handleOk = useCallback(
    async (name: string, target: TrialsSelectionOrCollection) => {
      let newCollection: TrialsCollection | undefined;
      try {
        if (isTrialsSelection(target)) {
          await patchTrials({
            patch: { tags: [ { key: name, value: '1' } ] },
            trialIds: target.trialIds,
          });
          newCollection = await createTrialsCollection({
            filters: encodeFilters({ tags: [ name ] }),
            name,
            projectId: parseInt(projectId),
            sorter: encodeTrialSorter(target.sorter),
          });

        } else {
          newCollection = await createTrialsCollection({
            filters: encodeFilters(target.filters),
            name,
            projectId: parseInt(projectId),
            sorter: encodeTrialSorter(target.sorter),
          });
        }

      } catch (error) {
        // duly noted
      }
      setName('');
      onConfirm?.(newCollection);

    },
    [ projectId, onConfirm ],
  );

  const getModalProps = useCallback(
    (name, trials): ModalFuncProps => {
      const props = {
        closable: true,
        content: modalContent,
        icon: null,
        okButtonProps: { disabled: !name },
        okText: 'Create Collection',
        onOk: () => handleOk(name, trials),
        title: trials && `Create Collection for ${getDescriptionText(trials)}`,
      };
      return props;
    },
    [ handleOk, modalContent ],
  );

  const modalOpen = useCallback(
    ({ initialModalProps, trials }: ShowModalProps) => {
      setTrials(trials);
      const newProps = {
        ...initialModalProps,
        ...getModalProps(name, trials),
      };
      openOrUpdate(newProps);
    },
    [ getModalProps, openOrUpdate, name ],
  );

  /**
   * When modal props changes are detected, such as modal content
   * title, and buttons, update the modal.
   */
  useEffect(() => {
    if (modalRef.current) openOrUpdate(getModalProps(name, trials));
  }, [ getModalProps, modalRef, name, trials, openOrUpdate ]);

  return { modalOpen, modalRef, ...modalHook };
};

export default useModalTrialCollection;
