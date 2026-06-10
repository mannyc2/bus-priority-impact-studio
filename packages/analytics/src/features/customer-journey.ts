import type { FeatureQuality } from "./quality.js";

export const CUSTOMER_JOURNEY_FEATURE_GRAIN = "customer_journey" as const;

export type CustomerJourneyPeriod = "Peak" | "Off-Peak";

export type CustomerJourneyTripType = "LCL/LTD" | "EXP" | "SBS";

export type CustomerJourneyFeature = {
  routeId: string;
  month: string;
  period: CustomerJourneyPeriod;
  tripType: CustomerJourneyTripType;
  customers: number;
  additionalWaitMinutes: number;
  additionalTravelMinutes: number;
  // MTA source column is named customer_journey_time_minutes in local DB/adapter,
  // but it is CJTP: a 0..1 share of customers within 5 minutes of schedule.
  journeyTimePerformance: number;
  quality: FeatureQuality;
};

export function customerJourneyFeatureKey(feature: CustomerJourneyFeature): string {
  return [feature.routeId, feature.month, feature.period, feature.tripType].join(":");
}
