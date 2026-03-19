"use client";

import { useCallback } from "react";

export function usePersistentPreferenceValue<T>(
  stored: T | null,
  setStored: (value: T) => void,
  fallback: T
): [T, (value: T) => void] {
  const value = stored ?? fallback;
  const setValue = useCallback(
    (next: T) => setStored(next),
    [setStored]
  );

  return [value, setValue];
}
