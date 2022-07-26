package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/pkg/errors"
	"github.com/uptrace/bun"

	"github.com/determined-ai/determined/master/internal/api"
	"github.com/determined-ai/determined/master/pkg/model"
	"github.com/determined-ai/determined/master/pkg/ptrs"
	"github.com/determined-ai/determined/proto/pkg/apiv1"
	"github.com/determined-ai/determined/proto/pkg/trialv1"
)

// AddTrial adds the trial to the database and sets its ID.
func (db *PgDB) AddTrial(trial *model.Trial) error {
	if trial.ID != 0 {
		return errors.Errorf("error adding a trial with non-zero id %v", trial.ID)
	}

	if err := db.namedGet(&trial.ID, `
INSERT INTO trials
(task_id, request_id, experiment_id, state, start_time, end_time,
hparams, warm_start_checkpoint_id, seed)
VALUES (:task_id, :request_id, :experiment_id, :state, :start_time,
	:end_time, :hparams, :warm_start_checkpoint_id, :seed)
RETURNING id`, trial); err != nil {
		// Assume the foreign key constraint is handled by the database.
		return errors.Wrapf(err, "error inserting trial %v", *trial)
	}

	return nil
}

// TrialByID looks up a trial by ID, returning an error if none exists.
func (db *PgDB) TrialByID(id int) (*model.Trial, error) {
	var trial model.Trial
	err := db.query(`
SELECT id, COALESCE(task_id, '') AS task_id, request_id, experiment_id, state, start_time,
	end_time, hparams, warm_start_checkpoint_id, seed
FROM trials
WHERE id = $1`, &trial, id)
	return &trial, errors.Wrapf(err, "error querying for trial %v", id)
}

// TrialByExperimentAndRequestID looks up a trial, returning an error if none exists.
func (db *PgDB) TrialByExperimentAndRequestID(
	experimentID int, requestID model.RequestID,
) (*model.Trial, error) {
	var trial model.Trial
	err := db.query(`
SELECT id, task_id, request_id, experiment_id, state, start_time,
  end_time, hparams, warm_start_checkpoint_id, seed
FROM trials
WHERE experiment_id = $1 AND request_id = $2`, &trial, experimentID, requestID)
	return &trial, errors.Wrapf(err, "error querying for trial %v", requestID)
}

// UpdateTrial updates an existing trial. Fields that are nil or zero are not
// updated.  end_time is set if the trial moves to a terminal state.
func (db *PgDB) UpdateTrial(id int, newState model.State) error {
	trial, err := db.TrialByID(id)
	if err != nil {
		return errors.Wrapf(err, "error finding trial %v to update", id)
	}

	if trial.State == newState {
		return nil
	}

	if !model.TrialTransitions[trial.State][newState] {
		return errors.Errorf("illegal transition %v -> %v for trial %v",
			trial.State, newState, trial.ID)
	}
	toUpdate := []string{"state"}
	trial.State = newState
	if model.TerminalStates[newState] {
		now := time.Now().UTC()
		trial.EndTime = &now
		toUpdate = append(toUpdate, "end_time")
	}

	return db.withTransaction("update_trial", func(tx *sqlx.Tx) error {
		// Only the trial actor updates this row, and it does so in a serialized
		// fashion already, so this transaction is more a matter of atomicity.
		if err := namedExecOne(tx, fmt.Sprintf(`
UPDATE trials
%v
WHERE id = :id`, setClause(toUpdate)), trial); err != nil {
			return errors.Wrapf(err, "error updating (%v) in trial %v",
				strings.Join(toUpdate, ", "), id)
		}

		if model.TerminalStates[newState] && trial.EndTime != nil {
			return completeTask(tx, trial.TaskID, *trial.EndTime)
		}

		return nil
	})
}

// UpdateTrialRunnerState updates a trial runner's state.
func (db *PgDB) UpdateTrialRunnerState(id int, state string) error {
	return db.UpdateTrialRunnerMetadata(id, &trialv1.TrialRunnerMetadata{State: state})
}

// UpdateTrialRunnerMetadata updates a trial's metadata about its runner.
func (db *PgDB) UpdateTrialRunnerMetadata(id int, md *trialv1.TrialRunnerMetadata) error {
	if _, err := db.sql.Exec(`
UPDATE trials
SET runner_state = $2
WHERE id = $1`, id, md.State); err != nil {
		return errors.Wrap(err, "saving trial runner state")
	}
	return nil
}

