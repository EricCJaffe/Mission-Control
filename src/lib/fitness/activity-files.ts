/**
 * Manual activity upload: Garmin Connect / Fenix exports as FIT, GPX or CSV.
 *
 * Everything here is pure (no I/O) so it can be tested with synthetic files.
 * The upload route reads the bytes, calls `parseActivityFile`, and decides
 * what to write. Only the summary the running dashboard needs is kept:
 * start, duration, distance, average and max HR, and the share of HR samples
 * inside the plan's zone 2. No GPS track is stored from an upload.
 *
 * Dedupe works at two levels, because the same run arrives by several roads
 * (Garmin sync, Apple Health, and now a file, maybe twice in two formats):
 *   1. `fingerprint` is unique per user in the database, so re-uploading the
 *      same file is a no-op.
 *   2. `sameActivity` matches across formats and sources: same local day,
 *      distance within 0.1 mi and duration within 2 minutes.
 */

import Papa from 'papaparse';
import { APP_TIMEZONE, dayOf } from '../day.ts';

export type ActivityFormat = 'fit' | 'gpx' | 'csv';

export interface ParsedActivity {
  format: ActivityFormat;
  sport: string;
  title: string | null;
  /** ISO 8601 UTC instant the activity started. */
  startTime: string;
  /** Local (America/New_York) calendar day of the start. */
  date: string;
  durationSec: number;
  distanceMi: number;
  avgHr: number | null;
  maxHr: number | null;
  /** Elevation gain in feet, when the file has it. */
  gainFt: number | null;
  kcal: number | null;
  /** Heart-rate samples, when the file carries them (FIT, GPX). */
  hrSamples: number[];
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const METERS_PER_MILE = 1609.344;

export function formatOf(fileName: string): ActivityFormat | null {
  const ext = fileName.toLowerCase().split('.').pop();
  return ext === 'fit' || ext === 'gpx' || ext === 'csv' ? ext : null;
}

export function isRun(sport: string | null | undefined): boolean {
  return /run|jog/i.test(sport ?? '');
}

/**
 * What the running log accepts from an upload: runs, walks and run-walks, plus
 * the untyped activities a watch saves when the mode was not picked ("Other",
 * "generic"). Rides, swims, rowing and strength are not part of the log.
 */
export function isRunLike(sport: string | null | undefined): boolean {
  const s = (sport ?? '').trim();
  if (!s) return true;
  if (/cycl|bik|rid|swim|row|strength|yoga|pilates|elliptical|ski|paddl|golf|tennis/i.test(s)) return false;
  return /run|jog|walk|hik|other|generic|unknown|training|workout/i.test(s);
}

export async function parseActivityFile(
  format: ActivityFormat,
  bytes: Uint8Array,
): Promise<ParsedActivity[]> {
  if (format === 'gpx') return parseGpx(new TextDecoder().decode(bytes));
  if (format === 'csv') return parseGarminCsv(new TextDecoder().decode(bytes));
  return mapFitData(await decodeFit(bytes));
}

// ---------------------------------------------------------------- FIT

async function decodeFit(bytes: Uint8Array): Promise<FitData> {
  const { default: FitParser } = await import('fit-file-parser');
  const parser = new FitParser({
    force: true,
    speedUnit: 'mph',
    lengthUnit: 'mi',
    mode: 'list',
  });
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Promise((resolve, reject) => {
    parser.parse(buffer, (error: unknown, data: unknown) => {
      if (error) reject(new Error(String(error)));
      else resolve((data ?? {}) as FitData);
    });
  });
}

/** The slice of fit-file-parser's list-mode output this module reads. */
export interface FitData {
  sessions?: Array<{
    sport?: string;
    start_time?: string | Date;
    total_timer_time?: number;
    total_elapsed_time?: number;
    total_distance?: number; // miles, because lengthUnit is 'mi'
    total_ascent?: number;
    total_calories?: number;
    avg_heart_rate?: number;
    max_heart_rate?: number;
  }>;
  records?: Array<{ timestamp?: string | Date; heart_rate?: number }>;
}

export function mapFitData(data: FitData): ParsedActivity[] {
  const records = data.records ?? [];
  const out: ParsedActivity[] = [];
  for (const s of data.sessions ?? []) {
    if (!s.start_time) continue;
    const start = new Date(s.start_time);
    if (Number.isNaN(start.getTime())) continue;
    const durationSec = Math.round(s.total_timer_time ?? s.total_elapsed_time ?? 0);
    const end = start.getTime() + (s.total_elapsed_time ?? durationSec) * 1000;
    const hrSamples = records
      .filter((r) => {
        if (typeof r.heart_rate !== 'number' || !r.timestamp) return false;
        const t = new Date(r.timestamp).getTime();
        return t >= start.getTime() && t <= end;
      })
      .map((r) => r.heart_rate as number);
    out.push({
      format: 'fit',
      sport: s.sport ?? 'unknown',
      title: null,
      startTime: start.toISOString(),
      date: dayOf(start),
      durationSec,
      distanceMi: round2(s.total_distance ?? 0),
      avgHr: num(s.avg_heart_rate) ?? mean(hrSamples),
      maxHr: num(s.max_heart_rate) ?? (hrSamples.length ? Math.max(...hrSamples) : null),
      gainFt: fitAscentFt(s.total_ascent),
      kcal: num(s.total_calories),
      hrSamples,
    });
  }
  return out;
}

/**
 * fit-file-parser scales length fields by `lengthUnit`, so ascent arrives in
 * miles; a value too large to be miles is taken as meters (older parser builds
 * left ascent unscaled).
 */
export function fitAscentFt(v: number | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v < 5 ? v * 5280 : v * 3.28084);
}

