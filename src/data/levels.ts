import type { Level } from "../game/types";
import { markAnchoredMotionModel } from "./motionModel";

const sourceLevels: Level[] = [
  {
    "id": "springtide-sprint",
    "index": 0,
    "name": "Springtide Sprint",
    "subtitle": "A high-speed line through the reclaimed garden",
    "motionModel": "anchored",
    "soundtrackKey": "level-1",
    "backgroundKey": "level-1-springtide-garden-fit",
    "backgroundAmbience": {
      "preset": "none",
      "intensity": 0,
      "color": "#43f7ff",
      "drift": 0,
      "flicker": 0,
      "particles": 0
    },
    "start": {
      "x": 20,
      "y": 460
    },
    "exit": {
      "x": 3266,
      "y": 178,
      "w": 48,
      "h": 62
    },
    "bounds": {
      "x": 0,
      "y": -500,
      "w": 4800,
      "h": 1440
    },
    "solids": [
      {
        "x": 300,
        "y": 260,
        "w": 220,
        "h": 40,
        "id": "solid-6",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 580,
        "y": 300,
        "w": 140,
        "h": 220,
        "id": "solid-7",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 720,
        "y": 340,
        "w": 100,
        "h": 180,
        "id": "solid-8",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 820,
        "y": 380,
        "w": 140,
        "h": 140,
        "id": "solid-9",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 960,
        "y": 340,
        "w": 60,
        "h": 180,
        "id": "solid-10",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 1020,
        "y": 480,
        "w": 1680,
        "h": 460,
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
        "h": 40,
        "id": "floorpiece-13",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 2200,
        "y": 180,
        "w": 180,
        "h": 40,
        "id": "floorpiece-14",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 1160,
        "y": 140,
        "w": 400,
        "h": 40,
        "id": "solid-15",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
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
        "x": 0,
        "y": 500,
        "w": 1020,
        "h": 440,
        "id": "solid-22",
        "sprite": "floor",
        "material": "grass-organic"
      },
      {
        "x": 2440,
        "y": 380,
        "w": 200,
        "h": 100,
        "id": "solid-23",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 2680,
        "y": 320,
        "w": 200,
        "h": 200,
        "id": "solid-24",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 2920,
        "y": 260,
        "w": 200,
        "h": 220,
        "id": "solid-26",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 2860,
        "y": 480,
        "w": 260,
        "h": 460,
        "id": "floorpiece-19",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic"
      },
      {
        "x": 2740,
        "y": 480,
        "w": 80,
        "h": 460,
        "id": "solid-20",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic"
      },
      {
        "x": 3120,
        "y": 440,
        "w": 480,
        "h": 500,
        "id": "solid-21",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic"
      },
      {
        "x": 3640,
        "y": 440,
        "w": 440,
        "h": 500,
        "id": "solid-25",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic"
      },
      {
        "x": 3740,
        "y": 360,
        "w": 200,
        "h": 80,
        "id": "solid-27",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 3940,
        "y": 320,
        "w": 120,
        "h": 120,
        "id": "solid-28",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 3660,
        "y": 260,
        "w": 240,
        "h": 180,
        "id": "solid-29",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic",
        "collision": "top-only"
      },
      {
        "x": 4640,
        "y": 420,
        "w": 160,
        "h": 520,
        "id": "floorpiece-26",
        "tone": "steel",
        "sprite": "floor",
        "material": "grass-organic"
      },
      {
        "x": 3220,
        "y": 260,
        "w": 20,
        "h": 180,
        "id": "floorpiece-25",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "decorative",
        "decorDensity": "off"
      },
      {
        "x": 3440,
        "y": 260,
        "w": 20,
        "h": 180,
        "id": "solid-30",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "decorative",
        "decorDensity": "off"
      },
      {
        "x": 3220,
        "y": 260,
        "w": 440,
        "h": 20,
        "id": "solid-31",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "solid",
        "decorDensity": "off"
      },
      {
        "x": 3220,
        "y": 120,
        "w": 20,
        "h": 160,
        "id": "solid-32",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "solid",
        "decorDensity": "off"
      },
      {
        "x": 3220,
        "y": 120,
        "w": 260,
        "h": 20,
        "id": "solid-33",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "solid",
        "decorDensity": "off"
      },
      {
        "x": 3240,
        "y": 120,
        "w": 220,
        "h": 140,
        "id": "solid-34",
        "tone": "steel",
        "sprite": "floor",
        "material": "glass-energy",
        "collision": "decorative",
        "decorDensity": "off"
      }
    ],
    "oneWays": [],
    "conveyors": [],
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
        "period": 240,
        "phase": 0
      },
      {
        "x": 1780,
        "y": 180,
        "w": 80,
        "h": 20,
        "id": "platform-4",
        "axis": "x",
        "distance": 80,
        "period": 180,
        "phase": 0
      },
      {
        "x": 2000,
        "y": 180,
        "w": 80,
        "h": 20,
        "id": "platform-5",
        "axis": "x",
        "distance": 80,
        "period": 180,
        "phase": 180
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
      },
      {
        "x": 4100,
        "y": 440,
        "w": 120,
        "h": 20,
        "id": "platform-7",
        "axis": "x",
        "distance": 140,
        "period": 252,
        "phase": 0
      },
      {
        "x": 4400,
        "y": 440,
        "w": 120,
        "h": 20,
        "id": "platform-8",
        "axis": "x",
        "distance": 120,
        "period": 216,
        "phase": 180
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
      },
      {
        "x": 2500,
        "y": 360,
        "w": 80,
        "h": 20,
        "id": "launch-pad-3",
        "powerY": 25
      },
      {
        "x": 2740,
        "y": 300,
        "w": 80,
        "h": 20,
        "id": "launch-pad-4",
        "powerY": 25
      },
      {
        "x": 2980,
        "y": 240,
        "w": 80,
        "h": 20,
        "id": "launch-pad-5",
        "powerY": 25
      },
      {
        "x": 3960,
        "y": 300,
        "w": 80,
        "h": 20,
        "id": "launch-pad-6",
        "powerY": 25
      }
    ],
    "drones": [],
    "plates": [
      {
        "x": 4680,
        "y": 400,
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
        "startsOn": true
      },
      {
        "x": 3460,
        "y": 140,
        "w": 20,
        "h": 120,
        "id": "laser-2",
        "disabledBy": [
          "plate-1"
        ],
        "startsOn": true
      }
    ],
    "movingLasers": [],
    "cores": [
      {
        "x": 240,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-7",
        "label": "7"
      },
      {
        "x": 200,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-15",
        "label": "9"
      },
      {
        "x": 280,
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
        "x": 400,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-16",
        "label": "7"
      },
      {
        "x": 360,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-18",
        "label": "7"
      },
      {
        "x": 480,
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
        "x": 1520,
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
        "x": 1480,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-25",
        "label": "7"
      },
      {
        "x": 1340,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-26",
        "label": "7"
      },
      {
        "x": 1380,
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
        "x": 1860,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-35",
        "label": "28"
      },
      {
        "x": 1900,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-37",
        "label": "28"
      },
      {
        "x": 2340,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-38",
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
        "x": 1780,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-45",
        "label": "28"
      },
      {
        "x": 1820,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-46",
        "label": "28"
      },
      {
        "x": 1860,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-47",
        "label": "28"
      },
      {
        "x": 2120,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-48",
        "label": "28"
      },
      {
        "x": 2040,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-49",
        "label": "28"
      },
      {
        "x": 2080,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-50",
        "label": "28"
      },
      {
        "x": 2220,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-51",
        "label": "28"
      },
      {
        "x": 2260,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-52",
        "label": "28"
      },
      {
        "x": 2000,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-53",
        "label": "28"
      },
      {
        "x": 2300,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-54",
        "label": "28"
      },
      {
        "x": 1900,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-55",
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
      },
      {
        "x": 440,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-70",
        "label": "7"
      },
      {
        "x": 320,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-71",
        "label": "7"
      },
      {
        "x": 2520,
        "y": 180,
        "w": 20,
        "h": 20,
        "id": "core-56",
        "label": "28"
      },
      {
        "x": 2520,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-57",
        "label": "28"
      },
      {
        "x": 2520,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-58",
        "label": "28"
      },
      {
        "x": 2520,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-59",
        "label": "28"
      },
      {
        "x": 2760,
        "y": 60,
        "w": 20,
        "h": 20,
        "id": "core-60",
        "label": "28"
      },
      {
        "x": 2760,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-63",
        "label": "28"
      },
      {
        "x": 2760,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-64",
        "label": "28"
      },
      {
        "x": 2760,
        "y": 180,
        "w": 20,
        "h": 20,
        "id": "core-72",
        "label": "28"
      },
      {
        "x": 3000,
        "y": 120,
        "w": 20,
        "h": 20,
        "id": "core-73",
        "label": "28"
      },
      {
        "x": 3000,
        "y": 0,
        "w": 20,
        "h": 20,
        "id": "core-74",
        "label": "28"
      },
      {
        "x": 3000,
        "y": 40,
        "w": 20,
        "h": 20,
        "id": "core-75",
        "label": "28"
      },
      {
        "x": 3000,
        "y": 80,
        "w": 20,
        "h": 20,
        "id": "core-76",
        "label": "28"
      },
      {
        "x": 2740,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-77",
        "label": "28"
      },
      {
        "x": 2800,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-78",
        "label": "28"
      },
      {
        "x": 3340,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-79",
        "label": "28"
      },
      {
        "x": 3220,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-80",
        "label": "28"
      },
      {
        "x": 3260,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-81",
        "label": "28"
      },
      {
        "x": 3380,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-82",
        "label": "28"
      },
      {
        "x": 3460,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-83",
        "label": "28"
      },
      {
        "x": 3500,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-84",
        "label": "28"
      },
      {
        "x": 3700,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-85",
        "label": "28"
      },
      {
        "x": 3740,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-86",
        "label": "28"
      },
      {
        "x": 3780,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-87",
        "label": "28"
      },
      {
        "x": 3820,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-88",
        "label": "28"
      },
      {
        "x": 3860,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-89",
        "label": "28"
      }
    ],
    "hazards": [
      {
        "x": 1100,
        "y": 140,
        "w": 60,
        "h": 20,
        "id": "hazard-1"
      },
      {
        "x": 2980,
        "y": 460,
        "w": 60,
        "h": 20,
        "id": "hazard-3"
      }
    ],
    "crates": [],
    "monsters": [
      {
        "x": 1780,
        "y": 450,
        "w": 36,
        "h": 30,
        "id": "monster-3",
        "kind": "storm-snail",
        "axis": "x",
        "distance": 200,
        "period": 400,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2200,
        "y": 450,
        "w": 36,
        "h": 30,
        "id": "monster-4",
        "kind": "storm-snail",
        "axis": "x",
        "distance": 200,
        "period": 444,
        "phase": 200,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 3160,
        "y": 410,
        "w": 36,
        "h": 30,
        "id": "monster-5",
        "kind": "gutter-skimmer",
        "axis": "x",
        "distance": 200,
        "period": 200,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 540,
        "y": 470,
        "w": 36,
        "h": 30,
        "id": "monster-6",
        "kind": "sprout-hopper",
        "axis": "x",
        "distance": 200,
        "period": 180,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 340,
        "y": 230,
        "w": 36,
        "h": 30,
        "id": "monster-7",
        "kind": "glasswing-wisp",
        "axis": "x",
        "distance": 120,
        "period": 199,
        "phase": 0.3,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 1220,
        "y": 110,
        "w": 36,
        "h": 30,
        "id": "monster-8",
        "kind": "glasswing-wisp",
        "axis": "x",
        "distance": 260,
        "period": 430,
        "phase": 0.3,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 3680,
        "y": 410,
        "w": 36,
        "h": 30,
        "id": "monster-9",
        "kind": "storm-snail",
        "axis": "x",
        "distance": 320,
        "period": 708,
        "phase": 200,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2220,
        "y": 150,
        "w": 36,
        "h": 30,
        "id": "monster-10",
        "kind": "glasswing-wisp",
        "axis": "x",
        "distance": 100,
        "period": 166,
        "phase": 0.3,
        "score": 200,
        "vulnerableFrom": "both"
      }
    ],
    "bosses": [],
    "score": {
      "lives": 3,
      "coreScore": 100,
      "timeBonusTargetSeconds": 900,
      "timeBonusPerSecond": 1
    },
    "hint": "Ride the garden route, bank core arcs, and use the plate to quiet the beam"
  },
  {
    "id": "rainhouse-relay",
    "index": 1,
    "name": "Rainhouse Relay",
    "subtitle": "Hold the door while the storm moves on",
    "motionModel": "anchored",
    "backgroundKey": "level-2-rainhouse-relay-fit",
    "start": {
      "x": 20,
      "y": 320
    },
    "exit": {
      "x": 6240,
      "y": 358,
      "w": 48,
      "h": 62
    },
    "bounds": {
      "x": 0,
      "y": -900,
      "w": 6800,
      "h": 1440
    },
    "solids": [
      {
        "x": 0,
        "y": 360,
        "w": 420,
        "h": 180,
        "id": "floorpiece-3",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 420,
        "y": 340,
        "w": 100,
        "h": 200,
        "id": "floorpiece-4",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 620,
        "y": 340,
        "w": 180,
        "h": 200,
        "id": "solid-5",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 520,
        "y": 500,
        "w": 100,
        "h": 40,
        "id": "solid-6",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 640,
        "y": 200,
        "w": 300,
        "h": 20,
        "id": "solid-8",
        "tone": "steel",
        "sprite": "warning",
        "collision": "top-only"
      },
      {
        "x": 5720,
        "y": 440,
        "w": 580,
        "h": 40,
        "id": "solid-13",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 1400,
        "y": 100,
        "w": 20,
        "h": 440,
        "id": "wall-16",
        "tone": "dark",
        "sprite": "wall",
        "material": "copper-corrode"
      },
      {
        "x": 1320,
        "y": 100,
        "w": 80,
        "h": 40,
        "id": "floorpiece-15",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "top-only"
      },
      {
        "x": 1420,
        "y": 100,
        "w": 100,
        "h": 440,
        "id": "solid-14",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "solid"
      },
      {
        "x": 5640,
        "y": -20,
        "w": 340,
        "h": 60,
        "id": "floorpiece-13",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 6040,
        "y": -20,
        "w": 340,
        "h": 60,
        "id": "solid-15",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 1520,
        "y": -720,
        "w": 20,
        "h": 1260,
        "id": "solid-17",
        "tone": "dark",
        "sprite": "wall",
        "material": "copper-corrode"
      },
      {
        "x": 1140,
        "y": -900,
        "w": 20,
        "h": 840,
        "id": "solid-18",
        "tone": "dark",
        "sprite": "wall",
        "material": "copper-corrode"
      },
      {
        "x": 1540,
        "y": -720,
        "w": 140,
        "h": 1260,
        "id": "solid-16",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "solid"
      },
      {
        "x": 1780,
        "y": -900,
        "w": 140,
        "h": 200,
        "id": "solid-19",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "solid"
      },
      {
        "x": 1680,
        "y": -560,
        "w": 100,
        "h": 60,
        "id": "solid-20",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "solid"
      },
      {
        "x": 1680,
        "y": -340,
        "w": 400,
        "h": 880,
        "id": "solid-22",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "solid"
      },
      {
        "x": 1880,
        "y": -700,
        "w": 40,
        "h": 200,
        "id": "solid-21",
        "tone": "dark",
        "sprite": "wall",
        "material": "copper-corrode"
      },
      {
        "x": 2080,
        "y": -320,
        "w": 60,
        "h": 860,
        "id": "solid-23",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "solid",
        "decorDensity": "off"
      },
      {
        "x": 2140,
        "y": -340,
        "w": 400,
        "h": 880,
        "id": "solid-24",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "solid"
      },
      {
        "x": 2560,
        "y": -740,
        "w": 300,
        "h": 20,
        "id": "solid-25",
        "tone": "steel",
        "sprite": "warning",
        "collision": "top-only"
      },
      {
        "x": 2940,
        "y": -740,
        "w": 300,
        "h": 20,
        "id": "solid-26",
        "tone": "steel",
        "sprite": "warning",
        "collision": "top-only"
      },
      {
        "x": 2540,
        "y": -300,
        "w": 320,
        "h": 840,
        "id": "solid-27",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "top-only"
      },
      {
        "x": 2940,
        "y": -300,
        "w": 320,
        "h": 840,
        "id": "solid-28",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode",
        "collision": "top-only"
      },
      {
        "x": 3260,
        "y": -580,
        "w": 320,
        "h": 1120,
        "id": "solid-29",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 3580,
        "y": -540,
        "w": 100,
        "h": 60,
        "id": "solid-30",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 3680,
        "y": -400,
        "w": 100,
        "h": 60,
        "id": "solid-31",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 3580,
        "y": -260,
        "w": 100,
        "h": 60,
        "id": "solid-32",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 3580,
        "y": -80,
        "w": 360,
        "h": 620,
        "id": "solid-33",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 3780,
        "y": -900,
        "w": 20,
        "h": 700,
        "id": "solid-34",
        "tone": "dark",
        "sprite": "wall",
        "material": "copper-corrode"
      },
      {
        "x": 3940,
        "y": -60,
        "w": 400,
        "h": 600,
        "id": "solid-35",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 4340,
        "y": -80,
        "w": 440,
        "h": 620,
        "id": "solid-36",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 3960,
        "y": -100,
        "w": 60,
        "h": 20,
        "id": "block-34",
        "tone": "glass",
        "sprite": "block"
      },
      {
        "x": 4060,
        "y": -100,
        "w": 60,
        "h": 20,
        "id": "solid-37",
        "tone": "glass",
        "sprite": "block"
      },
      {
        "x": 4160,
        "y": -100,
        "w": 60,
        "h": 20,
        "id": "solid-38",
        "tone": "glass",
        "sprite": "block"
      },
      {
        "x": 4260,
        "y": -100,
        "w": 60,
        "h": 20,
        "id": "solid-39",
        "tone": "glass",
        "sprite": "block"
      },
      {
        "x": 4780,
        "y": -60,
        "w": 60,
        "h": 600,
        "id": "solid-40",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 4840,
        "y": -80,
        "w": 60,
        "h": 620,
        "id": "solid-41",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 4960,
        "y": -80,
        "w": 180,
        "h": 620,
        "id": "solid-42",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 4900,
        "y": -60,
        "w": 60,
        "h": 600,
        "id": "solid-43",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 5140,
        "y": -60,
        "w": 140,
        "h": 600,
        "id": "solid-44",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 5360,
        "y": -20,
        "w": 280,
        "h": 560,
        "id": "solid-45",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 5280,
        "y": -40,
        "w": 80,
        "h": 580,
        "id": "solid-46",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 6380,
        "y": -900,
        "w": 420,
        "h": 1440,
        "id": "solid-47",
        "tone": "steel",
        "sprite": "floor",
        "material": "copper-corrode"
      },
      {
        "x": 5640,
        "y": -20,
        "w": 740,
        "h": 560,
        "id": "wall-46",
        "tone": "dark",
        "sprite": "wall",
        "material": "metal-lab",
        "collision": "decorative"
      }
    ],
    "oneWays": [],
    "platforms": [
      {
        "x": 560,
        "y": 380,
        "w": 20,
        "h": 20,
        "id": "platform-1",
        "axis": "y",
        "distance": 80,
        "period": 180,
        "phase": 0
      },
      {
        "x": 580,
        "y": 200,
        "w": 60,
        "h": 20,
        "id": "platform-2",
        "axis": "y",
        "distance": 80,
        "period": 180,
        "phase": 0
      },
      {
        "x": 980,
        "y": 160,
        "w": 100,
        "h": 20,
        "id": "platform-3",
        "axis": "x",
        "distance": 240,
        "period": 320,
        "phase": 0
      },
      {
        "x": 1360,
        "y": -720,
        "w": 120,
        "h": 20,
        "id": "platform-4",
        "axis": "y",
        "distance": 160,
        "period": 196,
        "phase": 0
      },
      {
        "x": 1200,
        "y": -540,
        "w": 120,
        "h": 20,
        "id": "platform-5",
        "axis": "y",
        "distance": 160,
        "period": 288,
        "phase": 0
      },
      {
        "x": 1360,
        "y": -360,
        "w": 120,
        "h": 20,
        "id": "platform-6",
        "axis": "y",
        "distance": 160,
        "period": 196,
        "phase": 0
      },
      {
        "x": 1200,
        "y": -180,
        "w": 120,
        "h": 20,
        "id": "platform-7",
        "axis": "y",
        "distance": 160,
        "period": 288,
        "phase": 0
      },
      {
        "x": 2240,
        "y": -580,
        "w": 120,
        "h": 20,
        "id": "platform-8",
        "axis": "y",
        "distance": 160,
        "period": 287,
        "phase": 0
      },
      {
        "x": 2400,
        "y": -740,
        "w": 120,
        "h": 20,
        "id": "platform-9",
        "axis": "y",
        "distance": 160,
        "period": 196,
        "phase": 0
      }
    ],
    "launchPads": [
      {
        "x": 1380,
        "y": 80,
        "w": 80,
        "h": 20,
        "id": "launch-pad-1",
        "powerY": 26
      },
      {
        "x": 3360,
        "y": -600,
        "w": 80,
        "h": 20,
        "id": "launch-pad-2",
        "powerY": 24
      }
    ],
    "drones": [
      {
        "x": 2880,
        "y": -420,
        "w": 40,
        "h": 20,
        "id": "drone-1",
        "axis": "y",
        "distance": 140,
        "period": 233,
        "phase": 0
      }
    ],
    "plates": [
      {
        "x": 1580,
        "y": -740,
        "w": 80,
        "h": 20,
        "id": "plate-1"
      }
    ],
    "timedSwitches": [
      {
        "x": 3840,
        "y": -100,
        "w": 80,
        "h": 20,
        "id": "timed-switch-1",
        "duration": 300
      }
    ],
    "echoSensors": [],
    "doors": [
      {
        "x": 1680,
        "y": -720,
        "w": 100,
        "h": 20,
        "id": "door-1",
        "opensWith": [
          "plate-1"
        ],
        "orientation": "horizontal"
      }
    ],
    "lasers": [
      {
        "x": 800,
        "y": 380,
        "w": 120,
        "h": 20,
        "id": "laser-1",
        "startsOn": true
      },
      {
        "x": 920,
        "y": 380,
        "w": 120,
        "h": 20,
        "id": "laser-2",
        "startsOn": true
      },
      {
        "x": 1040,
        "y": 380,
        "w": 120,
        "h": 20,
        "id": "laser-3",
        "startsOn": true
      },
      {
        "x": 2860,
        "y": -280,
        "w": 80,
        "h": 20,
        "id": "laser-4",
        "startsOn": true
      },
      {
        "x": 3940,
        "y": -80,
        "w": 140,
        "h": 20,
        "id": "laser-5",
        "disabledBy": [
          "timed-switch-1"
        ],
        "startsOn": true
      },
      {
        "x": 4080,
        "y": -80,
        "w": 120,
        "h": 20,
        "id": "laser-6",
        "disabledBy": [
          "timed-switch-1"
        ],
        "startsOn": true
      },
      {
        "x": 4200,
        "y": -80,
        "w": 140,
        "h": 20,
        "id": "laser-7",
        "disabledBy": [
          "timed-switch-1"
        ],
        "startsOn": true
      },
      {
        "x": 1160,
        "y": 380,
        "w": 120,
        "h": 20,
        "id": "laser-8",
        "startsOn": true
      },
      {
        "x": 1280,
        "y": 380,
        "w": 120,
        "h": 20,
        "id": "laser-9",
        "startsOn": true
      }
    ],
    "movingLasers": [
      {
        "x": 1680,
        "y": -700,
        "w": 20,
        "h": 140,
        "id": "moving-laser-1",
        "axis": "x",
        "distance": 180,
        "period": 324,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 3580,
        "y": -480,
        "w": 20,
        "h": 140,
        "id": "moving-laser-2",
        "axis": "x",
        "distance": 80,
        "period": 128,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 3680,
        "y": -340,
        "w": 20,
        "h": 140,
        "id": "moving-laser-3",
        "axis": "x",
        "distance": 80,
        "period": 113,
        "phase": 0,
        "startsOn": true
      }
    ],
    "cores": [
      {
        "x": 220,
        "y": 320,
        "w": 20,
        "h": 20,
        "id": "core-2",
        "label": "1"
      },
      {
        "x": 260,
        "y": 320,
        "w": 20,
        "h": 20,
        "id": "core-3",
        "label": "1"
      },
      {
        "x": 340,
        "y": 320,
        "w": 20,
        "h": 20,
        "id": "core-4",
        "label": "1"
      },
      {
        "x": 300,
        "y": 320,
        "w": 20,
        "h": 20,
        "id": "core-5",
        "label": "1"
      },
      {
        "x": 380,
        "y": 320,
        "w": 20,
        "h": 20,
        "id": "core-6",
        "label": "1"
      },
      {
        "x": 600,
        "y": 280,
        "w": 20,
        "h": 20,
        "id": "core-7",
        "label": "1"
      },
      {
        "x": 560,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-8",
        "label": "1"
      },
      {
        "x": 520,
        "y": 280,
        "w": 20,
        "h": 20,
        "id": "core-9",
        "label": "1"
      },
      {
        "x": 660,
        "y": 160,
        "w": 20,
        "h": 20,
        "id": "core-10",
        "label": "1"
      },
      {
        "x": 720,
        "y": 160,
        "w": 20,
        "h": 20,
        "id": "core-11",
        "label": "1"
      },
      {
        "x": 780,
        "y": 160,
        "w": 20,
        "h": 20,
        "id": "core-12",
        "label": "1"
      },
      {
        "x": 840,
        "y": 160,
        "w": 20,
        "h": 20,
        "id": "core-13",
        "label": "1"
      },
      {
        "x": 900,
        "y": 160,
        "w": 20,
        "h": 20,
        "id": "core-14",
        "label": "1"
      },
      {
        "x": 6000,
        "y": 140,
        "w": 20,
        "h": 20,
        "id": "core-15",
        "label": "15"
      },
      {
        "x": 6000,
        "y": -20,
        "w": 20,
        "h": 20,
        "id": "core-16",
        "label": "15"
      },
      {
        "x": 6000,
        "y": 20,
        "w": 20,
        "h": 20,
        "id": "core-17",
        "label": "15"
      },
      {
        "x": 6000,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-18",
        "label": "15"
      },
      {
        "x": 6000,
        "y": 60,
        "w": 20,
        "h": 20,
        "id": "core-19",
        "label": "15"
      },
      {
        "x": 1400,
        "y": -100,
        "w": 20,
        "h": 20,
        "id": "core-20",
        "label": "1"
      },
      {
        "x": 1400,
        "y": -140,
        "w": 20,
        "h": 20,
        "id": "core-21",
        "label": "1"
      },
      {
        "x": 1240,
        "y": -140,
        "w": 20,
        "h": 20,
        "id": "core-22",
        "label": "1"
      },
      {
        "x": 1240,
        "y": -100,
        "w": 20,
        "h": 20,
        "id": "core-23",
        "label": "1"
      },
      {
        "x": 1420,
        "y": -320,
        "w": 20,
        "h": 20,
        "id": "core-24",
        "label": "1"
      },
      {
        "x": 1420,
        "y": -280,
        "w": 20,
        "h": 20,
        "id": "core-25",
        "label": "1"
      },
      {
        "x": 1240,
        "y": -500,
        "w": 20,
        "h": 20,
        "id": "core-26",
        "label": "1"
      },
      {
        "x": 1240,
        "y": -460,
        "w": 20,
        "h": 20,
        "id": "core-27",
        "label": "1"
      },
      {
        "x": 1420,
        "y": -680,
        "w": 20,
        "h": 20,
        "id": "core-28",
        "label": "1"
      },
      {
        "x": 1420,
        "y": -640,
        "w": 20,
        "h": 20,
        "id": "core-29",
        "label": "1"
      },
      {
        "x": 1540,
        "y": -760,
        "w": 20,
        "h": 20,
        "id": "core-30",
        "label": "1"
      },
      {
        "x": 1660,
        "y": -760,
        "w": 20,
        "h": 20,
        "id": "core-33",
        "label": "1"
      },
      {
        "x": 1820,
        "y": -480,
        "w": 20,
        "h": 20,
        "id": "core-31",
        "label": "1"
      },
      {
        "x": 1820,
        "y": -440,
        "w": 20,
        "h": 20,
        "id": "core-32",
        "label": "1"
      },
      {
        "x": 1820,
        "y": -520,
        "w": 20,
        "h": 20,
        "id": "core-34",
        "label": "1"
      },
      {
        "x": 1920,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-35",
        "label": "1"
      },
      {
        "x": 1960,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-36",
        "label": "1"
      },
      {
        "x": 2000,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-37",
        "label": "1"
      },
      {
        "x": 2040,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-38",
        "label": "1"
      },
      {
        "x": 2100,
        "y": -420,
        "w": 20,
        "h": 20,
        "id": "core-39",
        "label": "1"
      },
      {
        "x": 2160,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-40",
        "label": "1"
      },
      {
        "x": 2200,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-41",
        "label": "1"
      },
      {
        "x": 2240,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-42",
        "label": "1"
      },
      {
        "x": 2400,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-46",
        "label": "1"
      },
      {
        "x": 2440,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-47",
        "label": "1"
      },
      {
        "x": 2480,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-48",
        "label": "1"
      },
      {
        "x": 3000,
        "y": -340,
        "w": 20,
        "h": 20,
        "id": "core-53",
        "label": "1"
      },
      {
        "x": 3040,
        "y": -340,
        "w": 20,
        "h": 20,
        "id": "core-49",
        "label": "1"
      },
      {
        "x": 3080,
        "y": -340,
        "w": 20,
        "h": 20,
        "id": "core-50",
        "label": "1"
      },
      {
        "x": 3120,
        "y": -340,
        "w": 20,
        "h": 20,
        "id": "core-52",
        "label": "1"
      },
      {
        "x": 3160,
        "y": -340,
        "w": 20,
        "h": 20,
        "id": "core-54",
        "label": "1"
      },
      {
        "x": 3160,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-57",
        "label": "1"
      },
      {
        "x": 3120,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-58",
        "label": "1"
      },
      {
        "x": 3080,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-59",
        "label": "1"
      },
      {
        "x": 3040,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-60",
        "label": "1"
      },
      {
        "x": 3000,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-61",
        "label": "1"
      },
      {
        "x": 2300,
        "y": -660,
        "w": 20,
        "h": 20,
        "id": "core-62",
        "label": "1"
      },
      {
        "x": 3360,
        "y": -720,
        "w": 20,
        "h": 20,
        "id": "core-63",
        "label": "1"
      },
      {
        "x": 3400,
        "y": -720,
        "w": 20,
        "h": 20,
        "id": "core-64",
        "label": "1"
      },
      {
        "x": 3400,
        "y": -760,
        "w": 20,
        "h": 20,
        "id": "core-65",
        "label": "1"
      },
      {
        "x": 3360,
        "y": -760,
        "w": 20,
        "h": 20,
        "id": "core-66",
        "label": "1"
      },
      {
        "x": 3400,
        "y": -800,
        "w": 20,
        "h": 20,
        "id": "core-67",
        "label": "1"
      },
      {
        "x": 3360,
        "y": -800,
        "w": 20,
        "h": 20,
        "id": "core-68",
        "label": "1"
      },
      {
        "x": 4860,
        "y": -120,
        "w": 20,
        "h": 20,
        "id": "core-69",
        "label": "69"
      },
      {
        "x": 5000,
        "y": -120,
        "w": 20,
        "h": 20,
        "id": "core-70",
        "label": "69"
      },
      {
        "x": 5040,
        "y": -120,
        "w": 20,
        "h": 20,
        "id": "core-71",
        "label": "69"
      },
      {
        "x": 5080,
        "y": -120,
        "w": 20,
        "h": 20,
        "id": "core-72",
        "label": "69"
      },
      {
        "x": 5060,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-73",
        "label": "69"
      },
      {
        "x": 5020,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-74",
        "label": "69"
      },
      {
        "x": 4860,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-75",
        "label": "69"
      },
      {
        "x": 4560,
        "y": -120,
        "w": 20,
        "h": 20,
        "id": "core-76",
        "label": "69"
      },
      {
        "x": 4600,
        "y": -120,
        "w": 20,
        "h": 20,
        "id": "core-77",
        "label": "69"
      },
      {
        "x": 4640,
        "y": -120,
        "w": 20,
        "h": 20,
        "id": "core-78",
        "label": "69"
      },
      {
        "x": 4620,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-79",
        "label": "69"
      },
      {
        "x": 4580,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-80",
        "label": "69"
      },
      {
        "x": 4540,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-81",
        "label": "69"
      },
      {
        "x": 4520,
        "y": -120,
        "w": 20,
        "h": 20,
        "id": "core-82",
        "label": "69"
      },
      {
        "x": 4500,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-83",
        "label": "69"
      },
      {
        "x": 4480,
        "y": -120,
        "w": 20,
        "h": 20,
        "id": "core-84",
        "label": "69"
      },
      {
        "x": 3980,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-85",
        "label": "69"
      },
      {
        "x": 3980,
        "y": -200,
        "w": 20,
        "h": 20,
        "id": "core-86",
        "label": "69"
      },
      {
        "x": 3980,
        "y": -240,
        "w": 20,
        "h": 20,
        "id": "core-87",
        "label": "69"
      },
      {
        "x": 4080,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-88",
        "label": "69"
      },
      {
        "x": 4080,
        "y": -200,
        "w": 20,
        "h": 20,
        "id": "core-89",
        "label": "69"
      },
      {
        "x": 4080,
        "y": -240,
        "w": 20,
        "h": 20,
        "id": "core-90",
        "label": "69"
      },
      {
        "x": 4180,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-91",
        "label": "69"
      },
      {
        "x": 4180,
        "y": -200,
        "w": 20,
        "h": 20,
        "id": "core-92",
        "label": "69"
      },
      {
        "x": 4180,
        "y": -240,
        "w": 20,
        "h": 20,
        "id": "core-93",
        "label": "69"
      },
      {
        "x": 4280,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-94",
        "label": "69"
      },
      {
        "x": 4280,
        "y": -200,
        "w": 20,
        "h": 20,
        "id": "core-95",
        "label": "69"
      },
      {
        "x": 4280,
        "y": -240,
        "w": 20,
        "h": 20,
        "id": "core-96",
        "label": "69"
      },
      {
        "x": 2640,
        "y": -780,
        "w": 20,
        "h": 20,
        "id": "core-97",
        "label": "1"
      },
      {
        "x": 2680,
        "y": -780,
        "w": 20,
        "h": 20,
        "id": "core-98",
        "label": "1"
      },
      {
        "x": 2720,
        "y": -780,
        "w": 20,
        "h": 20,
        "id": "core-99",
        "label": "1"
      },
      {
        "x": 2760,
        "y": -780,
        "w": 20,
        "h": 20,
        "id": "core-100",
        "label": "1"
      },
      {
        "x": 3020,
        "y": -780,
        "w": 20,
        "h": 20,
        "id": "core-101",
        "label": "1"
      },
      {
        "x": 3060,
        "y": -780,
        "w": 20,
        "h": 20,
        "id": "core-102",
        "label": "1"
      },
      {
        "x": 3100,
        "y": -780,
        "w": 20,
        "h": 20,
        "id": "core-103",
        "label": "1"
      },
      {
        "x": 3140,
        "y": -780,
        "w": 20,
        "h": 20,
        "id": "core-104",
        "label": "1"
      },
      {
        "x": 2300,
        "y": -620,
        "w": 20,
        "h": 20,
        "id": "core-105",
        "label": "1"
      },
      {
        "x": 2300,
        "y": -580,
        "w": 20,
        "h": 20,
        "id": "core-106",
        "label": "1"
      },
      {
        "x": 2300,
        "y": -540,
        "w": 20,
        "h": 20,
        "id": "core-107",
        "label": "1"
      },
      {
        "x": 2460,
        "y": -700,
        "w": 20,
        "h": 20,
        "id": "core-108",
        "label": "1"
      },
      {
        "x": 2460,
        "y": -740,
        "w": 20,
        "h": 20,
        "id": "core-109",
        "label": "1"
      },
      {
        "x": 2460,
        "y": -780,
        "w": 20,
        "h": 20,
        "id": "core-110",
        "label": "1"
      },
      {
        "x": 2460,
        "y": -820,
        "w": 20,
        "h": 20,
        "id": "core-111",
        "label": "1"
      }
    ],
    "hazards": [
      {
        "x": 2080,
        "y": -340,
        "w": 60,
        "h": 20,
        "id": "hazard-2"
      },
      {
        "x": 4780,
        "y": -80,
        "w": 60,
        "h": 20,
        "id": "hazard-3"
      },
      {
        "x": 4900,
        "y": -80,
        "w": 60,
        "h": 20,
        "id": "hazard-4"
      }
    ],
    "monsters": [
      {
        "x": 2160,
        "y": -370,
        "w": 36,
        "h": 30,
        "id": "monster-1",
        "kind": "gear-tick",
        "axis": "x",
        "distance": 340,
        "period": 510,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 1920,
        "y": -370,
        "w": 36,
        "h": 30,
        "id": "monster-2",
        "kind": "copper-leech",
        "axis": "x",
        "distance": 100,
        "period": 150,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 200,
        "y": 330,
        "w": 36,
        "h": 30,
        "id": "monster-3",
        "kind": "gear-tick",
        "axis": "x",
        "distance": 160,
        "period": 240,
        "phase": 0,
        "score": 200
      },
      {
        "x": 700,
        "y": 170,
        "w": 36,
        "h": 30,
        "id": "monster-4",
        "kind": "gear-tick",
        "axis": "x",
        "distance": 160,
        "period": 240,
        "phase": 0,
        "score": 200
      },
      {
        "x": 2580,
        "y": -770,
        "w": 36,
        "h": 30,
        "id": "monster-5",
        "kind": "gear-tick",
        "axis": "x",
        "distance": 220,
        "period": 330,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2960,
        "y": -770,
        "w": 36,
        "h": 30,
        "id": "monster-6",
        "kind": "gear-tick",
        "axis": "x",
        "distance": 220,
        "period": 330,
        "phase": 175,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2580,
        "y": -340,
        "w": 36,
        "h": 40,
        "id": "monster-7",
        "kind": "copper-leech",
        "axis": "x",
        "distance": 220,
        "period": 330,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 4400,
        "y": -120,
        "w": 36,
        "h": 40,
        "id": "monster-8",
        "kind": "copper-leech",
        "axis": "x",
        "distance": 280,
        "period": 630,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      }
    ],
    "bosses": [
      {
        "x": 5560,
        "y": 40,
        "w": 900,
        "h": 420,
        "id": "boss-1",
        "kind": "storm-relay-warden",
        "entrySide": "top",
        "weakSpot": "bottom",
        "soundtrackKey": "boss",
        "introSeconds": 17,
        "health": 4,
        "score": 3000
      }
    ],
    "score": {
      "lives": 3,
      "coreScore": 100,
      "timeBonusTargetSeconds": 900,
      "timeBonusPerSecond": 1
    },
    "hint": "Leave an echo on the relay plate, then flow through the copper catwalks before the storm drains catch you"
  },
  {
    "id": "cryo-grove-circuit",
    "index": 2,
    "name": "Frostcap Echo Rush",
    "subtitle": "Hold the opener, ride the snowline, then dash into the Conservator chamber",
    "motionModel": "anchored",
    "soundtrackKey": "level-3",
    "backgroundKey": "level-3-cryo-grove-fit",
    "backgroundAmbience": {
      "preset": "lab",
      "intensity": 0.34,
      "color": "#8eeaff",
      "drift": 0.22,
      "flicker": 0.1,
      "particles": 0.18
    },
    "start": {
      "x": 20,
      "y": 460
    },
    "exit": {
      "x": 4120,
      "y": 818,
      "w": 48,
      "h": 62
    },
    "bounds": {
      "x": 0,
      "y": -500,
      "w": 4200,
      "h": 1440
    },
    "solids": [
      {
        "x": 0,
        "y": 500,
        "w": 460,
        "h": 440,
        "id": "start-snowfield",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo"
      },
      {
        "x": 3320,
        "y": 500,
        "w": 180,
        "h": 440,
        "id": "boss-drop-lip",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo"
      },
      {
        "x": 3500,
        "y": 900,
        "w": 680,
        "h": 40,
        "id": "conservator-arena-floor",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "decorDensity": "low"
      },
      {
        "x": 4180,
        "y": -500,
        "w": 20,
        "h": 1440,
        "id": "conservator-right-wall",
        "tone": "steel",
        "sprite": "wall",
        "material": "ice-cryo",
        "decorDensity": "off"
      },
      {
        "x": 1020,
        "y": 500,
        "w": 80,
        "h": 440,
        "id": "solid-6",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo"
      },
      {
        "x": 1100,
        "y": 460,
        "w": 80,
        "h": 480,
        "id": "solid-7",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo"
      },
      {
        "x": 1020,
        "y": 260,
        "w": 160,
        "h": 40,
        "id": "solid-8",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 600,
        "y": 220,
        "w": 420,
        "h": 80,
        "id": "solid-9",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo"
      },
      {
        "x": 100,
        "y": 220,
        "w": 420,
        "h": 80,
        "id": "solid-10",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo"
      },
      {
        "x": 480,
        "y": -320,
        "w": 40,
        "h": 420,
        "id": "solid-11",
        "tone": "steel",
        "sprite": "wall",
        "material": "ice-cryo"
      },
      {
        "x": 100,
        "y": -500,
        "w": 40,
        "h": 720,
        "id": "solid-12",
        "tone": "steel",
        "sprite": "wall",
        "material": "ice-cryo"
      },
      {
        "x": 320,
        "y": 60,
        "w": 160,
        "h": 40,
        "id": "solid-13",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 140,
        "y": -140,
        "w": 160,
        "h": 40,
        "id": "solid-14",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 320,
        "y": -360,
        "w": 200,
        "h": 40,
        "id": "solid-15",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 520,
        "y": -320,
        "w": 200,
        "h": 40,
        "id": "solid-16",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 780,
        "y": -300,
        "w": 200,
        "h": 40,
        "id": "solid-17",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 1040,
        "y": -280,
        "w": 320,
        "h": 40,
        "id": "solid-18",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 1320,
        "y": -240,
        "w": 40,
        "h": 1180,
        "id": "solid-19",
        "tone": "steel",
        "sprite": "wall",
        "material": "ice-cryo"
      },
      {
        "x": 1360,
        "y": -120,
        "w": 1060,
        "h": 1060,
        "id": "solid-20",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 1840,
        "y": 80,
        "w": 760,
        "h": 860,
        "id": "solid-21",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 1540,
        "y": 280,
        "w": 560,
        "h": 660,
        "id": "solid-22",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 1420,
        "y": 160,
        "w": 320,
        "h": 780,
        "id": "solid-23",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 1740,
        "y": 520,
        "w": 580,
        "h": 420,
        "id": "solid-24",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 2420,
        "y": 520,
        "w": 360,
        "h": 420,
        "id": "solid-25",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 2560,
        "y": 300,
        "w": 340,
        "h": 640,
        "id": "solid-26",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 2740,
        "y": 240,
        "w": 280,
        "h": 700,
        "id": "solid-27",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 2860,
        "y": 500,
        "w": 380,
        "h": 440,
        "id": "solid-28",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 2700,
        "y": 60,
        "w": 300,
        "h": 660,
        "id": "solid-29",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 2180,
        "y": 380,
        "w": 300,
        "h": 560,
        "id": "solid-30",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 3060,
        "y": 180,
        "w": 180,
        "h": 40,
        "id": "solid-32",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      },
      {
        "x": 3500,
        "y": 500,
        "w": 680,
        "h": 400,
        "id": "solid-33",
        "tone": "steel",
        "sprite": "wall",
        "material": "glass-energy",
        "collision": "decorative"
      },
      {
        "x": 1360,
        "y": 600,
        "w": 380,
        "h": 340,
        "id": "solid-34",
        "tone": "steel",
        "sprite": "floor",
        "material": "ice-cryo",
        "collision": "top-only"
      }
    ],
    "oneWays": [],
    "conveyors": [],
    "platforms": [
      {
        "x": 500,
        "y": 500,
        "w": 120,
        "h": 20,
        "id": "platform-1",
        "axis": "x",
        "distance": 100,
        "period": 180,
        "phase": 0
      },
      {
        "x": 760,
        "y": 500,
        "w": 120,
        "h": 20,
        "id": "platform-3",
        "axis": "x",
        "distance": 100,
        "period": 180,
        "phase": 180
      }
    ],
    "launchPads": [
      {
        "x": 1100,
        "y": 440,
        "w": 80,
        "h": 20,
        "id": "launch-pad-1",
        "powerY": 30
      },
      {
        "x": 140,
        "y": 200,
        "w": 80,
        "h": 20,
        "id": "launch-pad-2",
        "powerY": 30
      },
      {
        "x": 400,
        "y": 40,
        "w": 80,
        "h": 20,
        "id": "launch-pad-3",
        "powerY": 30
      },
      {
        "x": 140,
        "y": -160,
        "w": 80,
        "h": 20,
        "id": "launch-pad-4",
        "powerY": 30
      },
      {
        "x": 3120,
        "y": 160,
        "w": 80,
        "h": 20,
        "id": "launch-pad-5",
        "powerY": 30
      },
      {
        "x": 2920,
        "y": 480,
        "w": 80,
        "h": 20,
        "id": "launch-pad-6",
        "powerY": 30
      },
      {
        "x": 1980,
        "y": 500,
        "w": 80,
        "h": 20,
        "id": "launch-pad-7",
        "powerY": 30
      },
      {
        "x": 1880,
        "y": 60,
        "w": 80,
        "h": 20,
        "id": "launch-pad-8",
        "powerY": 30
      },
      {
        "x": 1080,
        "y": 240,
        "w": 80,
        "h": 20,
        "id": "launch-pad-9",
        "powerY": 30
      },
      {
        "x": 1540,
        "y": 140,
        "w": 80,
        "h": 20,
        "id": "launch-pad-10",
        "powerY": 30
      }
    ],
    "drones": [],
    "plates": [
      {
        "x": 680,
        "y": 200,
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
        "x": 500,
        "y": 100,
        "w": 20,
        "h": 120,
        "id": "laser-1",
        "disabledBy": [
          "plate-1"
        ],
        "startsOn": true
      }
    ],
    "movingLasers": [],
    "cores": [
      {
        "x": 100,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-start-01",
        "label": "3"
      },
      {
        "x": 140,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-start-02",
        "label": "3"
      },
      {
        "x": 180,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-start-03",
        "label": "3"
      },
      {
        "x": 220,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-start-04",
        "label": "3"
      },
      {
        "x": 300,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-start-05",
        "label": "3"
      },
      {
        "x": 340,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-start-06",
        "label": "3"
      },
      {
        "x": 380,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-start-07",
        "label": "3"
      },
      {
        "x": 420,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-start-08",
        "label": "3"
      },
      {
        "x": 3460,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-9",
        "label": "9"
      },
      {
        "x": 3500,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-10",
        "label": "9"
      },
      {
        "x": 3420,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-14",
        "label": "9"
      },
      {
        "x": 3380,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-15",
        "label": "9"
      },
      {
        "x": 3340,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-16",
        "label": "9"
      },
      {
        "x": 1080,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-17",
        "label": "3"
      },
      {
        "x": 1080,
        "y": 60,
        "w": 20,
        "h": 20,
        "id": "core-18",
        "label": "3"
      },
      {
        "x": 1120,
        "y": 60,
        "w": 20,
        "h": 20,
        "id": "core-19",
        "label": "3"
      },
      {
        "x": 1120,
        "y": 20,
        "w": 20,
        "h": 20,
        "id": "core-20",
        "label": "3"
      },
      {
        "x": 1080,
        "y": 20,
        "w": 20,
        "h": 20,
        "id": "core-21",
        "label": "3"
      },
      {
        "x": 1120,
        "y": 100,
        "w": 20,
        "h": 20,
        "id": "core-22",
        "label": "3"
      },
      {
        "x": 1080,
        "y": -20,
        "w": 20,
        "h": 20,
        "id": "core-23",
        "label": "3"
      },
      {
        "x": 1120,
        "y": -20,
        "w": 20,
        "h": 20,
        "id": "core-24",
        "label": "3"
      },
      {
        "x": 1100,
        "y": -320,
        "w": 20,
        "h": 20,
        "id": "core-25",
        "label": "3"
      },
      {
        "x": 1140,
        "y": -320,
        "w": 20,
        "h": 20,
        "id": "core-26",
        "label": "3"
      },
      {
        "x": 1180,
        "y": -320,
        "w": 20,
        "h": 20,
        "id": "core-27",
        "label": "3"
      },
      {
        "x": 1220,
        "y": -320,
        "w": 20,
        "h": 20,
        "id": "core-28",
        "label": "3"
      },
      {
        "x": 1260,
        "y": -320,
        "w": 20,
        "h": 20,
        "id": "core-29",
        "label": "3"
      },
      {
        "x": 920,
        "y": -340,
        "w": 20,
        "h": 20,
        "id": "core-30",
        "label": "3"
      },
      {
        "x": 880,
        "y": -340,
        "w": 20,
        "h": 20,
        "id": "core-31",
        "label": "3"
      },
      {
        "x": 840,
        "y": -340,
        "w": 20,
        "h": 20,
        "id": "core-32",
        "label": "3"
      },
      {
        "x": 640,
        "y": -360,
        "w": 20,
        "h": 20,
        "id": "core-33",
        "label": "3"
      },
      {
        "x": 600,
        "y": -360,
        "w": 20,
        "h": 20,
        "id": "core-34",
        "label": "3"
      },
      {
        "x": 560,
        "y": -360,
        "w": 20,
        "h": 20,
        "id": "core-35",
        "label": "3"
      },
      {
        "x": 1440,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-36",
        "label": "3"
      },
      {
        "x": 420,
        "y": -100,
        "w": 20,
        "h": 20,
        "id": "core-37",
        "label": "3"
      },
      {
        "x": 420,
        "y": -140,
        "w": 20,
        "h": 20,
        "id": "core-38",
        "label": "3"
      },
      {
        "x": 420,
        "y": -180,
        "w": 20,
        "h": 20,
        "id": "core-39",
        "label": "3"
      },
      {
        "x": 420,
        "y": -220,
        "w": 20,
        "h": 20,
        "id": "core-40",
        "label": "3"
      },
      {
        "x": 180,
        "y": -420,
        "w": 20,
        "h": 20,
        "id": "core-41",
        "label": "3"
      },
      {
        "x": 180,
        "y": -300,
        "w": 20,
        "h": 20,
        "id": "core-42",
        "label": "3"
      },
      {
        "x": 180,
        "y": -340,
        "w": 20,
        "h": 20,
        "id": "core-43",
        "label": "3"
      },
      {
        "x": 180,
        "y": -380,
        "w": 20,
        "h": 20,
        "id": "core-44",
        "label": "3"
      },
      {
        "x": 180,
        "y": 60,
        "w": 20,
        "h": 20,
        "id": "core-45",
        "label": "3"
      },
      {
        "x": 180,
        "y": 20,
        "w": 20,
        "h": 20,
        "id": "core-46",
        "label": "3"
      },
      {
        "x": 180,
        "y": -20,
        "w": 20,
        "h": 20,
        "id": "core-47",
        "label": "3"
      },
      {
        "x": 180,
        "y": -60,
        "w": 20,
        "h": 20,
        "id": "core-48",
        "label": "3"
      },
      {
        "x": 1480,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-49",
        "label": "3"
      },
      {
        "x": 1520,
        "y": -160,
        "w": 20,
        "h": 20,
        "id": "core-50",
        "label": "3"
      },
      {
        "x": 2500,
        "y": -100,
        "w": 20,
        "h": 20,
        "id": "core-51",
        "label": "3"
      },
      {
        "x": 2500,
        "y": -60,
        "w": 20,
        "h": 20,
        "id": "core-52",
        "label": "3"
      },
      {
        "x": 2500,
        "y": -20,
        "w": 20,
        "h": 20,
        "id": "core-53",
        "label": "3"
      },
      {
        "x": 2500,
        "y": 20,
        "w": 20,
        "h": 20,
        "id": "core-54",
        "label": "3"
      },
      {
        "x": 1900,
        "y": -80,
        "w": 20,
        "h": 20,
        "id": "core-55",
        "label": "3"
      },
      {
        "x": 1900,
        "y": -40,
        "w": 20,
        "h": 20,
        "id": "core-56",
        "label": "3"
      },
      {
        "x": 1940,
        "y": -40,
        "w": 20,
        "h": 20,
        "id": "core-57",
        "label": "3"
      },
      {
        "x": 1940,
        "y": -80,
        "w": 20,
        "h": 20,
        "id": "core-58",
        "label": "3"
      },
      {
        "x": 1560,
        "y": 40,
        "w": 20,
        "h": 20,
        "id": "core-59",
        "label": "3"
      },
      {
        "x": 1600,
        "y": 40,
        "w": 20,
        "h": 20,
        "id": "core-60",
        "label": "3"
      },
      {
        "x": 1600,
        "y": 0,
        "w": 20,
        "h": 20,
        "id": "core-61",
        "label": "3"
      },
      {
        "x": 1560,
        "y": 0,
        "w": 20,
        "h": 20,
        "id": "core-62",
        "label": "3"
      },
      {
        "x": 1580,
        "y": -40,
        "w": 20,
        "h": 20,
        "id": "core-63",
        "label": "3"
      },
      {
        "x": 1500,
        "y": 560,
        "w": 20,
        "h": 20,
        "id": "core-64",
        "label": "3"
      },
      {
        "x": 1460,
        "y": 560,
        "w": 20,
        "h": 20,
        "id": "core-65",
        "label": "3"
      },
      {
        "x": 1420,
        "y": 560,
        "w": 20,
        "h": 20,
        "id": "core-66",
        "label": "3"
      },
      {
        "x": 1380,
        "y": 560,
        "w": 20,
        "h": 20,
        "id": "core-67",
        "label": "3"
      },
      {
        "x": 1500,
        "y": 520,
        "w": 20,
        "h": 20,
        "id": "core-68",
        "label": "3"
      },
      {
        "x": 1460,
        "y": 520,
        "w": 20,
        "h": 20,
        "id": "core-69",
        "label": "3"
      },
      {
        "x": 1420,
        "y": 520,
        "w": 20,
        "h": 20,
        "id": "core-70",
        "label": "3"
      },
      {
        "x": 1380,
        "y": 520,
        "w": 20,
        "h": 20,
        "id": "core-71",
        "label": "3"
      },
      {
        "x": 1640,
        "y": 560,
        "w": 20,
        "h": 20,
        "id": "core-72",
        "label": "3"
      },
      {
        "x": 1680,
        "y": 560,
        "w": 20,
        "h": 20,
        "id": "core-73",
        "label": "3"
      },
      {
        "x": 1780,
        "y": 480,
        "w": 20,
        "h": 20,
        "id": "core-74",
        "label": "3"
      },
      {
        "x": 1820,
        "y": 480,
        "w": 20,
        "h": 20,
        "id": "core-75",
        "label": "3"
      },
      {
        "x": 1820,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-76",
        "label": "3"
      },
      {
        "x": 1860,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-77",
        "label": "3"
      },
      {
        "x": 1860,
        "y": 480,
        "w": 20,
        "h": 20,
        "id": "core-78",
        "label": "3"
      },
      {
        "x": 1900,
        "y": 440,
        "w": 20,
        "h": 20,
        "id": "core-79",
        "label": "3"
      },
      {
        "x": 1900,
        "y": 480,
        "w": 20,
        "h": 20,
        "id": "core-80",
        "label": "3"
      },
      {
        "x": 1940,
        "y": 480,
        "w": 20,
        "h": 20,
        "id": "core-81",
        "label": "3"
      },
      {
        "x": 2000,
        "y": 400,
        "w": 20,
        "h": 20,
        "id": "core-82",
        "label": "3"
      },
      {
        "x": 2040,
        "y": 400,
        "w": 20,
        "h": 20,
        "id": "core-83",
        "label": "3"
      },
      {
        "x": 2000,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-84",
        "label": "3"
      },
      {
        "x": 2040,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-85",
        "label": "3"
      },
      {
        "x": 2340,
        "y": 300,
        "w": 20,
        "h": 20,
        "id": "core-86",
        "label": "3"
      },
      {
        "x": 2300,
        "y": 300,
        "w": 20,
        "h": 20,
        "id": "core-87",
        "label": "3"
      },
      {
        "x": 2240,
        "y": 340,
        "w": 20,
        "h": 20,
        "id": "core-88",
        "label": "3"
      },
      {
        "x": 2200,
        "y": 340,
        "w": 20,
        "h": 20,
        "id": "core-89",
        "label": "3"
      },
      {
        "x": 2440,
        "y": 340,
        "w": 20,
        "h": 20,
        "id": "core-90",
        "label": "3"
      },
      {
        "x": 2400,
        "y": 340,
        "w": 20,
        "h": 20,
        "id": "core-91",
        "label": "3"
      },
      {
        "x": 2780,
        "y": 20,
        "w": 20,
        "h": 20,
        "id": "core-92",
        "label": "3"
      },
      {
        "x": 2820,
        "y": 20,
        "w": 20,
        "h": 20,
        "id": "core-93",
        "label": "3"
      },
      {
        "x": 2860,
        "y": 20,
        "w": 20,
        "h": 20,
        "id": "core-94",
        "label": "3"
      },
      {
        "x": 2900,
        "y": 20,
        "w": 20,
        "h": 20,
        "id": "core-95",
        "label": "3"
      },
      {
        "x": 2920,
        "y": 200,
        "w": 20,
        "h": 20,
        "id": "core-96",
        "label": "3"
      },
      {
        "x": 2880,
        "y": 200,
        "w": 20,
        "h": 20,
        "id": "core-97",
        "label": "3"
      },
      {
        "x": 2840,
        "y": 200,
        "w": 20,
        "h": 20,
        "id": "core-98",
        "label": "3"
      },
      {
        "x": 2800,
        "y": 200,
        "w": 20,
        "h": 20,
        "id": "core-99",
        "label": "3"
      },
      {
        "x": 3160,
        "y": 40,
        "w": 20,
        "h": 20,
        "id": "core-100",
        "label": "3"
      },
      {
        "x": 3120,
        "y": 40,
        "w": 20,
        "h": 20,
        "id": "core-101",
        "label": "3"
      },
      {
        "x": 3160,
        "y": 0,
        "w": 20,
        "h": 20,
        "id": "core-102",
        "label": "3"
      },
      {
        "x": 3120,
        "y": 0,
        "w": 20,
        "h": 20,
        "id": "core-103",
        "label": "3"
      },
      {
        "x": 3160,
        "y": -40,
        "w": 20,
        "h": 20,
        "id": "core-104",
        "label": "3"
      },
      {
        "x": 3120,
        "y": -40,
        "w": 20,
        "h": 20,
        "id": "core-105",
        "label": "3"
      },
      {
        "x": 2980,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-106",
        "label": "3"
      },
      {
        "x": 2980,
        "y": 320,
        "w": 20,
        "h": 20,
        "id": "core-107",
        "label": "3"
      },
      {
        "x": 2980,
        "y": 280,
        "w": 20,
        "h": 20,
        "id": "core-108",
        "label": "3"
      },
      {
        "x": 2940,
        "y": 280,
        "w": 20,
        "h": 20,
        "id": "core-109",
        "label": "3"
      },
      {
        "x": 2940,
        "y": 320,
        "w": 20,
        "h": 20,
        "id": "core-110",
        "label": "3"
      },
      {
        "x": 2940,
        "y": 360,
        "w": 20,
        "h": 20,
        "id": "core-111",
        "label": "3"
      },
      {
        "x": 3540,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-112",
        "label": "9"
      }
    ],
    "hazards": [],
    "crates": [],
    "monsters": [
      {
        "x": 840,
        "y": 190,
        "w": 36,
        "h": 30,
        "id": "monster-1",
        "kind": "frost-crawler",
        "axis": "x",
        "distance": 120,
        "period": 180,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 640,
        "y": 190,
        "w": 36,
        "h": 30,
        "id": "monster-2",
        "kind": "frost-crawler",
        "axis": "x",
        "distance": 118,
        "period": 221,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 560,
        "y": -350,
        "w": 36,
        "h": 30,
        "id": "monster-3",
        "kind": "frost-crawler",
        "axis": "x",
        "distance": 100,
        "period": 150,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 860,
        "y": -360,
        "w": 36,
        "h": 30,
        "id": "monster-4",
        "kind": "cryo-puffer",
        "axis": "y",
        "distance": 140,
        "period": 210,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 1080,
        "y": -310,
        "w": 36,
        "h": 30,
        "id": "monster-5",
        "kind": "frost-crawler",
        "axis": "x",
        "distance": 200,
        "period": 300,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 1780,
        "y": 0,
        "w": 36,
        "h": 30,
        "id": "monster-6",
        "kind": "cryo-puffer",
        "axis": "y",
        "distance": 200,
        "period": 300,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2120,
        "y": 200,
        "w": 36,
        "h": 30,
        "id": "monster-7",
        "kind": "cryo-puffer",
        "axis": "y",
        "distance": 220,
        "period": 330,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2640,
        "y": 0,
        "w": 36,
        "h": 30,
        "id": "monster-8",
        "kind": "cryo-puffer",
        "axis": "y",
        "distance": 220,
        "period": 330,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2000,
        "y": 50,
        "w": 36,
        "h": 30,
        "id": "monster-9",
        "kind": "frost-crawler",
        "axis": "x",
        "distance": 200,
        "period": 300,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2320,
        "y": 50,
        "w": 36,
        "h": 30,
        "id": "monster-10",
        "kind": "frost-crawler",
        "axis": "x",
        "distance": 200,
        "period": 300,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2740,
        "y": 30,
        "w": 36,
        "h": 30,
        "id": "monster-11",
        "kind": "frost-crawler",
        "axis": "x",
        "distance": 180,
        "period": 270,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2440,
        "y": 490,
        "w": 36,
        "h": 30,
        "id": "monster-12",
        "kind": "frost-crawler",
        "axis": "x",
        "distance": 280,
        "period": 420,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 1580,
        "y": -150,
        "w": 36,
        "h": 30,
        "id": "monster-13",
        "kind": "frost-crawler",
        "axis": "x",
        "distance": 480,
        "period": 720,
        "phase": 180,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "id": "monster-14",
        "x": 1400,
        "y": 530,
        "w": 36,
        "h": 30,
        "kind": "shard-wisp",
        "axis": "x",
        "distance": 260,
        "period": 390,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "id": "monster-15",
        "x": 1780,
        "y": 450,
        "w": 36,
        "h": 30,
        "kind": "shard-wisp",
        "axis": "x",
        "distance": 440,
        "period": 660,
        "phase": 0,
        "score": 200,
        "vulnerableFrom": "both"
      }
    ],
    "bosses": [
      {
        "x": 3340,
        "y": 520,
        "w": 1000,
        "h": 400,
        "id": "boss-1",
        "kind": "cryo-conservator",
        "entrySide": "bottom",
        "weakSpot": "bottom",
        "introSeconds": 17,
        "health": 6,
        "score": 3000
      }
    ],
    "score": {
      "lives": 3,
      "coreScore": 100,
      "timeBonusTargetSeconds": 900,
      "timeBonusPerSecond": 1
    },
    "hint": "Leave an echo on the opener plate, use the spring line to collect the Aurora Key, then hit the glacier dash switch and drop into the Conservator arena."
  },
  {
    "id": "timber-archive",
    "index": 3,
    "name": "Timber Archive",
    "subtitle": "Race the living shelves, leave echoes in the margins, and face the custodian",
    "motionModel": "anchored",
    "soundtrackKey": "level-5",
    "completion": "boss-defeat",
    "rewindDisabled": true,
    "backgroundKey": "level-4-timber-archive-fit",
    "backgroundAmbience": {
      "preset": "none",
      "intensity": 0,
      "color": "#43f7ff",
      "drift": 0,
      "flicker": 0,
      "particles": 0
    },
    "start": {
      "x": 180,
      "y": 960
    },
    "exit": {
      "x": 6720,
      "y": 1160,
      "w": 48,
      "h": 62
    },
    "bounds": {
      "x": 0,
      "y": 0,
      "w": 7200,
      "h": 1440
    },
    "solids": [
      {
        "x": 0,
        "y": 1000,
        "w": 860,
        "h": 440,
        "id": "solid-foyer-floor",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive"
      },
      {
        "x": 2080,
        "y": 960,
        "w": 260,
        "h": 480,
        "id": "solid-stack-step-a",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive"
      },
      {
        "x": 2340,
        "y": 920,
        "w": 180,
        "h": 520,
        "id": "solid-stack-step-b",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive"
      },
      {
        "x": 2580,
        "y": 920,
        "w": 160,
        "h": 40,
        "id": "solid-index-shelf-a",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 3660,
        "y": 840,
        "w": 300,
        "h": 40,
        "id": "solid-high-stack-a",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 3980,
        "y": 760,
        "w": 220,
        "h": 40,
        "id": "solid-high-stack-b",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 4220,
        "y": 700,
        "w": 300,
        "h": 40,
        "id": "solid-high-stack-c",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 4700,
        "y": 760,
        "w": 360,
        "h": 40,
        "id": "solid-final-reading-ledge",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 5100,
        "y": 760,
        "w": 280,
        "h": 40,
        "id": "solid-final-lexicon-ledge",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 5860,
        "y": 1240,
        "w": 920,
        "h": 140,
        "id": "floorpiece-14",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "decorDensity": "off",
        "erodesWith": "archive-book",
        "erosionTiles": 1
      },
      {
        "x": 5380,
        "y": 760,
        "w": 480,
        "h": 620,
        "id": "wall-15",
        "sprite": "floor",
        "material": "wood-archive"
      },
      {
        "x": 6780,
        "y": 0,
        "w": 420,
        "h": 1380,
        "id": "solid-16",
        "tone": "dark",
        "sprite": "wall",
        "material": "wood-archive"
      },
      {
        "x": 500,
        "y": 0,
        "w": 20,
        "h": 900,
        "id": "wall-19",
        "tone": "dark",
        "sprite": "wall",
        "material": "wood-archive"
      },
      {
        "x": 860,
        "y": 300,
        "w": 20,
        "h": 1140,
        "id": "solid-20",
        "tone": "dark",
        "sprite": "wall",
        "material": "wood-archive"
      },
      {
        "x": 880,
        "y": 300,
        "w": 400,
        "h": 1140,
        "id": "floorpiece-21",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive"
      },
      {
        "x": 920,
        "y": 280,
        "w": 20,
        "h": 20,
        "id": "block-22",
        "tone": "glass",
        "sprite": "block",
        "material": "metal-lab"
      },
      {
        "x": 1180,
        "y": 280,
        "w": 20,
        "h": 20,
        "id": "solid-23",
        "tone": "glass",
        "sprite": "block",
        "material": "metal-lab"
      },
      {
        "x": 1260,
        "y": 0,
        "w": 20,
        "h": 200,
        "id": "solid-24",
        "tone": "dark",
        "sprite": "wall",
        "material": "wood-archive"
      },
      {
        "x": 1680,
        "y": 300,
        "w": 320,
        "h": 20,
        "id": "floorpiece-24",
        "tone": "steel",
        "sprite": "floor",
        "material": "warning-industrial",
        "collision": "top-only"
      },
      {
        "x": 2060,
        "y": 300,
        "w": 320,
        "h": 20,
        "id": "solid-25",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 2480,
        "y": 0,
        "w": 20,
        "h": 580,
        "id": "solid-26",
        "tone": "dark",
        "sprite": "wall",
        "material": "wood-archive"
      },
      {
        "x": 2060,
        "y": 320,
        "w": 20,
        "h": 1120,
        "id": "solid-27",
        "tone": "dark",
        "sprite": "wall",
        "material": "wood-archive"
      },
      {
        "x": 2160,
        "y": 560,
        "w": 320,
        "h": 20,
        "id": "solid-28",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 2800,
        "y": 920,
        "w": 160,
        "h": 40,
        "id": "solid-29",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 3020,
        "y": 860,
        "w": 160,
        "h": 40,
        "id": "solid-30",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 2800,
        "y": 800,
        "w": 160,
        "h": 40,
        "id": "solid-31",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 2580,
        "y": 740,
        "w": 160,
        "h": 40,
        "id": "solid-32",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 2800,
        "y": 680,
        "w": 160,
        "h": 40,
        "id": "solid-33",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 3020,
        "y": 620,
        "w": 160,
        "h": 40,
        "id": "solid-34",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 3260,
        "y": 620,
        "w": 160,
        "h": 40,
        "id": "solid-35",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 3500,
        "y": 620,
        "w": 160,
        "h": 40,
        "id": "solid-36",
        "tone": "steel",
        "sprite": "floor",
        "material": "wood-archive",
        "collision": "top-only"
      },
      {
        "x": 3640,
        "y": 660,
        "w": 20,
        "h": 220,
        "id": "wall-32",
        "tone": "dark",
        "sprite": "wall",
        "material": "wood-archive"
      },
      {
        "x": 5860,
        "y": 760,
        "w": 920,
        "h": 620,
        "id": "wall-33",
        "tone": "dark",
        "sprite": "wall",
        "material": "sand-ruin",
        "collision": "decorative"
      }
    ],
    "oneWays": [],
    "conveyors": [
      {
        "x": 4780,
        "y": 740,
        "w": 220,
        "h": 20,
        "id": "conveyor-final-aisle",
        "direction": 1,
        "speed": 0.8
      }
    ],
    "platforms": [
      {
        "x": 4480,
        "y": 720,
        "w": 140,
        "h": 20,
        "id": "platform-final-card",
        "axis": "x",
        "distance": 180,
        "period": 300,
        "phase": 60
      },
      {
        "x": 720,
        "y": 800,
        "w": 120,
        "h": 20,
        "id": "platform-4",
        "axis": "y",
        "distance": 100,
        "period": 180,
        "phase": 0
      },
      {
        "x": 540,
        "y": 680,
        "w": 120,
        "h": 20,
        "id": "platform-5",
        "axis": "y",
        "distance": 100,
        "period": 126,
        "phase": 0
      },
      {
        "x": 540,
        "y": 460,
        "w": 120,
        "h": 20,
        "id": "platform-6",
        "axis": "y",
        "distance": 100,
        "period": 126,
        "phase": 0
      },
      {
        "x": 720,
        "y": 580,
        "w": 120,
        "h": 20,
        "id": "platform-7",
        "axis": "y",
        "distance": 100,
        "period": 180,
        "phase": 0
      },
      {
        "x": 720,
        "y": 320,
        "w": 120,
        "h": 20,
        "id": "platform-8",
        "axis": "y",
        "distance": 100,
        "period": 180,
        "phase": 0
      },
      {
        "x": 1280,
        "y": 300,
        "w": 120,
        "h": 20,
        "id": "platform-9",
        "axis": "x",
        "distance": 280,
        "period": 504,
        "phase": 0
      }
    ],
    "launchPads": [
      {
        "x": 600,
        "y": 980,
        "w": 80,
        "h": 20,
        "id": "launch-pad-foyer-page",
        "powerX": 6,
        "powerY": 26
      }
    ],
    "drones": [
      {
        "x": 4860,
        "y": 650,
        "w": 40,
        "h": 20,
        "id": "drone-final-pageknife",
        "axis": "x",
        "distance": 180,
        "period": 240,
        "phase": 120,
        "disabledBy": [
          "timed-switch-final"
        ]
      },
      {
        "x": 2200,
        "y": 360,
        "w": 40,
        "h": 20,
        "id": "drone-3",
        "axis": "y",
        "distance": 160,
        "period": 266,
        "phase": 0
      },
      {
        "x": 2300,
        "y": 360,
        "w": 40,
        "h": 20,
        "id": "drone-4",
        "axis": "y",
        "distance": 160,
        "period": 266,
        "phase": 233
      },
      {
        "x": 2180,
        "y": 760,
        "w": 40,
        "h": 20,
        "id": "drone-5",
        "axis": "y",
        "distance": 160,
        "period": 266,
        "phase": 0
      },
      {
        "x": 2280,
        "y": 760,
        "w": 40,
        "h": 20,
        "id": "drone-6",
        "axis": "y",
        "distance": 160,
        "period": 266,
        "phase": 233
      },
      {
        "x": 2860,
        "y": 620,
        "w": 40,
        "h": 20,
        "id": "drone-7",
        "axis": "y",
        "distance": 360,
        "period": 610,
        "phase": 0
      },
      {
        "x": 3080,
        "y": 560,
        "w": 40,
        "h": 20,
        "id": "drone-8",
        "axis": "y",
        "distance": 360,
        "period": 520,
        "phase": 0
      },
      {
        "x": 2640,
        "y": 680,
        "w": 40,
        "h": 20,
        "id": "drone-9",
        "axis": "y",
        "distance": 300,
        "period": 632,
        "phase": 0
      }
    ],
    "plates": [
      {
        "x": 1040,
        "y": 280,
        "w": 80,
        "h": 20,
        "id": "plate-1"
      }
    ],
    "timedSwitches": [
      {
        "x": 4240,
        "y": 680,
        "w": 80,
        "h": 20,
        "id": "timed-switch-final",
        "duration": 520
      }
    ],
    "echoSensors": [],
    "doors": [
      {
        "x": 5260,
        "y": 620,
        "w": 20,
        "h": 140,
        "id": "door-lexicon-seal",
        "opensWith": [],
        "requiresCore": "core-archive-seal"
      },
      {
        "x": 1260,
        "y": 200,
        "w": 20,
        "h": 100,
        "id": "door-3",
        "opensWith": [
          "plate-1"
        ]
      }
    ],
    "lasers": [
      {
        "x": 4580,
        "y": 740,
        "w": 120,
        "h": 20,
        "id": "laser-final-a",
        "disabledBy": [
          "timed-switch-final"
        ],
        "startsOn": true
      },
      {
        "x": 4880,
        "y": 740,
        "w": 120,
        "h": 20,
        "id": "laser-final-b",
        "disabledBy": [
          "timed-switch-final"
        ],
        "startsOn": true
      }
    ],
    "movingLasers": [
      {
        "x": 4920,
        "y": 620,
        "w": 20,
        "h": 120,
        "id": "moving-laser-final-spine",
        "axis": "x",
        "distance": 200,
        "period": 320,
        "phase": 100,
        "disabledBy": [
          "timed-switch-final"
        ],
        "startsOn": true
      },
      {
        "x": 0,
        "y": 700,
        "w": 20,
        "h": 140,
        "id": "moving-laser-3",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 0,
        "y": 560,
        "w": 20,
        "h": 140,
        "id": "moving-laser-4",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 0,
        "y": 420,
        "w": 20,
        "h": 140,
        "id": "moving-laser-5",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 0,
        "y": 280,
        "w": 20,
        "h": 140,
        "id": "moving-laser-6",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 0,
        "y": 140,
        "w": 20,
        "h": 140,
        "id": "moving-laser-7",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 0,
        "y": 0,
        "w": 20,
        "h": 140,
        "id": "moving-laser-8",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 0,
        "y": 840,
        "w": 20,
        "h": 140,
        "id": "moving-laser-9",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 0,
        "y": 980,
        "w": 20,
        "h": 140,
        "id": "moving-laser-10",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 0,
        "y": 1120,
        "w": 20,
        "h": 140,
        "id": "moving-laser-11",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      },
      {
        "x": 0,
        "y": 1260,
        "w": 20,
        "h": 140,
        "id": "moving-laser-12",
        "axis": "x",
        "distance": 5360,
        "period": 16080,
        "phase": 0,
        "startsOn": true
      }
    ],
    "cores": [
      {
        "x": 3880,
        "y": 800,
        "w": 20,
        "h": 20,
        "id": "core-73",
        "label": "4"
      },
      {
        "x": 3920,
        "y": 780,
        "w": 20,
        "h": 20,
        "id": "core-74",
        "label": "4"
      },
      {
        "x": 3940,
        "y": 740,
        "w": 20,
        "h": 20,
        "id": "core-75",
        "label": "4"
      },
      {
        "x": 3980,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-76",
        "label": "4"
      },
      {
        "x": 4020,
        "y": 680,
        "w": 40,
        "h": 40,
        "id": "core-archive-seal",
        "label": "A",
        "size": "large"
      },
      {
        "x": 4080,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-77",
        "label": "4"
      },
      {
        "x": 4120,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-78",
        "label": "4"
      },
      {
        "x": 4160,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-79",
        "label": "4"
      },
      {
        "x": 4240,
        "y": 660,
        "w": 20,
        "h": 20,
        "id": "core-81",
        "label": "4"
      },
      {
        "x": 4280,
        "y": 660,
        "w": 20,
        "h": 20,
        "id": "core-82",
        "label": "4"
      },
      {
        "x": 4320,
        "y": 660,
        "w": 20,
        "h": 20,
        "id": "core-83",
        "label": "4"
      },
      {
        "x": 4360,
        "y": 660,
        "w": 20,
        "h": 20,
        "id": "core-84",
        "label": "4"
      },
      {
        "x": 4640,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-88",
        "label": "4"
      },
      {
        "x": 4680,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-89",
        "label": "4"
      },
      {
        "x": 4720,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-90",
        "label": "4"
      },
      {
        "x": 4840,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-91",
        "label": "4"
      },
      {
        "x": 4880,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-92",
        "label": "4"
      },
      {
        "x": 4920,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-93",
        "label": "4"
      },
      {
        "x": 5000,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-94",
        "label": "4"
      },
      {
        "x": 5040,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-95",
        "label": "4"
      },
      {
        "x": 5160,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-96",
        "label": "4"
      },
      {
        "x": 5200,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-97",
        "label": "4"
      },
      {
        "x": 5320,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-98",
        "label": "4"
      },
      {
        "x": 5360,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-99",
        "label": "4"
      },
      {
        "x": 280,
        "y": 960,
        "w": 20,
        "h": 20,
        "id": "core-31",
        "label": "31"
      },
      {
        "x": 320,
        "y": 960,
        "w": 20,
        "h": 20,
        "id": "core-32",
        "label": "31"
      },
      {
        "x": 360,
        "y": 960,
        "w": 20,
        "h": 20,
        "id": "core-33",
        "label": "31"
      },
      {
        "x": 400,
        "y": 960,
        "w": 20,
        "h": 20,
        "id": "core-34",
        "label": "31"
      },
      {
        "x": 440,
        "y": 960,
        "w": 20,
        "h": 20,
        "id": "core-35",
        "label": "31"
      },
      {
        "x": 600,
        "y": 600,
        "w": 20,
        "h": 20,
        "id": "core-36",
        "label": "31"
      },
      {
        "x": 600,
        "y": 640,
        "w": 20,
        "h": 20,
        "id": "core-37",
        "label": "31"
      },
      {
        "x": 760,
        "y": 760,
        "w": 20,
        "h": 20,
        "id": "core-38",
        "label": "31"
      },
      {
        "x": 760,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-39",
        "label": "31"
      },
      {
        "x": 760,
        "y": 540,
        "w": 20,
        "h": 20,
        "id": "core-40",
        "label": "31"
      },
      {
        "x": 760,
        "y": 500,
        "w": 20,
        "h": 20,
        "id": "core-41",
        "label": "31"
      },
      {
        "x": 600,
        "y": 420,
        "w": 20,
        "h": 20,
        "id": "core-42",
        "label": "31"
      },
      {
        "x": 600,
        "y": 380,
        "w": 20,
        "h": 20,
        "id": "core-43",
        "label": "31"
      },
      {
        "x": 760,
        "y": 280,
        "w": 20,
        "h": 20,
        "id": "core-44",
        "label": "31"
      },
      {
        "x": 760,
        "y": 240,
        "w": 20,
        "h": 20,
        "id": "core-45",
        "label": "31"
      },
      {
        "x": 1380,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-46",
        "label": "31"
      },
      {
        "x": 1420,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-47",
        "label": "31"
      },
      {
        "x": 1460,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-48",
        "label": "31"
      },
      {
        "x": 1500,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-49",
        "label": "31"
      },
      {
        "x": 1540,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-50",
        "label": "31"
      },
      {
        "x": 1420,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-51",
        "label": "31"
      },
      {
        "x": 1460,
        "y": 180,
        "w": 20,
        "h": 20,
        "id": "core-52",
        "label": "31"
      },
      {
        "x": 1500,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-53",
        "label": "31"
      },
      {
        "x": 1460,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-54",
        "label": "31"
      },
      {
        "x": 1580,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-55",
        "label": "31"
      },
      {
        "x": 1540,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-56",
        "label": "31"
      },
      {
        "x": 1380,
        "y": 220,
        "w": 20,
        "h": 20,
        "id": "core-57",
        "label": "31"
      },
      {
        "x": 1340,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-58",
        "label": "31"
      },
      {
        "x": 1500,
        "y": 180,
        "w": 20,
        "h": 20,
        "id": "core-59",
        "label": "31"
      },
      {
        "x": 1420,
        "y": 180,
        "w": 20,
        "h": 20,
        "id": "core-60",
        "label": "31"
      },
      {
        "x": 1820,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-62",
        "label": "31"
      },
      {
        "x": 1860,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-63",
        "label": "31"
      },
      {
        "x": 1780,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-64",
        "label": "31"
      },
      {
        "x": 2220,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-65",
        "label": "31"
      },
      {
        "x": 2240,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-66",
        "label": "31"
      },
      {
        "x": 2280,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-67",
        "label": "31"
      },
      {
        "x": 2140,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-68",
        "label": "31"
      },
      {
        "x": 2180,
        "y": 260,
        "w": 20,
        "h": 20,
        "id": "core-69",
        "label": "31"
      },
      {
        "x": 2220,
        "y": 420,
        "w": 20,
        "h": 20,
        "id": "core-70",
        "label": "31"
      },
      {
        "x": 2340,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-71",
        "label": "31"
      },
      {
        "x": 2340,
        "y": 420,
        "w": 20,
        "h": 20,
        "id": "core-72",
        "label": "31"
      },
      {
        "x": 2300,
        "y": 420,
        "w": 20,
        "h": 20,
        "id": "core-80",
        "label": "31"
      },
      {
        "x": 2300,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-85",
        "label": "31"
      },
      {
        "x": 2260,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-86",
        "label": "31"
      },
      {
        "x": 2260,
        "y": 420,
        "w": 20,
        "h": 20,
        "id": "core-87",
        "label": "31"
      },
      {
        "x": 2180,
        "y": 460,
        "w": 20,
        "h": 20,
        "id": "core-106",
        "label": "31"
      },
      {
        "x": 2180,
        "y": 420,
        "w": 20,
        "h": 20,
        "id": "core-107",
        "label": "31"
      },
      {
        "x": 2380,
        "y": 880,
        "w": 20,
        "h": 20,
        "id": "core-108",
        "label": "31"
      },
      {
        "x": 2420,
        "y": 840,
        "w": 20,
        "h": 20,
        "id": "core-109",
        "label": "31"
      },
      {
        "x": 2460,
        "y": 880,
        "w": 20,
        "h": 20,
        "id": "core-110",
        "label": "31"
      },
      {
        "x": 4400,
        "y": 660,
        "w": 20,
        "h": 20,
        "id": "core-111",
        "label": "31"
      },
      {
        "x": 4440,
        "y": 660,
        "w": 20,
        "h": 20,
        "id": "core-112",
        "label": "31"
      },
      {
        "x": 4480,
        "y": 660,
        "w": 20,
        "h": 20,
        "id": "core-113",
        "label": "31"
      },
      {
        "x": 5120,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-114",
        "label": "4"
      },
      {
        "x": 5240,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-115",
        "label": "4"
      },
      {
        "x": 5280,
        "y": 720,
        "w": 20,
        "h": 20,
        "id": "core-116",
        "label": "4"
      },
      {
        "x": 4960,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-117",
        "label": "4"
      },
      {
        "x": 4800,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-118",
        "label": "4"
      },
      {
        "x": 4760,
        "y": 700,
        "w": 20,
        "h": 20,
        "id": "core-119",
        "label": "4"
      },
      {
        "x": 3840,
        "y": 800,
        "w": 20,
        "h": 20,
        "id": "core-120",
        "label": "4"
      }
    ],
    "hazards": [],
    "crates": [
      {
        "x": 980,
        "y": 260,
        "w": 40,
        "h": 40,
        "id": "crate-1"
      }
    ],
    "monsters": [
      {
        "x": 1720,
        "y": 270,
        "w": 36,
        "h": 30,
        "id": "monster-gear-tick-reading",
        "kind": "index-mimic",
        "axis": "x",
        "distance": 200,
        "period": 311,
        "phase": 90,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 4020,
        "y": 730,
        "w": 36,
        "h": 30,
        "id": "monster-index-mimic-seal",
        "kind": "index-mimic",
        "axis": "x",
        "distance": 120,
        "period": 320,
        "phase": 140,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 4720,
        "y": 730,
        "w": 36,
        "h": 30,
        "id": "monster-pendulum-drone-final",
        "kind": "pendulum-drone",
        "axis": "x",
        "distance": 160,
        "period": 240,
        "phase": 40,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 2100,
        "y": 270,
        "w": 40,
        "h": 30,
        "id": "monster-5",
        "kind": "page-mote",
        "axis": "x",
        "distance": 200,
        "period": 311,
        "phase": 90,
        "score": 200,
        "vulnerableFrom": "both"
      },
      {
        "x": 4280,
        "y": 670,
        "w": 36,
        "h": 30,
        "id": "monster-6",
        "kind": "pendulum-drone",
        "axis": "x",
        "distance": 160,
        "period": 240,
        "phase": 40,
        "score": 200,
        "vulnerableFrom": "both"
      }
    ],
    "bosses": [
      {
        "x": 5860,
        "y": 820,
        "w": 920,
        "h": 440,
        "id": "boss-1",
        "kind": "archive-custodian",
        "entrySide": "top",
        "weakSpot": "core",
        "soundtrackKey": "final-boss",
        "introSeconds": 12,
        "health": 8,
        "score": 3000
      }
    ],
    "score": {
      "lives": 3,
      "coreScore": 100,
      "timeBonusTargetSeconds": 900,
      "timeBonusPerSecond": 1
    },
    "hint": "Leave an echo on each archive mark, chase the core trails through the stacks, then drop into the custodian arena from above"
  }
];

const cloneLevels = (items: Level[]): Level[] => JSON.parse(JSON.stringify(items)) as Level[];
const runtimeLevelIndex = (index: number): number => {
  if (levels.length === 0) return 0;
  return Math.max(0, Math.min(levels.length - 1, Math.round(index)));
};

export const levels: Level[] = cloneLevels(sourceLevels).map((level) => markAnchoredMotionModel(level));

let draftPlaytestActive = false;

export const setRuntimeLevels = (items: Level[], options: { draftPlaytest?: boolean } = {}): void => {
  levels.splice(0, levels.length, ...cloneLevels(items).map((level) => markAnchoredMotionModel(level)));
  draftPlaytestActive = options.draftPlaytest === true;
};

export const resetRuntimeLevels = (): void => {
  levels.splice(0, levels.length, ...cloneLevels(sourceLevels).map((level) => markAnchoredMotionModel(level)));
  draftPlaytestActive = false;
};

export const isDraftPlaytestActive = (): boolean => draftPlaytestActive;

export const getLevel = (index: number): Level => levels[runtimeLevelIndex(index)];