// TrialRunIDAndRestarts returns the run id and restart count for a trial.
func (db *PgDB) TrialRunIDAndRestarts(trialID int) (int, int, error) {
	var runID, restart int
	if err := db.sql.QueryRowx(`
SELECT run_id, restarts
FROM trials
WHERE id = $1`, trialID).Scan(&runID, &restart); err != nil {
		return 0, 0, errors.Wrap(err, "failed to scan trial restart count")
	}
	return runID, restart, nil
}

// UpdateTrialRunID sets the trial's run ID.
func (db *PgDB) UpdateTrialRunID(id, runID int) error {
	if _, err := db.sql.Exec(`
UPDATE trials
SET run_id = $2
WHERE id = $1`, id, runID); err != nil {
		return errors.Wrap(err, "updating trial run id")
	}
	return nil
}

// UpdateTrialRestarts sets the trial's restart count.
func (db *PgDB) UpdateTrialRestarts(id, restartCount int) error {
	if _, err := db.sql.Exec(`
UPDATE trials
SET restarts = $2
WHERE id = $1`, id, restartCount); err != nil {
		return errors.Wrap(err, "updating trial restarts")
	}
	return nil
}

// AddTrainingMetrics adds a completed step to the database with the given training metrics.
// If these training metrics occur before any others, a rollback is assumed and later
// training and validation metrics are cleaned up.
func (db *PgDB) AddTrainingMetrics(ctx context.Context, m *trialv1.TrialMetrics) error {
	return db.withTransaction("add training metrics", func(tx *sqlx.Tx) error {
		if err := checkTrialRunID(ctx, tx, m.TrialId, m.TrialRunId); err != nil {
			return err
		}

		if _, err := tx.ExecContext(ctx, `
UPDATE raw_steps SET archived = true
WHERE trial_id = $1
  AND trial_run_id < $2
  AND total_batches >= $3;
`, m.TrialId, m.TrialRunId, m.StepsCompleted); err != nil {
			return errors.Wrap(err, "archiving training metrics")
		}

		if _, err := tx.ExecContext(ctx, `
UPDATE raw_validations SET archived = true
WHERE trial_id = $1
  AND trial_run_id < $2
  AND total_batches > $3;
`, m.TrialId, m.TrialRunId, m.StepsCompleted); err != nil {
			return errors.Wrap(err, "archiving validations")
		}

		if _, err := tx.NamedExecContext(ctx, `
INSERT INTO raw_steps
	(trial_id, trial_run_id, state,
	 end_time, metrics, total_batches)
VALUES
	(:trial_id, :trial_run_id, :state,
	 now(), :metrics, :total_batches)
`, model.TrialMetrics{
			TrialID:    int(m.TrialId),
			TrialRunID: int(m.TrialRunId),
			State:      model.CompletedState,
			Metrics: map[string]interface{}{
				"avg_metrics":   m.Metrics,
				"batch_metrics": m.BatchMetrics,
			},
			TotalBatches: int(m.StepsCompleted),
		}); err != nil {
			return errors.Wrap(err, "inserting training metrics")
		}
		return nil
	})
}

// AddValidationMetrics adds a completed validation to the database with the given
// validation metrics. If these validation metrics occur before any others, a rollback
// is assumed and later metrics are cleaned up from the database.
func (db *PgDB) AddValidationMetrics(
	ctx context.Context, m *trialv1.TrialMetrics,
) error {
	return db.withTransaction("add validation metrics", func(tx *sqlx.Tx) error {
		if err := checkTrialRunID(ctx, tx, m.TrialId, m.TrialRunId); err != nil {
			return err
		}

		if _, err := tx.ExecContext(ctx, `
UPDATE raw_validations SET archived = true
WHERE trial_id = $1
  AND trial_run_id < $2
  AND total_batches >= $2;
`, m.TrialId, m.StepsCompleted); err != nil {
			return errors.Wrap(err, "archiving validations")
		}

		if err := db.ensureStep(
			ctx, tx, int(m.TrialId), int(m.TrialRunId), int(m.StepsCompleted),
		); err != nil {
			return err
		}

		if _, err := tx.NamedExecContext(ctx, `
INSERT INTO raw_validations
	(trial_id, trial_run_id, state, end_time,
	 metrics, total_batches)
VALUES
	(:trial_id, :trial_run_id, :state, now(),
	 :metrics, :total_batches)
`, model.TrialMetrics{
			TrialID:    int(m.TrialId),
			TrialRunID: int(m.TrialRunId),
			State:      model.CompletedState,
			Metrics: map[string]interface{}{
				"validation_metrics": m.Metrics,
			},
			TotalBatches: int(m.StepsCompleted),
		}); err != nil {
			return errors.Wrap(err, "inserting validation metrics")
		}

		if err := setTrialBestValidation(tx, int(m.TrialId)); err != nil {
			return errors.Wrap(err, "updating trial best validation")
		}

		return nil
	})
}

