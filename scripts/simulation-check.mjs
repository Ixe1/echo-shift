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

const runFrames = (simulation, frames, input) => {
  for (let i = 0; i < frames; i += 1) {
    simulation.step(input);
  }
};

const runRoute = (simulation, route) => {
  for (const step of route) {
    if (step[0] === "rewind") {
      assert(simulation.rewindToEcho(), `Expected ${simulation.level.name} route rewind to create an echo`);
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
  const { platformRectAt } = await server.ssrLoadModule("/src/game/player.ts");
  const { isBetterLevelScore } = await server.ssrLoadModule("/src/game/progress.ts");

  assert(levels.length === 10, `Expected 10 handcrafted levels, found ${levels.length}`);
  assert(levels.some((level) => (level.plates || []).length > 0), "Expected at least one pressure-plate level");
  assert(levels.some((level) => (level.doors || []).length > 0), "Expected at least one door level");
  assert(levels.some((level) => (level.lasers || []).length > 0), "Expected at least one laser level");
  assert(levels.some((level) => (level.platforms || []).length > 0), "Expected at least one moving-platform level");
  assert(levels.some((level) => (level.cores || []).length > 0), "Expected at least one core level");

  const handcraftedRoutes = [
    {
      id: "portal-primer",
      route: [
        ["idle", 17],
        ["left", 4],
        ["right", 53],
        ["jumpRight", 6],
        ["right", 19],
        ["idle", 14],
        ["right", 17],
        ["jump", 14],
        ["right", 26],
        ["jump", 12],
        ["idle", 4],
        ["jumpRight", 9],
        ["idle", 34],
        ["jumpRight", 30],
        ["right", 7],
        ["jumpRight", 6],
        ["right", 72]
      ]
    },
    {
      id: "first-afterimage",
      route: [["right", 42], ["rewind"], ["right", 300]]
    },
    {
      id: "held-open",
      route: [
        ["right", 42],
        ["rewind"],
        ["right", 65],
        ["jumpRight", 12],
        ["right", 22],
        ["jumpRight", 14],
        ["right", 53],
        ["jumpRight", 12],
        ["right", 90]
      ]
    },
    {
      id: "relay-key",
      route: [
        ["right", 50],
        ["rewind"],
        ["right", 80],
        ["jumpRight", 12],
        ["right", 60],
        ["jumpRight", 14],
        ["right", 70],
        ["jumpRight", 12],
        ["right", 160]
      ]
    },
    {
      id: "lift-phase",
      route: [
        ["idle", 17],
        ["right", 18],
        ["jumpRight", 8],
        ["right", 42],
        ["idle", 184],
        ["right", 39],
        ["jumpRight", 14],
        ["right", 37],
        ["jumpRight", 8],
        ["right", 120]
      ]
    },
    {
      id: "laser-shadow",
      route: [
        ["right", 60],
        ["jumpRight", 12],
        ["right", 80],
        ["rewind"],
        ["right", 60],
        ["jumpRight", 12],
        ["right", 115],
        ["jumpRight", 14],
        ["right", 140]
      ],
      blockedLasers: ["beam-a"]
    },
    {
      id: "dual-lock",
      route: [
        ["right", 35],
        ["rewind"],
        ["right", 90],
        ["rewind"],
        ["right", 110],
        ["jumpRight", 12],
        ["right", 50],
        ["jumpRight", 12],
        ["right", 180]
      ]
    },
    {
      id: "cross-current",
      route: [
        ["right", 20],
        ["jumpRight", 14],
        ["right", 8],
        ["idle", 30],
        ["rewind"],
        ["right", 20],
        ["jumpRight", 14],
        ["right", 45],
        ["jumpRight", 14],
        ["right", 40],
        ["right", 5],
        ["idle", 105],
        ["jumpRight", 14],
        ["right", 16],
        ["jumpRight", 14],
        ["right", 100]
      ]
    },
    {
      id: "phase-braid",
      route: [
        ["right", 20],
        ["jumpRight", 14],
        ["right", 18],
        ["idle", 90],
        ["rewind"],
        ["right", 20],
        ["jumpRight", 14],
        ["right", 18],
        ["idle", 10],
        ["right", 16],
        ["jumpRight", 14],
        ["right", 67],
        ["jumpRight", 14],
        ["right", 24],
        ["idle", 100],
        ["rewind"],
        ["right", 20],
        ["jumpRight", 14],
        ["right", 18],
        ["idle", 10],
        ["right", 16],
        ["jumpRight", 14],
        ["right", 67],
        ["jumpRight", 14],
        ["right", 130]
      ]
    },
    {
      id: "echo-shift",
      route: [
        ["right", 20],
        ["jumpRight", 14],
        ["right", 18],
        ["idle", 90],
        ["rewind"],
        ["right", 20],
        ["jumpRight", 14],
        ["right", 18],
        ["idle", 8],
        ["right", 20],
        ["jumpRight", 14],
        ["right", 20],
        ["idle", 90],
        ["rewind"],
        ["right", 20],
        ["jumpRight", 14],
        ["right", 18],
        ["idle", 8],
        ["right", 20],
        ["jumpRight", 14],
        ["right", 20],
        ["idle", 120],
        ["right", 50],
        ["jumpRight", 14],
        ["right", 18],
        ["idle", 120],
        ["rewind"],
        ["right", 20],
        ["jumpRight", 14],
        ["right", 18],
        ["idle", 8],
        ["right", 20],
        ["jumpRight", 14],
        ["right", 20],
        ["idle", 120],
        ["right", 50],
        ["jumpRight", 14],
        ["right", 180]
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

    for (const laserId of routeSpec.blockedLasers || []) {
      assert(simulation.objectState.blockedLasers.has(laserId), `${level.name} route did not block ${laserId}`);
    }

    routeSummaries.push({
      id: level.id,
      frames: simulation.totalFrames,
      echoes: simulation.echoRecordings.length,
      goldSlack
    });
  }

  const heldOpen = levels[2];
  const midLedge = heldOpen.solids.find((solid) => solid.id === "mid-ledge");
  const exitLedge = heldOpen.solids.find((solid) => solid.id === "exit-ledge");
  assert(midLedge && exitLedge, "Expected Held Open to include mid and exit ledges");
  const heldOpenJump = new RoomSimulation(heldOpen);
  heldOpenJump.objectState.latchedPlates.add("plate-b");
  heldOpenJump.player.x = midLedge.x + midLedge.w - heldOpenJump.player.w - 8;
  heldOpenJump.player.y = midLedge.y - heldOpenJump.player.h;
  heldOpenJump.player.vx = 0;
  heldOpenJump.player.vy = 0;
  heldOpenJump.player.onGround = true;
  heldOpenJump.player.coyote = 7;
  runFrames(heldOpenJump, 2, right);
  runFrames(heldOpenJump, 12, jumpRight);
  runFrames(heldOpenJump, 90, right);
  assert(heldOpenJump.won, "Held Open final jump should reach the exit ledge and portal with the gate held open");

  const liftPhase = levels[4];
  const lift = liftPhase.platforms?.find((platform) => platform.id === "lift-a");
  assert(lift, "Expected Lift Phase to include lift-a");
  const liftPhaseJump = new RoomSimulation(liftPhase);
  const liftLaunchTick = 150;
  // A grounded rider is carried from the previous platform frame to the current one before jumping.
  const liftRect = platformRectAt(lift, liftLaunchTick - 1);
  liftPhaseJump.tick = liftLaunchTick;
  liftPhaseJump.totalFrames = liftLaunchTick;
  liftPhaseJump.player.x = liftRect.x + liftRect.w - liftPhaseJump.player.w;
  liftPhaseJump.player.y = liftRect.y - liftPhaseJump.player.h;
  liftPhaseJump.player.vx = 205 / 60;
  liftPhaseJump.player.vy = 0;
  liftPhaseJump.player.onGround = true;
  liftPhaseJump.player.coyote = 7;
  liftPhaseJump.player.standingOn = "lift-a";
  runFrames(liftPhaseJump, 12, jumpRight);
  runFrames(liftPhaseJump, 95, right);
  assert(liftPhaseJump.won, "Lift Phase final lift jump should reach the right ledge and portal");

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
          "held-open-final-jump",
          "lift-phase-final-jump",
          "score-ranking",
          "echo-plate-door",
          "core-door",
          "echo-core-origin",
          "laser-blocking",
          "death-freeze",
          "fall-death-freeze",
          "deterministic-replay",
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
