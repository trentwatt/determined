import { Range } from 'shared/types';

export type NumberRangeDict = Record<string, Range<number>>

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