// ensureStep inserts a noop step if no step exists at the batch index of the validation.
// This is used to make sure there is at least a dummy step for each validation or checkpoint,
// in the event one comes without (e.g. perform_initial_validation).
func (db *PgDB) ensureStep(
	ctx context.Context, tx *sqlx.Tx, trialID, trialRunID, stepsCompleted int,
) error {
	if _, err := tx.NamedExecContext(ctx, `
INSERT INTO raw_steps
	(trial_id, trial_run_id, state,
	 end_time, metrics, total_batches)
VALUES
	(:trial_id, :trial_run_id, :state,
	 :end_time, :metrics, :total_batches)
ON CONFLICT (trial_id, trial_run_id, total_batches)
DO NOTHING
`, model.TrialMetrics{
		TrialID:    trialID,
		TrialRunID: trialRunID,
		State:      model.CompletedState,
		EndTime:    ptrs.Ptr(time.Now().UTC()),
		Metrics: map[string]interface{}{
			"avg_metrics":   struct{}{},
			"batch_metrics": []struct{}{},
		},
		TotalBatches: stepsCompleted,
	}); err != nil {
		return errors.Wrap(err, "inserting training metrics")
	}
	return nil
}

// AddCheckpointMetadata persists metadata for a completed checkpoint to the database.
func (db *PgDB) AddCheckpointMetadata(
	ctx context.Context, m *model.CheckpointV2,
) error {
	query := `
INSERT INTO checkpoints_v2
	(uuid, task_id, allocation_id, report_time, state, resources, metadata)
VALUES
	(:uuid, :task_id, :allocation_id, :report_time, :state, :resources, :metadata)`

	if _, err := db.sql.NamedExecContext(ctx, query, m); err != nil {
		return errors.Wrap(err, "inserting checkpoint")
	}

	return nil
}

func checkTrialRunID(ctx context.Context, tx *sqlx.Tx, trialID, runID int32) error {
	var cRunID int
	switch err := tx.QueryRowxContext(ctx, `
SELECT run_id
FROM trials
WHERE id = $1
`, trialID).Scan(&cRunID); {
	case err != nil:
		return errors.Wrap(err, "querying current run")
	case int(runID) != cRunID:
		return api.AsValidationError("invalid run id, %d (reported) != %d (expected)", runID, cRunID)
	default:
		return nil
	}
}

// ValidationByTotalBatches looks up a validation by trial and step ID,
// returning nil if none exists.
func (db *PgDB) ValidationByTotalBatches(trialID, totalBatches int) (*model.TrialMetrics, error) {
	var validation model.TrialMetrics
	if err := db.query(`
SELECT id, trial_id, total_batches, state, end_time, metrics
FROM validations
WHERE trial_id = $1
AND total_batches = $2`, &validation, trialID, totalBatches); errors.Cause(err) == ErrNotFound {
		return nil, nil
	} else if err != nil {
		return nil, errors.Wrapf(err, "error querying for validation (%v, %v)",
			trialID, totalBatches)
	}
	return &validation, nil
}

// CheckpointByTotalBatches looks up a checkpoint by trial and total batch,
// returning nil if none exists.
func (db *PgDB) CheckpointByTotalBatches(trialID, totalBatches int) (*model.Checkpoint, error) {
	var checkpoint model.Checkpoint
	if err := db.query(`
SELECT *
FROM checkpoints_view c
WHERE c.trial_id = $1 AND c.steps_completed = $2`, &checkpoint, trialID, totalBatches,
	); errors.Cause(err) == ErrNotFound {
		return nil, nil
	} else if err != nil {
		return nil, errors.Wrapf(err, "error querying for checkpoint (%v, %v)",
			trialID, totalBatches)
	}
	return &checkpoint, nil
}

// CheckpointByUUID looks up a checkpoint by UUID, returning nil if none exists.
func (db *PgDB) CheckpointByUUID(id uuid.UUID) (*model.Checkpoint, error) {
	var checkpoint model.Checkpoint
	if err := db.query(`
SELECT *
FROM checkpoints_view c
WHERE c.uuid = $1`, &checkpoint, id.String()); errors.Cause(err) == ErrNotFound {
		return nil, nil
	} else if err != nil {
		return nil, errors.Wrapf(err, "error querying for checkpoint (%v)", id.String())
	}
	return &checkpoint, nil
}

