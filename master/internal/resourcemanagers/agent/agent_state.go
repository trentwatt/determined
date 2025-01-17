package agent

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"github.com/pkg/errors"
	log "github.com/sirupsen/logrus"
	"github.com/uptrace/bun"
	"golang.org/x/exp/maps"

	"github.com/determined-ai/determined/master/internal/config"
	"github.com/determined-ai/determined/master/internal/db"
	"github.com/determined-ai/determined/master/internal/sproto"
	"github.com/determined-ai/determined/master/internal/task"
	"github.com/determined-ai/determined/master/pkg/actor"
	"github.com/determined-ai/determined/master/pkg/aproto"
	"github.com/determined-ai/determined/master/pkg/cproto"
	"github.com/determined-ai/determined/master/pkg/device"
	"github.com/determined-ai/determined/master/pkg/model"
)

type slotEnabled struct {
	deviceAdded  bool
	agentEnabled bool
	userEnabled  bool
	draining     bool
}

func (s slotEnabled) enabled() bool {
	return s.agentEnabled && s.userEnabled
}

type slot struct {
	device      device.Device
	enabled     slotEnabled
	containerID *cproto.ID
}

// AgentState holds the scheduler state for an agent. The implementation of agent-related operations
// (e.g., socket I/O) is deferred to the actor.
type AgentState struct {
	// Handler is agent actor reference.
	Handler          *actor.Ref
	Devices          map[device.Device]*cproto.ID
	Label            string
	resourcePoolName string
	enabled          bool
	draining         bool
	uuid             uuid.UUID

	maxZeroSlotContainers int

	slotStates          map[device.ID]*slot
	containerAllocation map[cproto.ID]*actor.Ref
	containerState      map[cproto.ID]*cproto.Container
}

// NewAgentState returns a new agent empty agent state backed by the handler.
func NewAgentState(msg sproto.AddAgent, maxZeroSlotContainers int) *AgentState {
	return &AgentState{
		Handler:               msg.Agent,
		Label:                 msg.Label,
		Devices:               make(map[device.Device]*cproto.ID),
		maxZeroSlotContainers: maxZeroSlotContainers,
		enabled:               true,
		slotStates:            make(map[device.ID]*slot),
		containerAllocation:   make(map[cproto.ID]*actor.Ref),
		containerState:        make(map[cproto.ID]*cproto.Container),
		uuid:                  uuid.New(),
	}
}

func (a *AgentState) string() string {
	return a.Handler.Address().Local()
}

func (a *AgentState) agentID() AgentID {
	return AgentID(a.string())
}

// NumSlots returns the total number of slots available.
func (a *AgentState) NumSlots() int {
	switch {
	case a.draining:
		return a.NumUsedSlots()
	case !a.enabled:
		return 0
	default:
		return len(a.Devices)
	}
}

// NumEmptySlots returns the number of slots that have not been allocated to containers.
func (a *AgentState) NumEmptySlots() (slots int) {
	switch {
	case a.draining, !a.enabled:
		return 0
	default:
		return a.NumSlots() - a.NumUsedSlots()
	}
}

// NumUsedSlots returns the number of slots that have been allocated to containers.
func (a *AgentState) NumUsedSlots() (slots int) {
	for _, id := range a.Devices {
		if id != nil {
			slots++
		}
	}
	return slots
}

// NumUsedZeroSlots returns the number of allocated zero-slot units.
func (a *AgentState) NumUsedZeroSlots() int {
	result := 0
	for _, container := range a.containerState {
		if len(container.Devices) == 0 {
			result++
		}
	}

	return result
}

// NumZeroSlots returns the total number of zero-slot units.
func (a *AgentState) NumZeroSlots() int {
	switch {
	case a.draining:
		return a.NumUsedZeroSlots()
	case !a.enabled:
		return 0
	default:
		return a.maxZeroSlotContainers
	}
}

// NumEmptyZeroSlots returns the number of unallocated zero-slot units.
func (a *AgentState) NumEmptyZeroSlots() int {
	switch {
	case a.draining || !a.enabled:
		return 0
	default:
		return a.NumZeroSlots() - a.NumUsedZeroSlots()
	}
}

