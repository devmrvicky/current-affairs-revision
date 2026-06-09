import { useState, useEffect, useMemo } from 'react';
import { getAvailableFileNames } from '../services/quizService';
import { parseDateFromFileName, buildFileName } from '../services/quizRepository';
import { formatDateKey } from '../utils';

export interface AvailableDateInfo {
  fileName: string;
  dateKey: string; // YYYY-MM-DD
}

let _cache: AvailableDateInfo[] | null = null;
let _promise: Promise<AvailableDateInfo[]> | null = null;

async function fetchAvailableDates(): Promise<AvailableDateInfo[]> {
  if (_cache) return _cache;
  if (!_promise) {
    _promise = getAvailableFileNames().then((files) => {
      const result: AvailableDateInfo[] = [];
      for (const fileName of files) {
        const date = parseDateFromFileName(fileName);
        if (!date) continue;
        result.push({ fileName, dateKey: formatDateKey(date) });
      }
      _cache = result;
      return result;
    });
  }
  return _promise;
}

/** Returns a Set of YYYY-MM-DD strings for all dates that have quiz files. */
export function useAvailableDates() {
  const [dates, setDates] = useState<AvailableDateInfo[]>(_cache ?? []);
  const [isLoading, setIsLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) return;
    let cancelled = false;
    fetchAvailableDates().then((d) => {
      if (!cancelled) {
        setDates(d);
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const availableSet = useMemo(
    () => new Set(dates.map((d) => d.dateKey)),
    [dates]
  );

  const fileNameByDate = useMemo(() => {
    const map: Record<string, string> = {};
    dates.forEach((d) => { map[d.dateKey] = d.fileName; });
    return map;
  }, [dates]);

  return { dates, availableSet, fileNameByDate, isLoading };
}