// LatestCheckpointForTrial finds the latest completed checkpoint for a trial, returning nil if
// none exists.
func (db *PgDB) LatestCheckpointForTrial(trialID int) (*model.Checkpoint, error) {
	var checkpoint model.Checkpoint
	if err := db.query(`
SELECT *
FROM checkpoints_view c
WHERE c.trial_id = $1 AND c.state = 'COMPLETED'
ORDER BY c.steps_completed DESC
LIMIT 1`, &checkpoint, trialID); errors.Cause(err) == ErrNotFound {
		return nil, nil
	} else if err != nil {
		return nil, errors.Wrapf(err, "error querying for latest trial checkpoint (%v)", trialID)
	}
	return &checkpoint, nil
}

// TrialState returns the current state of the given trial.
func (db *PgDB) TrialState(trialID int) (model.State, error) {
	var state model.State
	err := db.sql.QueryRow(`
SELECT state
FROM trials
WHERE id = $1
`, trialID).Scan(&state)
	return state, err
}

// TrialStatus returns the current status of the given trial, including the end time
// without returning all its hparams and other unneeded details. Called in paths hotter
// than TrialByID allows.
func (db *PgDB) TrialStatus(trialID int) (model.State, *time.Time, error) {
	status := struct {
		State   model.State `db:"state"`
		EndTime *time.Time  `db:"end_time"`
	}{}
	err := db.query(`
SELECT state, end_time
FROM trials
WHERE id = $1
`, &status, trialID)
	return status.State, status.EndTime, err
}

// setTrialBestValidation sets `public.trials.best_validation_id` to the `id` of the row in
// `public.validations` corresponding to the trial's best validation.
func setTrialBestValidation(tx *sqlx.Tx, id int) error {
	_, err := tx.Exec(`
WITH const AS (
    SELECT t.id as trial_id,
           config->'searcher'->>'metric' AS metric_name,
           (SELECT
               CASE WHEN coalesce((config->'searcher'->>'smaller_is_better')::boolean, true)
			   THEN 1
			   ELSE -1 END) AS sign
    FROM experiments e
    INNER JOIN trials t ON t.experiment_id = e.id
  	WHERE t.id = $1
), best_validation AS (
	SELECT
		v.id AS id,
		const.sign * (v.metrics->'validation_metrics'->>const.metric_name)::float8 AS metric
	FROM validations v, const
	WHERE v.trial_id = $1
	ORDER BY metric ASC
	LIMIT 1
)
UPDATE trials t
SET best_validation_id = (SELECT bv.id FROM best_validation bv)
WHERE t.id = $1;
`, id)
	return errors.Wrapf(err, "error updating best validation for trial %d", id)
}

