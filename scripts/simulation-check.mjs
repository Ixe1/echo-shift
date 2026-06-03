import { createServer } from "vite";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const frame = (floorY = 120) => [
  { id: "floor", x: 0, y: floorY, w: 320, h: 40 },
  { id: "left-wall", x: -20, y: 0, w: 20, h: 180 },
  { id: "right-wall", x: 320, y: 0, w: 20, h: 180 }
];

const baseLevel = {
  id: "test-room",
  index: 0,
  name: "Test Room",
  subtitle: "Simulation",
  start: { x: 20, y: 86 },
  exit: { x: 280, y: 82, w: 28, h: 38 },
  bounds: { x: 0, y: 0, w: 320, h: 180 },
  solids: frame(),
  perfectEchoes: 1,
  medalFrames: { gold: 600, silver: 900 },
  hint: "test"
};

const right = { left: false, right: true, jump: false };
const left = { left: true, right: false, jump: false };
const idle = { left: false, right: false, jump: false };
const jump = { left: false, right: false, jump: true };
const jumpRight = { left: false, right: true, jump: true };
const jumpLeft = { left: true, right: false, jump: true };
const routeInputs = { idle, right, left, jump, jumpRight, jumpLeft };
const CLOSED_GATE_MAX_TOP = 220;

const runFrames = (simulation, frames, input) => {
  for (let i = 0; i < frames; i += 1) {
    simulation.step(input);
  }
};

const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const oscillatingRectAt = (item, tick) => {
  const phase = item.phase || 0;
  const wave = Math.sin(((tick / item.period) * Math.PI * 2) + phase);
  const offset = wave * item.distance;
  return {
    x: item.x + (item.axis === "x" ? offset : 0),
    y: item.y + (item.axis === "y" ? offset : 0),
    w: item.w,
    h: item.h
  };
};

const routeObstacleRects = (simulation) => {
  const actor = simulation.player;
  const footY = actor.y + actor.h;
  const activeLasers = (simulation.level.lasers || []).filter((laser) => {
    const startsOn = laser.startsOn !== false;
    const disabled = (laser.disabledBy || []).some((id) => simulation.objectState.activePlates.has(id));
    return (
      startsOn &&
      !disabled &&
      !simulation.objectState.blockedLasers.has(laser.id) &&
      laser.y < footY &&
      laser.y + laser.h > actor.y + 2
    );
  });
  const activeMovingLasers = (simulation.level.movingLasers || [])
    .filter((laser) => {
      const startsOn = laser.startsOn !== false;
      const disabled = (laser.disabledBy || []).some((id) => simulation.objectState.activePlates.has(id));
      return startsOn && !disabled && !simulation.objectState.blockedLasers.has(laser.id);
    })
    .map((laser) => oscillatingRectAt(laser, simulation.tick))
    .filter((laser) => laser.y < footY && laser.y + laser.h > actor.y + 2);
  const activeHazards = (simulation.level.hazards || []).filter(
    (hazard) => hazard.y < footY && hazard.y + hazard.h > actor.y + 2
  );
  const activeDrones = (simulation.level.drones || [])
    .map((drone) => oscillatingRectAt(drone, simulation.tick))
    .filter((drone) => drone.y < footY && drone.y + drone.h > actor.y + 2);
  const lowSolids = simulation.level.solids.filter(
    (solid) =>
      !["floor", "left-wall", "right-wall"].includes(solid.id) &&
      solid.h <= 58 &&
      solid.y < footY &&
      solid.y + solid.h > actor.y + 10
  );
  return [...activeHazards, ...activeLasers, ...activeMovingLasers, ...activeDrones, ...lowSolids];
};

const supportRects = (simulation) => [
  ...simulation.level.solids,
  ...(simulation.level.oneWays || []),
  ...(simulation.level.conveyors || []),
  ...(simulation.level.platforms || []).map((platform) => oscillatingRectAt(platform, simulation.tick)),
  ...simulation.objectState.crates.values()
];

const hasSupportAhead = (simulation) => {
  const actor = simulation.player;
  const probe = {
    x: actor.x + actor.w,
    y: actor.y + actor.h + 3,
    w: 12,
    h: 10
  };
  return supportRects(simulation).some((support) => rectsOverlap(probe, support));
};