// Idle signals if the agent is idle.
func (a *AgentState) Idle() bool {
	return a.NumUsedZeroSlots() == 0 && a.NumUsedSlots() == 0
}

// AllocateFreeDevices allocates container.
func (a *AgentState) AllocateFreeDevices(slots int, cid cproto.ID) ([]device.Device, error) {
	// TODO(ilia): Rename to AllocateContainer.
	a.containerState[cid] = &cproto.Container{ID: cid}
	if slots == 0 {
		return nil, nil
	}

	devices := make([]device.Device, 0, slots)
	for d, dcid := range a.Devices {
		if dcid == nil {
			devices = append(devices, d)
		}
		if len(devices) == slots {
			break
		}
	}

	if len(devices) != slots {
		return nil, errors.New("not enough devices")
	}

	for _, d := range devices {
		a.Devices[d] = &cid
	}

	a.containerState[cid].Devices = devices

	return devices, nil
}

// DeallocateContainer deallocates containers.
func (a *AgentState) DeallocateContainer(id cproto.ID) {
	delete(a.containerState, id)
	for d, cid := range a.Devices {
		if cid != nil && *cid == id {
			a.Devices[d] = nil
		}
	}
}

// DeepCopy returns a copy of agentState for scheduler internals.
func (a *AgentState) DeepCopy() *AgentState {
	copiedAgent := &AgentState{
		Handler:               a.Handler,
		Label:                 a.Label,
		Devices:               maps.Clone(a.Devices),
		maxZeroSlotContainers: a.maxZeroSlotContainers,
		enabled:               a.enabled,
		draining:              a.draining,
		containerState:        maps.Clone(a.containerState),
		// TODO(ilia): Deepcopy of `slotStates` may be necessary one day.
		slotStates: a.slotStates,
	}

	return copiedAgent
}

// Enable enables the agent.
func (a *AgentState) Enable(ctx *actor.Context) {
	ctx.Log().Infof("enabling agent: %s", a.string())
	a.enabled = true
	a.draining = false
}

// Disable disables or drains the agent.
func (a *AgentState) Disable(ctx *actor.Context, drain bool) {
	drainStr := "disabling"
	if drain {
		drainStr = "draining"
	}
	ctx.Log().Infof("%s agent: %s", drainStr, a.string())
	a.draining = drain
	a.enabled = false
}

func (a *AgentState) addDevice(ctx *actor.Context, device device.Device, containerID *cproto.ID) {
	ctx.Log().Infof("adding device: %s on %s", device.String(), a.string())
	a.Devices[device] = containerID
}

func (a *AgentState) removeDevice(ctx *actor.Context, device device.Device) {
	ctx.Log().Infof("removing device: %s (%s)", device.String(), a.string())
	delete(a.Devices, device)
}

// agentStarted initializes slots from AgentStarted.Devices.
func (a *AgentState) agentStarted(ctx *actor.Context, agentStarted *aproto.AgentStarted) {
	msg := agentStarted
	for _, d := range msg.Devices {
		enabled := slotEnabled{
			agentEnabled: true,
			userEnabled:  true,
		}
		a.slotStates[d.ID] = &slot{enabled: enabled, device: d}
		a.updateSlotDeviceView(ctx, d.ID)
	}

	if err := a.persist(); err != nil {
		ctx.Log().Warnf("agentStarted persist failure")
	}
}

func (a *AgentState) containerStateChanged(ctx *actor.Context, msg aproto.ContainerStateChanged) {
	for _, d := range msg.Container.Devices {
		s, ok := a.slotStates[d.ID]
		if !ok {
			ctx.Log().Warnf("bad containerStateChanged on device: %d (%s)", d.ID, a.string())
			continue
		}

		s.containerID = &msg.Container.ID

		if msg.Container.State == cproto.Terminated {
			s.containerID = nil
		}
	}

	a.containerState[msg.Container.ID] = &msg.Container
	if msg.Container.State == cproto.Terminated {
		delete(a.containerState, msg.Container.ID)
	}

	if err := a.persist(); err != nil {
		ctx.Log().WithError(err).Warnf("containerStateChanged persist failure")
	}

	if err := updateContainerState(&msg.Container); err != nil {
		ctx.Log().WithError(err).Warnf("containerStateChanged failed to update container state")
	}
}

