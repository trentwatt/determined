import React, { useState } from 'react';

import TagList, { TagAction } from 'components/TagList';
import { patchTrials } from 'services/api';

export const addTagFunc = (trialId: number) =>
  async (tag: string): Promise<unknown> => await patchTrials({
    patch: { tags: [ { key: tag, value: '1' } ] },
    trialIds: [ trialId ],
  });

export const removeTagFunc = (trialId: number) =>
  async (tag: string): Promise<unknown> => await patchTrials({
    patch: { tags: [ { key: tag, value: '1' } ] },
    trialIds: [ trialId ],
  });

interface Props {
  onAdd: (tag: string) => Promise<unknown>
  onRemove: (tag: string) => Promise<unknown>
  tags: string[];
}
const Tags: React.FC<Props> = ({ tags: _tags, onAdd, onRemove }) => {
  const [ tags, setTags ] = useState(_tags);
  const handleTagAction = async (action: TagAction, tag: string) => {
    try {
      if (action === TagAction.Add) {
        await onAdd(tag);
        setTags([ ...tags.filter((t) => t !== tag), tag ]);
      } else if (action === TagAction.Remove) {
        await onRemove(tag);
        setTags((tags) => tags.filter((t) => t !== tag));
      }
    } catch (error) {
      // duly noted
    }
  };

  return (
    <TagList
      tags={tags}
      onAction={handleTagAction}
    />
  );
};

export default Tags;
