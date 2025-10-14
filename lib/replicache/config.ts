import { Replicache } from 'replicache';
import { mutators } from './mutators';

export const REPLICACHE_CONFIG = {
  licenseKey: process.env.NEXT_PUBLIC_REPLICACHE_LICENSE_KEY!,
  pushURL: `${process.env.NEXT_PUBLIC_API_URL}/api/replicache/push`,
  pullURL: `${process.env.NEXT_PUBLIC_API_URL}/api/replicache/pull`,
  syncInterval: 5 * 60 * 60 * 1000, // 5 hours in milliseconds
  name: 'tradistry-replicache',
};

export function createReplicache(userId: string, token: string) {
  if (!process.env.NEXT_PUBLIC_REPLICACHE_LICENSE_KEY) {
    throw new Error('NEXT_PUBLIC_REPLICACHE_LICENSE_KEY is not set');
  }
  if (!process.env.NEXT_PUBLIC_REPLICACHE_PUSH_URL) {
    throw new Error('NEXT_PUBLIC_REPLICACHE_PUSH_URL is not set');
  }
  if (!process.env.NEXT_PUBLIC_REPLICACHE_PULL_URL) {
    throw new Error('NEXT_PUBLIC_REPLICACHE_PULL_URL is not set');
  }

  return new Replicache({
    name: `user-${userId}`,
    licenseKey: process.env.NEXT_PUBLIC_REPLICACHE_LICENSE_KEY,
    pushURL: process.env.NEXT_PUBLIC_REPLICACHE_PUSH_URL,
    pullURL: process.env.NEXT_PUBLIC_REPLICACHE_PULL_URL,
    auth: `Bearer ${token}`,
    mutators,
  });
}
