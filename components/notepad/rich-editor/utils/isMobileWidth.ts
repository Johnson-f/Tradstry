/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

export function isMobileWidth(): boolean {
  // Next.js SSR safe mobile width detection
  if (typeof window === 'undefined') {
    return false; // Default to desktop during SSR
  }
  
  return window.matchMedia('(max-width: 768px)').matches;
}