/**
// Scan converts jsonb from postgres into a Resources object.

package model

import (
	"encoding/json"
	"time"

	"github.com/pkg/errors"
	"github.com/uptrace/bun"

	"github.com/determined-ai/determined/master/pkg/protoutils"
	"github.com/determined-ai/determined/proto/pkg/checkpointv1"
)

// Resources maps filenames to file sizes.
// type Resources map[string]int64

// Scan converts jsonb from postgres into a Resources object.
// TODO: Combine all json.unmarshal-based Scanners into a single Scan implementation.
// TODO: Combine all json.unmarshal-based Scanners into a single Scan implementation.
func (r *Resources) Scan(src interface{}) error {
	if src == nil {
		*r = nil
		return nil
	}
	bytes, ok := src.([]byte)
	if !ok {
		return errors.Errorf("unable to convert to []byte: %v", src)
	}
	obj := make(map[string]int64)
	if err := json.Unmarshal(bytes, &obj); err != nil {
		return errors.Wrapf(err, "unable to unmarshal Resources: %v", src)
	}
	*r = Resources(obj)
	return nil
}

// Checkpoint represents a row from the `checkpoints` table.
type Checkpoint struct {
	bun.BaseModel

	ID                int        `db:"id" json:"id"`
	TrialID           int        `db:"trial_id" json:"trial_id"`
	TrialRunID        int        `db:"trial_run_id" json:"-"`
	TotalBatches      int        `db:"total_batches" json:"total_batches"`
	State             State      `db:"state" json:"state"`
	EndTime           *time.Time `db:"end_time" json:"end_time"`
	UUID              *string    `db:"uuid" json:"uuid"`
	Resources         Resources  `db:"resources" json:"resources"`
	Metadata          JSONObj    `db:"metadata" json:"metadata"`
	Framework         string     `db:"framework" json:"framework"`
	Format            string     `db:"format" json:"format"`
	DeterminedVersion string     `db:"determined_version" json:"determined_version"`
}

// ValidationMetrics is based on the checkpointv1.Metrics protobuf message.
type ValidationMetrics struct {
	NumInputs         int     `json:"num_inputs"`
	ValidationMetrics JSONObj `json:"validation_metrics"`
}

func (m *ValidationMetrics) ToProto(pc *protoutils.ProtoConverter) *checkpointv1.Metrics {
	return &checkpointv1.Metrics{
		NumInputs:         pc.ToInt32(m.NumInputs),
		ValidationMetrics: pc.ToStruct(m.ValidationMetrics, "validation_metrics"),
	}
}

// CheckpointExpanded represents a row from the `checkpoints_expanded` view.  It is called
// "expanded" because it includes various data from non-checkpoint tables that our system
// auto-associates with checkpoints.  Likely this object is only useful to REST API endpoint code;
// most of the rest of the system will prefer the more specific Checkpoint object.
type CheckpointExpanded struct {
	bun.BaseModel

	// CheckpointExpanded is not json-serialized, so no `json:""` struct tags.
	// CheckpointExpanded is only used by bun code, so no `db:""` struct tags.

	ID                int
	TrialID           int
	TrialRunID        int
	TotalBatches      int
	State             State
	EndTime           time.Time
	UUID              string
	Resources         Resources
	Metadata          JSONObj
	Framework         string
	Format            string
	DeterminedVersion string

	ExperimentConfig  JSONObj
	ExperimentID      int
	Hparams           JSONObj
	ValidationMetrics ValidationMetrics
	ValidationState   State
	SearcherMetric    *float64
}

func (c CheckpointExpanded) ToProto(pc *protoutils.ProtoConverter) checkpointv1.Checkpoint {
	if pc.Error() != nil {
		return checkpointv1.Checkpoint{}
	}

	out := checkpointv1.Checkpoint{
		Uuid:              c.UUID,
		ExperimentConfig:  pc.ToStruct(c.ExperimentConfig, "experiment config"),
		ExperimentId:      pc.ToInt32(c.ExperimentID),
		TrialId:           pc.ToInt32(c.TrialID),
		Hparams:           pc.ToStruct(c.Hparams, "hparams"),
		BatchNumber:       pc.ToInt32(c.TotalBatches),
		EndTime:           pc.ToTimestamp(c.EndTime),
		Resources:         c.Resources,
		Metadata:          pc.ToStruct(c.Metadata, "metadata"),
		Framework:         c.Framework,
		Format:            c.Format,
		DeterminedVersion: c.DeterminedVersion,
		Metrics:           c.ValidationMetrics.ToProto(pc),
		ValidationState:   pc.ToCheckpointv1State(string(c.ValidationState)),
		State:             pc.ToCheckpointv1State(string(c.State)),
		SearcherMetric:    pc.ToDoubleValue(c.SearcherMetric),
	}

	return out
}

*/

// Proto converts an Augmented Trial to its protobuf representation.
func (t *TrialsAugmented) Proto() *apiv1.AugmentedTrial {
	return &apiv1.AugmentedTrial{
		TrialId:               t.TrialID,
		State:                 t.State,
		Hparams:               t.Proto().Hparams,
		TrainingMetrics:       t.Proto().TrainingMetrics,
		ValidationMetrics:     t.Proto().ValidationMetrics,
		Tags:                  t.Proto().Tags,
		StartTime:             t.Proto().StartTime,
		EndTime:               t.Proto().EndTime,
		SearcherType:          t.EndTime,
		RankWithinExp:         t.Proto().RankWithinExp,
		ExperimentId:          t.Proto().ExperimentId,
		ExperimentName:        t.ExperimentName,
		ExperimentDescription: t.ExperimentDescription,
		ExperimentLabels:      t.Proto().ExperimentLabels,
		UserId:                t.Proto().UserId,
		ProjectId:             t.Proto().ProjectId,
		WorkspaceId:           t.Proto().WorkspaceId,
	}
}