const shouldSmartJump = (simulation) => {
  const actor = simulation.player;
  if (!actor.onGround) return false;
  const aheadMin = actor.x + actor.w;
  const aheadMax = actor.x + actor.w + 18;
  const obstacleAhead = routeObstacleRects(simulation).some(
    (rect) => rect.x <= aheadMax && rect.x + rect.w >= aheadMin
  );
  return obstacleAhead || !hasSupportAhead(simulation);
};

const runSmartRight = (simulation, maxFrames, options = {}) => {
  let jumpFrames = 0;
  for (let i = 0; i < maxFrames; i += 1) {
    if (jumpFrames <= 0 && shouldSmartJump(simulation)) jumpFrames = 24;
    simulation.step({ left: false, right: true, jump: jumpFrames > 0 });
    jumpFrames -= 1;
    if (options.untilWin && simulation.won) return;
    if (typeof options.untilX === "number" && simulation.player.x >= options.untilX) return;
  }
};

const runRoute = (simulation, route) => {
  for (const step of route) {
    if (step[0] === "rewind") {
      assert(simulation.rewindToEcho(), `Expected ${simulation.level.name} route rewind to create an echo`);
      continue;
    }
    if (step[0] === "smartRight") {
      runSmartRight(simulation, step[1], { untilWin: true });
      continue;
    }
    if (step[0] === "smartRightUntilX") {
      runSmartRight(simulation, step[2], { untilX: step[1] });
      assert(
        simulation.player.x >= step[1],
        `Expected ${simulation.level.name} route to reach x=${step[1]}, got ${simulation.player.x.toFixed(1)}`
      );
      continue;
    }

    const [action, frames] = step;
    const input = routeInputs[action];
    assert(input, `Unknown route action: ${action}`);
    runFrames(simulation, frames, input);
  }
};

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "silent"
});

