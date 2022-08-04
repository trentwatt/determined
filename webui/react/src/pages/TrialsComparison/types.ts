import { Dispatch, SetStateAction } from 'react';

interface NumberRange {
  max?: string;
  min?: string;
}

export type NumberRangeDict = Record<string, NumberRange>

export interface TrialFilters {
  experimentIds?: Array<string>;
  hparams?: NumberRangeDict;
  projectIds?: Array<string>;
  rankWithinExp?: number;
  searcher?: string;
  tags?: string[];
  trainingMetrics?: NumberRangeDict;
  userIds?: Array<string>;
  validationMetrics?:NumberRangeDict;
  workspaceIds?: Array<string>;
}

export type FilterSetter = Dispatch<SetStateAction<TrialFilters>>