type TrialsAugmented struct {
	bun.BaseModel `bun:"table:trials_augmented_view"`

	TrialID               int32  `bun:"trial_id"`
	State                 string `bun:"state"`
	Hparams               string `bun:"hparams"`
	TrainingMetrics       string `bun:"training_metrics"`
	ValidationMetrics     string `bun:"validation_metrics"`
	Tags                  string `bun:"tags"`
	StartTime             string `bun:"start_time"`
	EndTime               string `bun:"end_time"`
	SearcherType          string `bun:"searcher_type"`
	ExperimentId          string `bun:"experiment_id"`
	ExperimentName        string `bun:"experiment_name"`
	ExperimentDescription string `bun:"experiment_description"`
	ExperimentLabels      string `bun:"experiment_labels"`
	UserID                string `bun:"user_id"`
	ProjectID             string `bun:"project_id"`
	WorkspaceID           string `bun:"workspace_id"`
}

func (db *PgDB) RankSelectQuery(q *bun.SelectQuery, r *apiv1.QueryFilters_ExpRank) (*bun.SelectQuery, error) {
	orderHow := map[apiv1.OrderBy]string{
		apiv1.OrderBy_ORDER_BY_UNSPECIFIED: "ASC",
		apiv1.OrderBy_ORDER_BY_ASC:         "ASC",
		apiv1.OrderBy_ORDER_BY_DESC:        "DESC NULLS LAST",
	}
	q = q.ColumnExpr(`ROW_NUMBER() OVER(
		PARTITION BY t.experiment_id
		ORDER BY ?  ?
	) as exp_rank`, r.SortBy.Field, orderHow[r.SortBy.OrderBy])
	q = q.Where(`exp_rank <= ?`, r.Rank)
	return q, nil
}

func (db *PgDB) RankUpdateQuery(q *bun.UpdateQuery, r *apiv1.QueryFilters_ExpRank) (*bun.UpdateQuery, error) {
	orderHow := map[apiv1.OrderBy]string{
		apiv1.OrderBy_ORDER_BY_UNSPECIFIED: "ASC",
		apiv1.OrderBy_ORDER_BY_ASC:         "ASC",
		apiv1.OrderBy_ORDER_BY_DESC:        "DESC NULLS LAST",
	}
	q = q.Where(`ROW_NUMBER() OVER(
		PARTITION BY t.experiment_id
		ORDER BY ?  ?
	) <= ?`, r.SortBy.Field, orderHow[r.SortBy.OrderBy], r.Rank)
	return q, nil
}

func (db *PgDB) FilterTrials(q bun.QueryBuilder, filters *apiv1.QueryFilters) bun.QueryBuilder {
	if len(filters.Tags) > 0 {
		tagExprKeyVals := ""
		for _, tag := range filters.Tags {
			tagExprKeyVals += fmt.Sprintf(`"%s":"%s"`, tag.Key, tag.Value)
		}
		q = q.Where(fmt.Sprintf("tags @> '{%s}'::jsonb", tagExprKeyVals))
	}

	if len(filters.ExperimentIds) > 0 {
		q = q.Where("experiment_id IN (?)", bun.In(filters.ExperimentIds))
	}
	if len(filters.ProjectIds) > 0 {
		q = q.Where("project_id IN (?)", bun.In(filters.ProjectIds))
	}
	if len(filters.WorkspaceIds) > 0 {
		q.Where("workspace_id IN (?)", bun.In(filters.WorkspaceIds))
	}

	if len(filters.ValidationMetrics) > 0 {
		for _, f := range filters.ValidationMetrics {
			q = q.Where("(validation_metrics->>?)::float8 BETWEEN ? AND ?", f.Name, f.Min, f.Max)
		}
	}

	if len(filters.TrainingMetrics) > 0 {
		for _, f := range filters.TrainingMetrics {
			q = q.Where("(training_metrics->>?)::float8 BETWEEN ? AND ?", f.Name, f.Min, f.Max)
		}
	}
	if len(filters.Hparams) > 0 {
		// what if it's a string?
		// given the protos, we would probably need a different type
		// what about nested?
		// in that case, we probably want to send outer.inner in the api
		// then construct trials.hparams->'outer'->'inner' expression in query
		for _, f := range filters.Hparams {
			q = q.Where("(hparams->>?)::float8 BETWEEN ? AND ?", f.Name, f.Min, f.Max)
		}
	}
	if filters.Searcher != "" {
		q = q.Where("searcher_type = ?", filters.Searcher)
	}
	if len(filters.UserIds) > 0 {
		q = q.Where("user_id IN (?)", bun.In(filters.UserIds))
	}

	return q
}
