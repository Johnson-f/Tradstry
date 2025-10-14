export const REPLICACHE_CONFIG = {
  licenseKey: process.env.NEXT_PUBLIC_REPLICACHE_LICENSE_KEY!,
  pushURL: `${process.env.NEXT_PUBLIC_API_URL}/api/replicache/push`,
  pullURL: `${process.env.NEXT_PUBLIC_API_URL}/api/replicache/pull`,
  syncInterval: 5 * 60 * 60 * 1000, // 5 hours in milliseconds
  name: 'tradistry-replicache',
};
