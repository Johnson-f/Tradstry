'use client';
import { Replicache } from "replicache";
import { mutators } from "./mutators";
import { apiConfig, getFullUrl } from "@/lib/config/api";


export const REPLICACHE_CONFIG = {
  pushURL: getFullUrl(apiConfig.endpoints.replicache.push),
  pullURL: getFullUrl(apiConfig.endpoints.replicache.pull),
  syncInterval: 5 * 60 * 1000, // 5 minutes in milliseconds
  name: "tradistry-replicache",
};

export function createReplicache(userId: string, token: string) {
  return new Replicache({
    name: `user-${userId}`,
    pushURL: REPLICACHE_CONFIG.pushURL,
    pullURL: REPLICACHE_CONFIG.pullURL,
    auth: `Bearer ${token}`,
    mutators,
  });
}
