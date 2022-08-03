import { TrialsSorterNamespace,
  V1NumberRangeFilter,
  V1OrderBy,
  V1TrialFilters,
  V1TrialsSorter } from 'services/api-ts-sdk';
import { Range } from 'shared/types';

interface TrialFilters {
  experimentIds?: Array<number>;
  hparams?: Record<string, Range<number>>;
  projectIds?: Array<number>;
  rankWithinExp?: number;
  searcher?: string;
  tags?: string[];
  trainingMetrics?: Record<string, Range<number>>;
  userIds?: Array<number>;
  validationMetrics?: Record<string, Range<number>>;
  workspaceIds?: Array<number>;
}

// interface TrialSorter {
//   namespace?: TrialsSorterNamespace;
//   field?: string;
//   orderBy?: V1OrderBy;
// }

const encodeFilters = (f: TrialFilters): V1TrialFilters => ({});