try {
  const { RoomSimulation } = await server.ssrLoadModule("/src/game/state.ts");
  const { levels } = await server.ssrLoadModule("/src/data/levels.ts");
  const { isBetterLevelScore } = await server.ssrLoadModule("/src/game/progress.ts");
  const { soundtrackForLevel, soundtracks } = await server.ssrLoadModule("/src/game/soundtracks.ts");
  const { backgroundForLevel, levelBackgrounds } = await server.ssrLoadModule("/src/game/backgrounds.ts");

  assert(levels.length === 10, `Expected 10 handcrafted levels, found ${levels.length}`);
  assert(levels.some((level) => (level.plates || []).length > 0), "Expected at least one pressure-plate level");
  assert(levels.some((level) => (level.doors || []).length > 0), "Expected at least one door level");
  assert(levels.some((level) => (level.lasers || []).length > 0), "Expected at least one laser level");
  assert(levels.some((level) => (level.platforms || []).length > 0), "Expected at least one moving-platform level");
  assert(levels.some((level) => (level.drones || []).length > 0), "Expected at least one patrol-drone level");
  assert(levels.some((level) => (level.cores || []).length > 0), "Expected at least one core level");
  assert(
    levels.every((level) => level.bounds.w >= 2400 && level.exit.x > 2200),
    "Expected every level to use expanded side-scrolling bounds and a distant exit"
  );
  assert(Boolean(soundtracks.menu), "Expected a main menu soundtrack");
  assert(Boolean(levelBackgrounds["time-lab-prototype"]), "Expected prototype level background");
  assert(Boolean(levelBackgrounds["level-1-time-lab-no-portals"]), "Expected Level 1 no-portal background");
  assert(backgroundForLevel(levels[0], 0).key === "level-1-time-lab-no-portals", "Expected Level 1 to use no-portal background");
  assert(backgroundForLevel(levels[1], 1).key === "time-lab-prototype", "Expected levels without explicit backgrounds to use prototype fallback");
  assert(soundtrackForLevel({ ...levels[0], soundtrackKey: "level-6" }).key === "level-6", "Expected explicit level soundtrack key to override index fallback");
  assert(soundtrackForLevel({ ...levels[5], soundtrackKey: undefined }, 5).key === "level-6", "Expected missing soundtrack key to fall back to level slot");
  assert(soundtrackForLevel({ ...levels[5], soundtrackKey: "missing-track" }, 5).key === "level-6", "Expected unknown soundtrack key to fall back to level slot");
  assert(soundtrackForLevel({ ...levels[5], soundtrackKey: "menu" }, 5).key === "level-6", "Expected menu soundtrack key to be ignored for levels");
  assert(soundtrackForLevel({ ...levels[0], index: 9, soundtrackKey: undefined }, 1).key === "level-2", "Expected auto soundtrack fallback to use runtime level slot, not authored index");

  const handcraftedRoutes = [
    {
      id: "portal-primer",
      route: [["smartRight", 1400]]
    },
    {
      id: "first-afterimage",
      route: [["smartRightUntilX", 164, 120], ["idle", 45], ["rewind"], ["smartRight", 1600]]
    },
    {
      id: "held-open",
      route: [["smartRightUntilX", 194, 140], ["idle", 45], ["rewind"], ["smartRight", 1900]]
    },
    {
      id: "relay-key",
      route: [["smartRightUntilX", 200, 150], ["idle", 45], ["rewind"], ["smartRight", 2100]]
    },
    {
      id: "lift-phase",
      route: [["smartRight", 1900]]
    },
    {
      id: "laser-shadow",
      route: [["smartRightUntilX", 390, 260], ["idle", 45], ["rewind"], ["smartRight", 2200]],
      activePlates: ["beam-safe"]
    },
    {
      id: "dual-lock",
      route: [
        ["smartRightUntilX", 160, 120],
        ["idle", 45],
        ["rewind"],
        ["smartRightUntilX", 332, 180],
        ["idle", 45],
        ["rewind"],
        ["smartRight", 2300]
      ]
    },
    {
      id: "cross-current",
      route: [["smartRightUntilX", 206, 150], ["idle", 45], ["rewind"], ["smartRight", 2500]]
    },
    {
      id: "phase-braid",
      route: [
        ["smartRightUntilX", 232, 150],
        ["idle", 45],
        ["rewind"],
        ["smartRightUntilX", 1470, 720],
        ["idle", 45],
        ["rewind"],
        ["smartRight", 2600]
      ]
    },
    {
      id: "echo-shift",
      route: [
        ["smartRightUntilX", 220, 150],
        ["idle", 45],
        ["rewind"],
        ["smartRightUntilX", 902, 500],
        ["idle", 45],
        ["rewind"],
        ["smartRightUntilX", 1610, 720],
        ["idle", 45],
        ["rewind"],
        ["smartRight", 3200]
      ]
    }
  ];

  const levelIds = levels.map((level) => level.id);
  const levelIndexes = levels.map((level) => level.index);
  const routeIds = handcraftedRoutes.map((route) => route.id);
  const duplicateLevelIds = levelIds.filter((id, index) => levelIds.indexOf(id) !== index);
  const duplicateLevelIndexes = levelIndexes.filter((index, position) => levelIndexes.indexOf(index) !== position);
  const misorderedLevelIndexes = levels
    .map((level, position) => ({ level, position }))
    .filter(({ level, position }) => level.index !== position)
    .map(({ level, position }) => `${level.id}:${level.index}->${position}`);
  const duplicateRouteIds = routeIds.filter((id, index) => routeIds.indexOf(id) !== index);
  const routeIdSet = new Set(routeIds);
  const levelIdSet = new Set(levelIds);
  const missingRouteIds = levelIds.filter((id) => !routeIdSet.has(id));
  const extraRouteIds = routeIds.filter((id) => !levelIdSet.has(id));
  assert(
    duplicateLevelIds.length === 0,
    `Expected unique level IDs, found duplicates: ${duplicateLevelIds.join(", ")}`
  );
  assert(
    duplicateLevelIndexes.length === 0,
    `Expected unique level indexes, found duplicates: ${duplicateLevelIndexes.join(", ")}`
  );
  assert(
    misorderedLevelIndexes.length === 0,
    `Expected level indexes to match array order, found mismatches: ${misorderedLevelIndexes.join(", ")}`
  );
  assert(
    duplicateRouteIds.length === 0,
    `Expected unique handcrafted route IDs, found duplicates: ${duplicateRouteIds.join(", ")}`
  );
  assert(
    missingRouteIds.length === 0 && extraRouteIds.length === 0,
    `Expected handcrafted routes to exactly match levels; missing ${missingRouteIds.join(", ") || "none"}, extra ${extraRouteIds.join(", ") || "none"}`
  );
  const missingSoundtrackIds = levels
    .filter((level) => !soundtrackForLevel(level))
    .map((level) => level.id);
  assert(
    missingSoundtrackIds.length === 0,
    `Expected every level to have a soundtrack; missing ${missingSoundtrackIds.join(", ")}`
  );

  const lowClosedGates = levels.flatMap((level) =>
    (level.doors || [])
      .filter((door) => door.y > CLOSED_GATE_MAX_TOP)
      .map((door) => `${level.id}:${door.id}@${door.y}`)
  );
  assert(
    lowClosedGates.length === 0,
    `Expected closed gate tops at or above y=${CLOSED_GATE_MAX_TOP}; low gates: ${lowClosedGates.join(", ")}`
  );

  const sparseCourseLevels = levels
    .filter((level) => level.solids.filter((solid) => solid.id === "floor" || solid.id.startsWith("floor-")).length < 3)
    .map((level) => level.id);
  assert(
    sparseCourseLevels.length === 0,
    `Expected every expanded level to have multiple floor segments/gaps; sparse levels: ${sparseCourseLevels.join(", ")}`
  );

  const bypassedFloorGates = [];
  for (const level of levels) {
    for (const door of (level.doors || []).filter((item) => item.y + item.h >= 490)) {
      const closedGateLevel = { ...level, plates: [], cores: [] };
      const simulation = new RoomSimulation(closedGateLevel);
      simulation.player.x = Math.max(level.bounds.x, door.x - 170);
      simulation.player.y = door.y + door.h - simulation.player.h;
      simulation.player.vx = 0;
      simulation.player.vy = 0;
      simulation.player.onGround = true;
      simulation.player.coyote = 7;
      simulation.player.standingOn = null;

      runFrames(simulation, 18, right);
      runFrames(simulation, 18, jumpRight);
      runFrames(simulation, 120, right);

      if (simulation.player.x > door.x + door.w) {
        bypassedFloorGates.push(`${level.id}:${door.id}`);
      }
    }
  }
  assert(
    bypassedFloorGates.length === 0,
    `Expected closed floor-height gates to stop jump bypasses; bypassed: ${bypassedFloorGates.join(", ")}`
  );

  const rightOnlyBypasses = [];
  for (const level of levels) {
    const simulation = new RoomSimulation(level);
    runFrames(simulation, level.medalFrames.silver, right);
    if (simulation.won) rightOnlyBypasses.push(level.id);
  }
  assert(
    rightOnlyBypasses.length === 0,
    `Expected no level to be clearable by holding right only; bypassed levels: ${rightOnlyBypasses.join(", ")}`
  );

  const routeSummaries = [];
  for (const routeSpec of handcraftedRoutes) {
    const level = levels.find((item) => item.id === routeSpec.id);
    assert(level, `Missing handcrafted route level: ${routeSpec.id}`);

    const simulation = new RoomSimulation(level);
    runRoute(simulation, routeSpec.route);

    assert(simulation.won, `${level.name} route should reach the portal`);
    assert(!simulation.dead, `${level.name} route should not end dead`);
    assert(
      simulation.echoRecordings.length <= level.perfectEchoes,
      `${level.name} route used ${simulation.echoRecordings.length} echoes, perfect budget is ${level.perfectEchoes}`
    );
    assert(simulation.scoreMedal() === "Quantum", `${level.name} route should score Quantum`);

    const goldSlack = level.medalFrames.gold - simulation.totalFrames;
    assert(goldSlack >= 420, `${level.name} Quantum route leaves only ${goldSlack} gold-threshold slack frames`);
    assert(
      simulation.totalFrames >= 600,
      `${level.name} route completed too quickly for the expanded side-scrolling soundtrack target: ${simulation.totalFrames}`
    );

    for (const laserId of routeSpec.blockedLasers || []) {
      assert(simulation.objectState.blockedLasers.has(laserId), `${level.name} route did not block ${laserId}`);
    }
    for (const plateId of routeSpec.activePlates || []) {
      assert(simulation.objectState.activePlates.has(plateId), `${level.name} route did not hold ${plateId}`);
    }

    routeSummaries.push({
      id: level.id,
      frames: simulation.totalFrames,
      echoes: simulation.echoRecordings.length,
      goldSlack
    });
  }

  const heldOpen = levels[2];
  const heldOpenExpanded = new RoomSimulation(heldOpen);
  heldOpenExpanded.objectState.latchedPlates.add("plate-b");
  runSmartRight(heldOpenExpanded, 1900, { untilWin: true });
  assert(heldOpenExpanded.won, "Held Open expanded route should reach the portal with the gate held open");

  const liftPhase = levels[4];
  const lift = liftPhase.platforms?.find((platform) => platform.id === "lift-a");
  assert(lift, "Expected Lift Phase to include lift-a");
  const liftPhaseExpanded = new RoomSimulation(liftPhase);
  runSmartRight(liftPhaseExpanded, 1900, { untilWin: true });
  assert(liftPhaseExpanded.won, "Lift Phase expanded route should reach the side-scrolling portal");

  const goldScore = { levelId: "score-test", frames: 600, echoes: 3, medal: "Gold" };
  const slowBronzeFewerEchoes = { levelId: "score-test", frames: 2400, echoes: 0, medal: "Bronze" };
  const fasterGold = { levelId: "score-test", frames: 540, echoes: 3, medal: "Gold" };
  const fewerEchoGold = { levelId: "score-test", frames: 660, echoes: 2, medal: "Gold" };
  assert(!isBetterLevelScore(slowBronzeFewerEchoes, goldScore), "Worse medal should not replace better medal");
  assert(isBetterLevelScore(fewerEchoGold, goldScore), "Same medal with fewer echoes should replace previous score");
  assert(isBetterLevelScore(fasterGold, goldScore), "Same medal and echoes with faster time should replace previous score");

  const echoPlateLevel = {
    ...baseLevel,
    plates: [{ id: "plate-a", x: 94, y: 112, w: 58, h: 8 }],
    doors: [{ id: "door-a", x: 220, y: 70, w: 18, h: 50, opensWith: ["plate-a"] }]
  };
  const plateSim = new RoomSimulation(echoPlateLevel);
  runFrames(plateSim, 34, right);
  assert(plateSim.rewindToEcho(), "Expected first attempt to become an echo");
  runFrames(plateSim, 46, idle);
  assert(plateSim.echoRecordings.length === 1, "Expected exactly one stored echo");
  assert(plateSim.objectState.activePlates.has("plate-a"), "Echo did not activate the pressure plate");
  assert(plateSim.objectState.openDoors.has("door-a"), "Pressure plate did not open the linked door");

  const coreLevel = {
    ...baseLevel,
    cores: [{ id: "core-a", x: 22, y: 88, w: 20, h: 20 }],
    doors: [{ id: "core-door", x: 90, y: 70, w: 18, h: 50, opensWith: [], requiresCore: "core-a" }]
  };
  const coreSim = new RoomSimulation(coreLevel);
  const coreEvent = coreSim.step(idle);
  assert(coreSim.objectState.collectedCores.has("core-a"), "Player did not collect overlapping core");
  assert(coreSim.objectState.openDoors.has("core-door"), "Core-locked door did not open after collection");
  assert(coreEvent.core && coreEvent.core.x > 20 && coreEvent.core.x < 50, "Core pickup event did not report player location");

  const echoCoreLevel = {
    ...baseLevel,
    cores: [{ id: "core-echo", x: 118, y: 88, w: 20, h: 20 }]
  };
  const echoCoreSim = new RoomSimulation(echoCoreLevel);
  runFrames(echoCoreSim, 34, right);
  assert(echoCoreSim.rewindToEcho(), "Expected core setup attempt to become an echo");
  let echoCoreEvent = null;
  for (let i = 0; i < 60; i += 1) {
    const event = echoCoreSim.step(idle);
    if (event.core) {
      echoCoreEvent = event.core;
      break;
    }
  }
  assert(echoCoreEvent, "Echo did not collect the core during replay");
  assert(echoCoreEvent.x > 100, `Echo core pickup event used the wrong origin: ${JSON.stringify(echoCoreEvent)}`);

  const laserLevel = {
    ...baseLevel,
    plates: [{ id: "beam-safe", x: 18, y: 112, w: 38, h: 8, once: true }],
    lasers: [{ id: "beam-a", x: 82, y: 88, w: 70, h: 28, startsOn: true, disabledBy: ["beam-safe"] }]
  };
  const laserSim = new RoomSimulation(laserLevel);
  laserSim.step(idle);
  runFrames(laserSim, 26, right);
  assert(laserSim.rewindToEcho(), "Expected laser setup attempt to become an echo");
  let blocked = false;
  for (let i = 0; i < 48; i += 1) {
    laserSim.step(i < 32 ? right : idle);
    blocked ||= laserSim.objectState.blockedLasers.has("beam-a");
  }
  assert(blocked, "Echo did not block the laser beam");
  assert(!laserSim.dead, "Player died while the laser was blocked by an echo");

  const oneWayLandingLevel = {
    ...baseLevel,
    start: { x: 82, y: 72 },
    solids: [
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    oneWays: [{ id: "one-way-a", x: 60, y: 120, w: 120, h: 12 }]
  };
  const oneWayLandingSim = new RoomSimulation(oneWayLandingLevel);
  runFrames(oneWayLandingSim, 45, idle);
  assert(oneWayLandingSim.player.onGround, "Player did not land on one-way platform from above");
  assert(
    Math.abs(oneWayLandingSim.player.y + oneWayLandingSim.player.h - 120) < 0.01,
    `Player landed at wrong one-way height: ${oneWayLandingSim.player.y + oneWayLandingSim.player.h}`
  );
  const oneWayPassSim = new RoomSimulation(oneWayLandingLevel);
  oneWayPassSim.player.x = 82;
  oneWayPassSim.player.y = 132;
  oneWayPassSim.player.onGround = true;
  oneWayPassSim.player.coyote = 7;
  runFrames(oneWayPassSim, 18, jump);
  assert(oneWayPassSim.player.y < 112, `Player should jump up through one-way from below, got y=${oneWayPassSim.player.y}`);

  const conveyorLevel = {
    ...baseLevel,
    start: { x: 64, y: 86 },
    solids: [
      { id: "floor-left", x: 0, y: 120, w: 60, h: 40 },
      { id: "floor-right", x: 180, y: 120, w: 140, h: 40 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    conveyors: [{ id: "belt-a", x: 60, y: 120, w: 120, h: 20, direction: 1, speed: 1.6 }]
  };
  const conveyorSim = new RoomSimulation(conveyorLevel);
  runFrames(conveyorSim, 45, idle);
  assert(conveyorSim.player.x > 90, `Conveyor did not push idle player right, got x=${conveyorSim.player.x}`);

  const conveyorBlockedLevel = {
    ...baseLevel,
    start: { x: 64, y: 86 },
    solids: [
      { id: "floor-left", x: 0, y: 120, w: 60, h: 40 },
      { id: "floor-right", x: 180, y: 120, w: 140, h: 40 },
      { id: "crate-stop", x: 132, y: 70, w: 18, h: 50 },
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    conveyors: [{ id: "belt-blocked", x: 60, y: 120, w: 120, h: 20, direction: 1, speed: 3 }],
    crates: [{ id: "crate-blocked", x: 100, y: 86, w: 30, h: 34 }]
  };
  const conveyorBlockedSim = new RoomSimulation(conveyorBlockedLevel);
  runFrames(conveyorBlockedSim, 35, idle);
  const blockedCrate = conveyorBlockedSim.objectState.crates.get("crate-blocked");
  assert(blockedCrate, "Blocked conveyor crate missing from object state");
  assert(
    conveyorBlockedSim.player.x + conveyorBlockedSim.player.w <= blockedCrate.x + 0.01,
    `Conveyor pushed player through blocked crate: player ${conveyorBlockedSim.player.x}, crate ${blockedCrate.x}`
  );

  const launchLevel = {
    ...baseLevel,
    start: { x: 26, y: 86 },
    launchPads: [{ id: "launch-a", x: 20, y: 112, w: 70, h: 8, powerY: 13.5, powerX: 1 }]
  };
  const launchSim = new RoomSimulation(launchLevel);
  const launchEvent = launchSim.step(idle);
  assert(launchEvent.launched, "Launch pad did not report a launch event");
  assert(launchSim.player.vy < -12 && launchSim.player.vx > 0, `Launch pad did not apply impulse: vx=${launchSim.player.vx}, vy=${launchSim.player.vy}`);

  const sideLaunchLevel = {
    ...baseLevel,
    start: { x: 45, y: 98 },
    solids: [
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ],
    launchPads: [{ id: "launch-side", x: 20, y: 80, w: 50, h: 20, powerY: 13.5 }]
  };
  const sideLaunchSim = new RoomSimulation(sideLaunchLevel);
  const sideLaunchEvent = sideLaunchSim.step(idle);
  assert(!sideLaunchEvent.launched, "Launch pad fired from side/underside overlap");
  assert(sideLaunchSim.player.vy > 0, `Side-overlap launch pad should not reverse fall velocity, got ${sideLaunchSim.player.vy}`);

  const timedSwitchLevel = {
    ...baseLevel,
    timedSwitches: [{ id: "timer-a", x: 18, y: 112, w: 50, h: 8, duration: 20 }],
    doors: [{ id: "timer-door", x: 170, y: 70, w: 18, h: 50, opensWith: ["timer-a"] }]
  };
  const timedSim = new RoomSimulation(timedSwitchLevel);
  timedSim.step(idle);
  assert(timedSim.objectState.activePlates.has("timer-a"), "Timed switch did not become active on contact");
  assert(timedSim.objectState.openDoors.has("timer-door"), "Timed switch did not open linked door");
  timedSim.player.x = 100;
  runFrames(timedSim, 12, idle);
  assert(timedSim.objectState.activePlates.has("timer-a"), "Timed switch expired too early");
  runFrames(timedSim, 28, idle);
  assert(!timedSim.objectState.activePlates.has("timer-a"), "Timed switch did not expire after duration");

  const echoSensorLevel = {
    ...baseLevel,
    echoSensors: [{ id: "echo-sensor-a", x: 112, y: 84, w: 38, h: 40 }],
    doors: [{ id: "sensor-door", x: 210, y: 70, w: 18, h: 50, opensWith: ["echo-sensor-a"] }]
  };
  const echoSensorPlayerOnlySim = new RoomSimulation({ ...echoSensorLevel, start: { x: 112, y: 86 } });
  echoSensorPlayerOnlySim.step(idle);
  assert(!echoSensorPlayerOnlySim.objectState.activePlates.has("echo-sensor-a"), "Echo-only sensor should not activate for the player");
  const echoSensorSim = new RoomSimulation(echoSensorLevel);
  runFrames(echoSensorSim, 34, right);
  assert(echoSensorSim.rewindToEcho(), "Expected echo sensor setup attempt to become an echo");
  runFrames(echoSensorSim, 46, idle);
  assert(echoSensorSim.objectState.activePlates.has("echo-sensor-a"), "Echo did not activate echo sensor");
  assert(echoSensorSim.objectState.openDoors.has("sensor-door"), "Echo sensor did not open linked door");

  const movingLaserLevel = {
    ...baseLevel,
    movingLasers: [{ id: "sweeper-a", x: 20, y: 86, w: 40, h: 34, axis: "x", distance: 0, period: 120, startsOn: true }]
  };
  const movingLaserSim = new RoomSimulation(movingLaserLevel);
  movingLaserSim.step(idle);
  assert(movingLaserSim.dead, "Overlapping moving laser should kill the player");

  const crateLevel = {
    ...baseLevel,
    plates: [{ id: "crate-plate", x: 184, y: 112, w: 50, h: 8 }],
    crates: [{ id: "crate-a", x: 62, y: 86, w: 30, h: 34 }],
    doors: [{ id: "crate-door", x: 220, y: 70, w: 18, h: 50, opensWith: ["crate-plate"] }]
  };
  const crateSim = new RoomSimulation(crateLevel);
  runFrames(crateSim, 34, right);
  const crateAfterPush = crateSim.objectState.crates.get("crate-a");
  assert(crateAfterPush && crateAfterPush.x > 78, `Player did not push crate right, got ${JSON.stringify(crateAfterPush)}`);
  assert(crateSim.objectState.activePlates.has("crate-plate"), "Crate did not hold pressure plate after being pushed");
  assert(crateSim.objectState.openDoors.has("crate-door"), "Crate-held plate did not open linked door");

  const deathLevel = {
    ...baseLevel,
    hazards: [{ id: "death-zone", x: 20, y: 86, w: 28, h: 34 }]
  };
  const deathSim = new RoomSimulation(deathLevel);
  deathSim.step(idle);
  assert(deathSim.dead, "Expected overlapping hazard to kill the player");
  const deadTick = deathSim.tick;
  const deadFrames = deathSim.totalFrames;
  runFrames(deathSim, 30, right);
  assert(deathSim.tick === deadTick, "Dead attempt should not continue ticking");
  assert(deathSim.totalFrames === deadFrames, "Dead attempt should not continue scoring time");

  const droneLevel = {
    ...baseLevel,
    drones: [{ id: "drone-test", x: 20, y: 86, w: 28, h: 34, axis: "x", distance: 0, period: 120 }]
  };
  const droneSim = new RoomSimulation(droneLevel);
  droneSim.step(idle);
  assert(droneSim.dead, "Expected overlapping patrol drone to kill the player");

  const fallLevel = {
    ...baseLevel,
    start: { x: 20, y: 20 },
    bounds: { x: 0, y: 0, w: 320, h: 90 },
    solids: [
      { id: "left-wall", x: -20, y: 0, w: 20, h: 220 },
      { id: "right-wall", x: 320, y: 0, w: 20, h: 220 }
    ]
  };
  const fallSim = new RoomSimulation(fallLevel);
  runFrames(fallSim, 90, idle);
  assert(fallSim.dead, "Falling out of bounds should mark the attempt dead");
  assert(!fallSim.player.alive, "Falling out of bounds should mark the player not alive");
  const fallTick = fallSim.tick;
  const fallFrames = fallSim.totalFrames;
  runFrames(fallSim, 30, right);
  assert(fallSim.tick === fallTick, "Out-of-bounds death should not continue ticking");
  assert(fallSim.totalFrames === fallFrames, "Out-of-bounds death should not continue scoring time");

  const deterministicLevel = {
    ...baseLevel,
    platforms: [{ id: "lift-test", x: 108, y: 96, w: 72, h: 14, axis: "y", distance: 24, period: 90 }]
  };
  const inputSequence = [
    ...Array.from({ length: 16 }, () => right),
    ...Array.from({ length: 8 }, () => jump),
    ...Array.from({ length: 30 }, () => right),
    ...Array.from({ length: 16 }, () => idle)
  ];
  const baseline = new RoomSimulation(deterministicLevel);
  for (const input of inputSequence) baseline.step(input);
  const expected = {
    x: Number(baseline.player.x.toFixed(3)),
    y: Number(baseline.player.y.toFixed(3)),
    tick: baseline.tick
  };
  const replay = new RoomSimulation(deterministicLevel);
  for (const input of inputSequence) replay.step(input);
  assert(replay.rewindToEcho(), "Expected deterministic setup attempt to become an echo");
  runFrames(replay, inputSequence.length, idle);
  const echo = replay.echoes[0];
  const actual = {
    x: Number(echo.x.toFixed(3)),
    y: Number(echo.y.toFixed(3)),
    tick: replay.tick
  };
  assert(
    actual.x === expected.x && actual.y === expected.y && actual.tick === expected.tick,
    `Echo replay diverged: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        levels: levels.length,
        checks: [
          "level-data",
          "held-open-expanded-route",
          "lift-phase-expanded-route",
          "score-ranking",
          "echo-plate-door",
          "core-door",
          "echo-core-origin",
          "laser-blocking",
          "entity-toolkit",
          "death-freeze",
          "drone-hazard",
          "fall-death-freeze",
          "deterministic-replay",
          "soundtrack-manifest",
          "side-scrolling-bounds",
          "closed-gate-top-contract",
          "closed-floor-gate-bypass",
          "multi-segment-level-density",
          "right-only-bypass-regression",
          "all-level-quantum-routes"
        ],
        routeSummaries
      },
      null,
      2
    )
  );
} finally {
  await server.close();
}
