export {
  createGeoclient,
  GeoclientHttpError,
  type Geoclient,
  type GeoclientAddressInput,
  type GeoclientIntersectionInput,
  type GeoclientResult,
  type GeoclientFetch,
} from "./client.js";
export {
  normalizeStreetName,
  canonicalBoroughCode,
  canonicalBoroughName,
  parseHouseAddress,
} from "./street-normalize.js";
