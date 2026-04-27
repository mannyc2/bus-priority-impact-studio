export type LatLngTuple = readonly [latitude: number, longitude: number];

export interface RouteData {
  name: string;
  corridor: string;
  borough: string;
  type: string;
  grade: string;
  speed: number;
  cityAvg: number;
  bunching: number;
  trend: number;
  followers: number;
  reports: number;
}

export interface RouteGeo {
  name: string;
  grade: string;
  path: LatLngTuple[];
  stops: LatLngTuple[];
  labelAt: LatLngTuple;
}

export const routes: readonly RouteData[] = [
  {
    name: "B46",
    corridor: "Utica Avenue",
    borough: "Brooklyn",
    type: "Local",
    grade: "D",
    speed: 5.1,
    cityAvg: 7.8,
    bunching: 34,
    trend: -3,
    followers: 1247,
    reports: 186,
  },
  {
    name: "B44",
    corridor: "Nostrand Avenue",
    borough: "Brooklyn",
    type: "SBS",
    grade: "B",
    speed: 8.4,
    cityAvg: 7.8,
    bunching: 12,
    trend: 8,
    followers: 2100,
    reports: 94,
  },
  {
    name: "Q58",
    corridor: "Myrtle\u2013Ridgewood",
    borough: "Queens/Brooklyn",
    type: "Local",
    grade: "C",
    speed: 6.5,
    cityAvg: 7.8,
    bunching: 22,
    trend: -1,
    followers: 890,
    reports: 112,
  },
  {
    name: "M14",
    corridor: "14th Street",
    borough: "Manhattan",
    type: "SBS",
    grade: "A",
    speed: 9.2,
    cityAvg: 7.8,
    bunching: 8,
    trend: 5,
    followers: 3400,
    reports: 45,
  },
  {
    name: "Bx12",
    corridor: "Fordham Road",
    borough: "Bronx",
    type: "SBS",
    grade: "C",
    speed: 6.8,
    cityAvg: 7.8,
    bunching: 19,
    trend: 2,
    followers: 1560,
    reports: 78,
  },
  {
    name: "B46 SBS",
    corridor: "Utica Avenue",
    borough: "Brooklyn",
    type: "SBS",
    grade: "D",
    speed: 5.8,
    cityAvg: 7.8,
    bunching: 28,
    trend: -5,
    followers: 980,
    reports: 201,
  },
];

export const routeGeo: readonly RouteGeo[] = [
  {
    name: "B46",
    grade: "D",
    path: [
      [40.6944, -73.9565],
      [40.687, -73.953],
      [40.678, -73.949],
      [40.67, -73.946],
      [40.661, -73.9425],
    ],
    stops: [
      [40.6944, -73.9565],
      [40.678, -73.949],
      [40.661, -73.9425],
    ],
    labelAt: [40.682, -73.951],
  },
  {
    name: "B44",
    grade: "B",
    path: [
      [40.698, -73.963],
      [40.69, -73.961],
      [40.68, -73.958],
      [40.67, -73.9555],
      [40.658, -73.952],
    ],
    stops: [
      [40.698, -73.963],
      [40.68, -73.958],
      [40.658, -73.952],
    ],
    labelAt: [40.685, -73.9595],
  },
  {
    name: "Q58",
    grade: "C",
    path: [
      [40.714, -73.918],
      [40.71, -73.905],
      [40.706, -73.892],
      [40.702, -73.879],
      [40.698, -73.866],
    ],
    stops: [
      [40.714, -73.918],
      [40.706, -73.892],
      [40.698, -73.866],
    ],
    labelAt: [40.708, -73.897],
  },
  {
    name: "B46 SBS",
    grade: "D",
    path: [
      [40.661, -73.9425],
      [40.653, -73.9395],
      [40.645, -73.936],
      [40.637, -73.933],
    ],
    stops: [
      [40.661, -73.9425],
      [40.645, -73.936],
      [40.637, -73.933],
    ],
    labelAt: [40.649, -73.938],
  },
  {
    name: "M14",
    grade: "A",
    path: [
      [40.7395, -74.002],
      [40.738, -73.994],
      [40.7365, -73.986],
      [40.735, -73.978],
      [40.7335, -73.97],
      [40.732, -73.962],
    ],
    stops: [
      [40.7395, -74.002],
      [40.7365, -73.986],
      [40.7335, -73.97],
      [40.732, -73.962],
    ],
    labelAt: [40.737, -73.987],
  },
  {
    name: "Bx12",
    grade: "C",
    path: [
      [40.861, -73.926],
      [40.858, -73.914],
      [40.856, -73.902],
      [40.854, -73.89],
      [40.852, -73.878],
    ],
    stops: [
      [40.861, -73.926],
      [40.856, -73.902],
      [40.852, -73.878],
    ],
    labelAt: [40.857, -73.909],
  },
];