// ---------------------------------------------------------------- GPX

export function parseGpx(xml: string): ParsedActivity[] {
  const points: Array<{ lat: number; lon: number; t: number | null; hr: number | null; ele: number | null }> = [];
  for (const m of xml.matchAll(/<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g)) {
    const attrs = m[1];
    const body = m[2] ?? '';
    const lat = Number(/lat="([^"]+)"/.exec(attrs)?.[1]);
    const lon = Number(/lon="([^"]+)"/.exec(attrs)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const time = /<time>([^<]+)<\/time>/.exec(body)?.[1];
    const hr = /<(?:\w+:)?hr>(\d+(?:\.\d+)?)<\/(?:\w+:)?hr>/.exec(body)?.[1];
    const ele = /<ele>([^<]+)<\/ele>/.exec(body)?.[1];
    const t = time ? new Date(time).getTime() : NaN;
    points.push({ lat, lon, t: Number.isNaN(t) ? null : t, hr: hr ? Number(hr) : null, ele: ele != null && Number.isFinite(Number(ele)) ? Number(ele) : null });
  }
  const timed = points.filter((p) => p.t !== null);
  if (timed.length < 2) return [];

  let meters = 0;
  let climb = 0;
  let hasEle = false;
  for (let i = 1; i < points.length; i++) {
    meters += haversineMeters(points[i - 1], points[i]);
    const a = points[i - 1].ele;
    const b = points[i].ele;
    if (a != null && b != null) {
      hasEle = true;
      if (b > a) climb += b - a;
    }
  }
  const start = timed[0].t as number;
  const hrSamples = points.map((p) => p.hr).filter((h): h is number => h !== null);
  const trk = /<trk>([\s\S]*?)<\/trk>/.exec(xml)?.[1] ?? '';
  const sport = /<type>([^<]+)<\/type>/.exec(trk)?.[1]?.trim() || 'running';
  const title = /<name>([^<]+)<\/name>/.exec(trk)?.[1]?.trim() || null;

  return [{
    format: 'gpx',
    sport,
    title,
    startTime: new Date(start).toISOString(),
    date: dayOf(new Date(start)),
    durationSec: Math.round(((timed[timed.length - 1].t as number) - start) / 1000),
    distanceMi: round2(meters / METERS_PER_MILE),
    avgHr: mean(hrSamples),
    maxHr: hrSamples.length ? Math.max(...hrSamples) : null,
    gainFt: hasEle ? Math.round(climb * 3.28084) : null,
    kcal: null,
    hrSamples,
  }];
}

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------- CSV

