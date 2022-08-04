import { Dispatch, SetStateAction } from 'react';

interface NumberRange {
  max?: string;
  min?: string;
}

export type NumberRangeDict = Record<string, NumberRange>

export interface TrialFilters {
  experimentIds?: Array<number>;
  hparams?: NumberRangeDict;
  projectIds?: Array<number>;
  rankWithinExp?: number;
  searcher?: string;
  tags?: string[];
  trainingMetrics?: NumberRangeDict;
  userIds?: Array<number>;
  validationMetrics?:NumberRangeDict;
  workspaceIds?: Array<number>;
}

export type FilterSetter = Dispatch<SetStateAction<TrialFilters>>
