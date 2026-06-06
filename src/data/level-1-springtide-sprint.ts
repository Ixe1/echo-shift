import type { Level } from "../game/types";

export const level1SpringtideSprint = {
    "id": "portal-primer",
    "index": 0,
    "name": "Springtide Sprint",
    "subtitle": "A high-speed line through the reclaimed atrium",
    "motionModel": "anchored",
    "soundtrackKey": "level-1",
    "backgroundKey": "level-1-springtide-glassgrove",
    "backgroundAmbience": {
      "preset": "lab",
      "intensity": 0.28,
      "color": "#43f7ff",
      "drift": 0.26,
      "flicker": 0.12,
      "particles": 0.22
    },
    "start": {
      "x": 38,
      "y": 350
    },
    "exit": {
      "x": 2346,
      "y": 98,
      "w": 48,
      "h": 62
    },
    "bounds": {
      "x": 0,
      "y": 0,
      "w": 2400,
      "h": 540
    },
    "solids": [
      {
        "x": -26,
        "y": 0,
        "w": 26,
        "h": 560,
        "id": "left-wall",
        "tone": "glass"
      },
      {
        "x": 2400,
        "y": 0,
        "w": 26,
        "h": 560,
        "id": "right-wall",
        "tone": "glass"
      },
      {
        "x": 20,
        "y": 400,
        "w": 180,
        "h": 20,
        "id": "floorpiece-6",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 20,
        "y": 500,
        "w": 1000,
        "h": 60,
        "id": "solid-5",
        "sprite": "floor",
        "material": "grass-organic"
      },
      {
        "x": 340,
        "y": 260,
        "w": 180,
        "h": 20,
        "id": "solid-6",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 580,
        "y": 300,
        "w": 140,
        "h": 20,
        "id": "solid-7",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 720,
        "y": 340,
        "w": 100,
        "h": 20,
        "id": "solid-8",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 820,
        "y": 380,
        "w": 140,
        "h": 20,
        "id": "solid-9",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 960,
        "y": 340,
        "w": 60,
        "h": 20,
        "id": "solid-10",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 1020,
        "y": 480,
        "w": 1380,
        "h": 80,
        "id": "solid-11",
        "sprite": "floor",
        "material": "grass-organic"
      },
      {
        "x": 320,
        "y": 480,
        "w": 20,
        "h": 20,
        "id": "block-11",
        "sprite": "block",
        "material": "wood-archive"
      },
      {
        "x": 880,
        "y": 140,
        "w": 220,
        "h": 20,
        "id": "floorpiece-13",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 2200,
        "y": 180,
        "w": 200,
        "h": 20,
        "id": "floorpiece-14",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "top-only"
      },
      {
        "x": 1160,
        "y": 140,
        "w": 220,
        "h": 20,
        "id": "solid-15",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 0,
        "y": 0,
        "w": 20,
        "h": 300,
        "id": "wall-17",
        "tone": "dark",
        "sprite": "wall"
      },
      {
        "x": 0,
        "y": 400,
        "w": 20,
        "h": 160,
        "id": "solid-18",
        "tone": "dark",
        "sprite": "wall"
      },
      {
        "x": 1200,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "block-17",
        "tone": "glass",
        "sprite": "block",
        "material": "warning-industrial"
      },
      {
        "x": 1560,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "solid-19",
        "tone": "glass",
        "sprite": "block",
        "material": "warning-industrial"
      },
      {
        "x": 1680,
        "y": 180,
        "w": 520,
        "h": 20,
        "id": "upper-catch-rail",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      }
    ],
    "oneWays": [],
    "platforms": [
      {
        "x": 1060,
        "y": 340,
        "w": 120,
        "h": 20,
        "id": "platform-1",
        "axis": "y",
        "distance": 100,
        "period": 180,
        "phase": 0
      },
      {
        "x": 760,
        "y": 180,
        "w": 120,
        "h": 20,
        "id": "platform-2",
        "axis": "x",
        "distance": 120,
        "period": 180,
        "phase": 0
      },
      {
        "x": 1600,
        "y": 180,
        "w": 120,
        "h": 20,
        "id": "platform-3",
        "axis": "y",
        "distance": 240,
        "period": 180,
        "phase": 2.1
      },
      {
        "x": 1680,
        "y": 180,
        "w": 200,
        "h": 20,
        "id": "platform-4",
        "axis": "x",
        "distance": 80,
        "period": 180,
        "phase": 0
      },
      {
        "x": 1900,
        "y": 180,
        "w": 180,
        "h": 20,
        "id": "platform-5",
        "axis": "x",
        "distance": 80,
        "period": 180,
        "phase": 0
      },
      {
        "x": 1220,
        "y": 340,
        "w": 80,
        "h": 20,
        "id": "platform-6",
        "axis": "x",
        "distance": 260,
        "period": 180,
        "phase": 0
      }
    ],
    "launchPads": [
      {
        "x": 620,
        "y": 280,
        "w": 60,
        "h": 20,
        "id": "launch-pad-1",
        "powerY": 30
      }
    ],
    "drones": [],
    "plates": [
      {
        "x": 720,
        "y": 480,
        "w": 80,
        "h": 20,
        "id": "plate-1"
      }
    ],
    "timedSwitches": [],
    "echoSensors": [],
    "doors": [],
    "lasers": [
      {
        "x": 1200,
        "y": 460,
        "w": 380,
        "h": 20,
        "id": "laser-1",
        "startsOn": true,
        "disabledBy": [
          "plate-1"
        ]
      }
    ],
    "movingLasers": [
      {
        "x": 820,
        "y": 380,
        "w": 20,
        "h": 120,
        "id": "moving-laser-1",
        "axis": "x",
        "distance": 120,
        "period": 180,
        "phase": 0,
        "disabledBy": [
          "plate-1"
        ],
        "startsOn": true
      }
    ],
    "cores": [
      {
        "x": 80,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-6",
        "label": "6"
      },
      {
        "x": 120,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-7",
        "label": "7"
      },
      {
        "x": 160,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-9",
        "label": "9"
      },
      {
        "x": 40,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-15",
        "label": "9"
      },
      {
        "x": 80,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-17",
        "label": "9"
      },
      {
        "x": 120,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-20",
        "label": "9"
      },
      {
        "x": 160,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-22",
        "label": "9"
      },
      {
        "x": 420,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-16",
        "label": "7"
      },
      {
        "x": 380,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-18",
        "label": "7"
      },
      {
        "x": 460,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-19",
        "label": "7"
      },
      {
        "x": 900,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-11",
        "label": "7"
      },
      {
        "x": 940,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-12",
        "label": "7"
      },
      {
        "x": 980,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-13",
        "label": "7"
      },
      {
        "x": 1020,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-14",
        "label": "7"
      },
      {
        "x": 1060,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-21",
        "label": "7"
      },
      {
        "x": 1220,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-23",
        "label": "7"
      },
      {
        "x": 1180,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-24",
        "label": "7"
      },
      {
        "x": 1260,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-25",
        "label": "7"
      },
      {
        "x": 1300,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-26",
        "label": "7"
      },
      {
        "x": 1340,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-27",
        "label": "7"
      },
      {
        "x": 1620,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-28",
        "label": "28"
      },
      {
        "x": 1620,
        "y": 300,
        "w": 20,
        "h": 20,
        "id": "core-29",
        "label": "28"
      },
      {
        "x": 1680,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-30",
        "label": "28"
      },
      {
        "x": 1680,
        "y": 300,
        "w": 20,
        "h": 20,
        "id": "core-31",
        "label": "28"
      },
      {
        "x": 1620,
        "y": 240,
        "w": 20,
        "h": 20,
        "id": "core-32",
        "label": "28"
      },
      {
        "x": 1680,
        "y": 240,
        "w": 20,
        "h": 20,
        "id": "core-33",
        "label": "28"
      },
      {
        "x": 1760,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-34",
        "label": "28"
      },
      {
        "x": 1840,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-35",
        "label": "28"
      },
      {
        "x": 1800,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-36",
        "label": "28"
      },
      {
        "x": 1880,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-37",
        "label": "28"
      },
      {
        "x": 1920,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-38",
        "label": "28"
      },
      {
        "x": 1960,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-39",
        "label": "28"
      },
      {
        "x": 2000,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-40",
        "label": "28"
      },
      {
        "x": 2040,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-41",
        "label": "28"
      },
      {
        "x": 2080,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-42",
        "label": "28"
      },
      {
        "x": 2120,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-43",
        "label": "28"
      },
      {
        "x": 2160,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-44",
        "label": "28"
      },
      {
        "x": 1800,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-45",
        "label": "28"
      },
      {
        "x": 1840,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-46",
        "label": "28"
      },
      {
        "x": 1880,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-47",
        "label": "28"
      },
      {
        "x": 2100,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-48",
        "label": "28"
      },
      {
        "x": 2020,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-49",
        "label": "28"
      },
      {
        "x": 2060,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-50",
        "label": "28"
      },
      {
        "x": 2220,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-51",
        "label": "28"
      },
      {
        "x": 2260,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-52",
        "label": "28"
      },
      {
        "x": 1820,
        "y": 400,
        "w": 20,
        "h": 20,
        "id": "core-53",
        "label": "28"
      },
      {
        "x": 1900,
        "y": 400,
        "w": 20,
        "h": 20,
        "id": "core-54",
        "label": "28"
      },
      {
        "x": 1980,
        "y": 400,
        "w": 20,
        "h": 20,
        "id": "core-55",
        "label": "28"
      },
      {
        "x": 2060,
        "y": 400,
        "w": 20,
        "h": 20,
        "id": "core-56",
        "label": "28"
      },
      {
        "x": 2140,
        "y": 400,
        "w": 20,
        "h": 20,
        "id": "core-57",
        "label": "28"
      },
      {
        "x": 2200,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-58",
        "label": "28"
      },
      {
        "x": 2240,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-59",
        "label": "28"
      },
      {
        "x": 2220,
        "y": 400,
        "w": 20,
        "h": 20,
        "id": "core-60",
        "label": "28"
      },
      {
        "x": 2280,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-61",
        "label": "28"
      },
      {
        "x": 2320,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-62",
        "label": "28"
      },
      {
        "x": 2360,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-63",
        "label": "28"
      },
      {
        "x": 2300,
        "y": 400,
        "w": 20,
        "h": 20,
        "id": "core-64",
        "label": "28"
      },
      {
        "x": 1100,
        "y": 60,
        "w": 20,
        "h": 20,
        "id": "core-65",
        "label": "7"
      },
      {
        "x": 1140,
        "y": 60,
        "w": 20,
        "h": 20,
        "id": "core-66",
        "label": "7"
      },
      {
        "x": 900,
        "y": 340,
        "w": 20,
        "h": 20,
        "id": "core-67",
        "label": "7"
      },
      {
        "x": 860,
        "y": 340,
        "w": 20,
        "h": 20,
        "id": "core-68",
        "label": "7"
      },
      {
        "x": 880,
        "y": 300,
        "w": 20,
        "h": 20,
        "id": "core-69",
        "label": "7"
      }
    ],
    "hazards": [
      {
        "x": 1100,
        "y": 140,
        "w": 60,
        "h": 20,
        "id": "hazard-1"
      }
    ],
    "crates": [
      {
        "x": 560,
        "y": 460,
        "w": 40,
        "h": 40,
        "id": "crate-1"
      }
    ],
    "score": {
      "lives": 3,
      "coreScore": 100,
      "deathPenalty": 500,
      "timeBonusTargetSeconds": 45,
      "timeBonusPerSecond": 100
    },
    "hint": "Ride the garden route, bank core arcs, and use the crate plate to quiet the beams."
} satisfies Level;