func (a *AgentState) startContainer(ctx *actor.Context, msg sproto.StartTaskContainer) error {
	inner := func(deviceId device.ID) error {
		s, ok := a.slotStates[deviceId]
		if !ok {
			return errors.New("can't find slot")
		}

		// TODO(ilia): Potential race condition if slot is disabled in-between scheduling?
		if !s.enabled.enabled() {
			return errors.New("container allocated but slot is not enabled")
		}
		if s.containerID != nil {
			return errors.New("container already allocated to slot")
		}

		s.containerID = &msg.StartContainer.Container.ID
		a.containerState[msg.StartContainer.Container.ID] = &msg.StartContainer.Container

		return nil
	}

	for _, d := range msg.StartContainer.Container.Devices {
		if err := inner(d.ID); err != nil {
			return errors.Wrapf(err, "bad startContainer on device: %d (%s)", d.ID, a.string())
		}
	}

	a.containerAllocation[msg.Container.ID] = msg.TaskActor

	if err := a.persist(); err != nil {
		ctx.Log().WithError(err).Warnf("startContainer persist failure")
	}

	if err := updateContainerState(&msg.StartContainer.Container); err != nil {
		ctx.Log().WithError(err).Warnf("startContainer failed to update container state")
	}

	return nil
}

func (a *AgentState) getSlotsSummary(ctx *actor.Context) model.SlotsSummary {
	summary := make(model.SlotsSummary, len(a.slotStates))
	for deviceID := range a.slotStates {
		summary[fmt.Sprintf("%s/slots/%d", ctx.Self().Address(), deviceID)] = a.getSlotSummary(deviceID)
	}

	return summary
}

func (a *AgentState) getSlotSummary(deviceID device.ID) model.SlotSummary {
	s := a.slotStates[deviceID]
	cid := s.containerID
	var container *cproto.Container
	if cid != nil {
		container = a.containerState[*cid]
	}

	return model.SlotSummary{
		ID:        strconv.Itoa(int(s.device.ID)),
		Device:    s.device,
		Enabled:   s.enabled.enabled(),
		Container: container,
		Draining:  s.enabled.draining,
	}
}

func (a *AgentState) updateSlotDeviceView(ctx *actor.Context, deviceID device.ID) {
	s, ok := a.slotStates[deviceID]
	if !ok {
		ctx.Log().Warnf("bad updateSlotDeviceView on device: %d (%s): not found", deviceID, a.string())
		return
	}

	// TODO(ilia): Don't materialize `Devices` view on slots.
	if s.enabled.enabled() && !s.enabled.deviceAdded {
		s.enabled.deviceAdded = true

		a.addDevice(ctx, s.device, s.containerID)
	} else if !s.enabled.enabled() {
		if !s.enabled.draining && s.enabled.deviceAdded {
			s.enabled.deviceAdded = false
			a.removeDevice(ctx, s.device)
		}

		// On `PostStop`, draining will be already set to false, and we'll kill the container
		// whether we have the device or not.
		if !s.enabled.draining && s.containerID != nil {
			ctx.Tell(a.containerAllocation[*s.containerID], task.AllocationSignalWithReason{
				AllocationSignal:    task.Kill,
				InformationalReason: "slot disabled",
			})
		}
	}
}

func (a *AgentState) patchSlotStateInner(
	ctx *actor.Context, msg PatchSlotState, slotState *slot) model.SlotSummary {
	if msg.Enabled != nil {
		slotState.enabled.userEnabled = *msg.Enabled
	}
	if msg.Drain != nil {
		slotState.enabled.draining = *msg.Drain
	}
	a.updateSlotDeviceView(ctx, slotState.device.ID)

	return a.getSlotSummary(slotState.device.ID)
}

func (a *AgentState) patchAllSlotsState(
	ctx *actor.Context, msg PatchAllSlotsState) model.SlotsSummary {
	result := model.SlotsSummary{}
	for _, slotState := range a.slotStates {
		summary := a.patchSlotStateInner(
			ctx, PatchSlotState{
				ID:      slotState.device.ID, // Note: this is effectively unused.
				Enabled: msg.Enabled,
				Drain:   msg.Drain,
			},
			slotState)
		result[summary.ID] = summary
	}
	return result
}

