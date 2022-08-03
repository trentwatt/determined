import { Tag } from 'antd';

import { TrialsSorterNamespace,
  V1NumberRangeFilter,
  V1OrderBy,
  V1TrialFilters,
  V1TrialsSorter } from 'services/api-ts-sdk';
import { Range } from 'shared/types';

// export interface V1TrialFilters {
//   experimentIds?: Array<number>;
//   projectIds?: Array<number>;
//   workspaceIds?: Array<number>;
//   validationMetrics?: Array<V1NumberRangeFilter>;
//   trainingMetrics?: Array<V1NumberRangeFilter>;
//   hparams?: Array<V1NumberRangeFilter>;
//   searcher?: string;
//   userIds?: Array<number>;
//   tags?: Array<V1TrialTag>;
//   rankWithinExp?: TrialFiltersRankWithinExp;
// }

// { "key" : Tag, "value" : "1" }

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

const encodeFilters = (f: TrialFilters, s: V1TrialsSorter): V1TrialFilters => {

  // have to put rank from f and sort together to get ExpRankSorterTHING
};