/**
 * Garmin Connect's Activities list export ("Export CSV" on the Activities
 * page). Distances are in the account's display unit; this assumes statute
 * miles, which is what a US account shows. Times are local wall-clock.
 */
export function parseGarminCsv(text: string): ParsedActivity[] {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const out: ParsedActivity[] = [];
  for (const row of parsed.data) {
    const date = row['Date']?.trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
    const durationSec = parseDuration(row['Time'] ?? row['Elapsed Time'] ?? '');
    const distanceMi = Number((row['Distance'] ?? '').replace(/,/g, ''));
    if (!durationSec || !Number.isFinite(distanceMi)) continue;
    const startTime = easternToIso(date);
    out.push({
      format: 'csv',
      sport: row['Activity Type']?.trim() || 'unknown',
      title: row['Title']?.trim() || null,
      startTime,
      date: date.slice(0, 10),
      durationSec,
      distanceMi: round2(distanceMi),
      avgHr: intOrNull(row['Avg HR']),
      maxHr: intOrNull(row['Max HR']),
      gainFt: intOrNull(row['Total Ascent']),
      kcal: intOrNull(row['Calories']),
      hrSamples: [],
    });
  }
  return out;
}

/** "1:02:03", "24:31", "24:31.4" -> seconds. */
export function parseDuration(value: string): number {
  const parts = value.trim().split(':').map(Number);
  if (parts.length < 2 || parts.some((p) => !Number.isFinite(p))) return 0;
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
}

/** A wall-clock "YYYY-MM-DD HH:mm:ss" in the app's time zone -> ISO UTC. */
export function easternToIso(local: string): string {
  const [d, t = '00:00:00'] = local.trim().split(/[ T]/);
  const [y, m, day] = d.split('-').map(Number);
  const [hh = 0, mi = 0, ss = 0] = t.split(':').map((x) => Number(x) || 0);
  const guess = Date.UTC(y, m - 1, day, hh, mi, Math.floor(ss));
  const offset = zoneOffsetMs(new Date(guess));
  const first = guess - offset;
  // Re-check at the corrected instant so a DST edge resolves to the right side.
  return new Date(guess - zoneOffsetMs(new Date(first))).toISOString();
}

function zoneOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at.getTime();
}

// ---------------------------------------------------------------- shared

/** Stable per-file key: re-uploading the same export is a no-op. */
export function fingerprint(a: ParsedActivity): string {
  return `upload:${a.date}|${a.startTime.slice(0, 16)}|${a.distanceMi.toFixed(2)}|${a.durationSec}`;
}

/** Same run from another source or format (Garmin sync, Apple Health, CSV vs FIT). */
export function sameActivity(
  a: { date: string; distanceMi: number; durationSec: number },
  b: { date: string; distanceMi: number | null; durationSec: number | null },
): boolean {
  if (a.date !== b.date || b.distanceMi === null || b.durationSec === null) return false;
  return Math.abs(a.distanceMi - b.distanceMi) <= 0.1 && Math.abs(a.durationSec - b.durationSec) <= 120;
}

/** Share of HR samples inside [low, high], as a whole percent. Null when there are no samples. */
export function zonePct(samples: number[], low: number, high: number): number | null {
  if (!samples.length) return null;
  const inside = samples.filter((h) => h >= low && h <= high).length;
  return Math.round((inside / samples.length) * 100);
}

/** "12:34" per mile, or null. */
export function paceLabel(durationSec: number, distanceMi: number): string | null {
  if (!distanceMi || !durationSec) return null;
  const secPerMile = Math.round(durationSec / distanceMi);
  return `${Math.floor(secPerMile / 60)}:${String(secPerMile % 60).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
}
function intOrNull(v: string | undefined): number | null {
  const n = Number((v ?? '').replace(/,/g, ''));
  return v && v.trim() !== '--' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function mean(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}