func (a *AgentState) patchSlotState(
	ctx *actor.Context, msg PatchSlotState) (model.SlotSummary, error) {
	s, ok := a.slotStates[msg.ID]
	if !ok {
		return model.SlotSummary{}, errors.New(
			fmt.Sprintf("bad updateSlotDeviceView on device: %d (%s): not found", msg.ID, a.string()))
	}
	return a.patchSlotStateInner(ctx, msg, s), nil
}

func (a *AgentState) snapshot() *AgentSnapshot {
	slotData := make([]SlotData, 0, len(a.slotStates))
	for _, slotState := range a.slotStates {
		slotData = append(slotData, SlotData{
			Device:      slotState.device,
			UserEnabled: slotState.enabled.userEnabled,
			ContainerID: slotState.containerID,
		})
	}

	containerIds := maps.Keys(a.containerState)

	s := AgentSnapshot{
		AgentID:          a.agentID(),
		UUID:             a.uuid.String(),
		ResourcePoolName: a.resourcePoolName,
		Label:            a.Label,
		// TODO(ilia): we need to disambiguate user setting (which needs to be saved)
		// vs current state.
		UserEnabled:           a.enabled,
		UserDraining:          a.draining,
		MaxZeroSlotContainers: a.maxZeroSlotContainers,
		Slots:                 slotData,
		Containers:            containerIds,
	}

	return &s
}

func (a *AgentState) persist() error {
	snapshot := a.snapshot()
	_, err := db.Bun().NewInsert().Model(snapshot).
		On("CONFLICT (uuid) DO UPDATE").
		On("CONFLICT (agent_id) DO UPDATE").
		Exec(context.TODO())
	return err
}

func (a *AgentState) restore() error {
	snapshot := AgentSnapshot{}
	err := db.Bun().NewSelect().Model(&snapshot).
		Where("agent_id = ?", a.Handler.Address().Local()).
		Scan(context.TODO())
	if err != nil {
		return err
	}
	log.Debugf("restored agent state snapshot: %v", snapshot)

	return nil
}

func (a *AgentState) delete() error {
	_, err := db.Bun().NewDelete().Model((*AgentSnapshot)(nil)).
		Where("agent_id = ?", a.Handler.Address().Local()).
		Exec(context.TODO())
	return err
}

func (a *AgentState) clearUnlessRecovered(
	recovered map[cproto.ID]aproto.ContainerReattachAck) error {
	updated := false
	for d := range a.Devices {
		if cID := a.Devices[d]; cID != nil {
			_, ok := recovered[*cID]
			if !ok {
				a.Devices[d] = nil
				a.slotStates[d.ID].containerID = nil
				updated = true
			}
		}
	}

	for _, slot := range a.slotStates {
		if slot.containerID != nil {
			_, ok := recovered[*slot.containerID]
			if !ok {
				slot.containerID = nil
				updated = true
			}
		}
	}

	for cid := range a.containerState {
		_, ok := recovered[cid]
		if !ok {
			delete(a.containerState, cid)
			updated = true
		}
	}

	for cid := range a.containerAllocation {
		_, ok := recovered[cid]
		if !ok {
			delete(a.containerAllocation, cid)
			updated = true
		}
	}

	if updated {
		return a.persist()
	}

	return nil
}

func listResourcePoolsWithReattachEnabled() []string {
	rpConfigList := config.GetMasterConfig().ResourcePools
	result := make([]string, 0, len(rpConfigList))
	for _, rpConfig := range rpConfigList {
		if rpConfig.AgentReattachEnabled {
			result = append(result, rpConfig.PoolName)
		}
	}

	return result
}

// retrieveAgentStates reconstructs AgentStates from the database for all resource pools that
// have agent_container_reattachment enabled.
func retrieveAgentStates() (map[AgentID]AgentState, error) {
	rpNames := listResourcePoolsWithReattachEnabled()

	if len(rpNames) == 0 {
		return map[AgentID]AgentState{}, nil
	}

	snapshots := []AgentSnapshot{}
	err := db.Bun().NewSelect().Model(&snapshots).
		Where("resource_pool_name IN (?)", bun.In(rpNames)).
		Scan(context.TODO())
	if err != nil {
		return nil, err
	}

	result := make(map[AgentID]AgentState, len(snapshots))

	for _, s := range snapshots {
		state, err := newAgentStateFromSnapshot(s)
		if err != nil {
			return nil, fmt.Errorf("failed to recreate agent state %s: %w", s.AgentID, err)
		}

		result[s.AgentID] = *state
	}

	return result, nil
}

func newAgentStateFromSnapshot(as AgentSnapshot) (*AgentState, error) {
	parsedUUID, err := uuid.Parse(as.UUID)
	if err != nil {
		return nil, err
	}

	slotStates := make(map[device.ID]*slot)
	devices := make(map[device.Device]*cproto.ID)

	for _, sd := range as.Slots {
		slotStates[sd.Device.ID] = &slot{
			device:      sd.Device,
			containerID: sd.ContainerID,
			enabled: slotEnabled{
				deviceAdded:  true,
				agentEnabled: as.UserEnabled,
				userEnabled:  as.UserEnabled,
				draining:     as.UserDraining,
			},
		}
		if sd.ContainerID != nil {
			devices[sd.Device] = sd.ContainerID
		} else {
			devices[sd.Device] = nil
		}
	}

	containerState := make(map[cproto.ID]*cproto.Container)

	if len(as.Containers) > 0 {
		containerSnapshots := make([]ContainerSnapshot, 0, len(as.Containers))
		err := db.Bun().NewSelect().Model(&containerSnapshots).
			Where("container_id IN (?)", bun.In(as.Containers)).
			Scan(context.TODO())
		if err != nil {
			return nil, err
		}

		for _, containerSnapshot := range containerSnapshots {
			container := containerSnapshot.ToContainer()
			containerState[container.ID] = &container
		}
	}

	result := AgentState{
		maxZeroSlotContainers: as.MaxZeroSlotContainers,
		resourcePoolName:      as.ResourcePoolName,
		Label:                 as.Label,
		uuid:                  parsedUUID,
		enabled:               as.UserEnabled,
		draining:              as.UserDraining,
		slotStates:            slotStates,
		Devices:               devices,
		containerAllocation:   make(map[cproto.ID]*actor.Ref),
		containerState:        containerState,
	}

	return &result, nil
}

func (a *AgentState) restoreContainersField() error {
	containerIDs := maps.Keys(a.containerState)

	c2a, err := loadContainersToAllocationIds(containerIDs)
	if err != nil {
		return err
	}

	containers := make(map[cproto.ID]*actor.Ref)
	for contID, alloc := range c2a {
		ref := task.GetAllocation(alloc)
		if ref != nil {
			containers[contID] = ref
		}
	}
	log.WithField("agent-id", a.string()).Debugf("restored containers: %d", len(containers))

	maps.Copy(a.containerAllocation, containers)

	return nil
}

func clearAgentStates(agentIds []AgentID) error {
	_, err := db.Bun().NewDelete().Where("agent_id in (?)", agentIds).Exec(context.TODO())

	return err
}

func updateContainerState(c *cproto.Container) error {
	snapshot := NewContainerSnapshot(c)
	_, err := db.Bun().NewUpdate().Model(&snapshot).
		Where("container_id = ?", snapshot.ID).
		Column("state", "devices").
		Exec(context.TODO())

	return err
}

func loadContainersToAllocationIds(
	containerIDs []cproto.ID) (map[cproto.ID]model.AllocationID, error) {
	cs := []ContainerSnapshot{}
	result := []map[string]interface{}{}
	rr := map[cproto.ID]model.AllocationID{}

	if len(containerIDs) == 0 {
		return rr, nil
	}

	err := db.Bun().NewSelect().Model(&cs).
		Join("JOIN allocation_resources al_res ON al_res.resource_id = rmac.resource_id").
		Where("container_id IN (?)", bun.In(containerIDs)).
		Column("container_id", "allocation_id").
		Scan(context.TODO(), &result)
	if err != nil {
		return nil, err
	}

	for _, row := range result {
		rr[cproto.ID(row["container_id"].(string))] = model.AllocationID(row["allocation_id"].(string))
	}

	return rr, nil
}
