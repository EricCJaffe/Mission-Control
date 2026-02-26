/**
 * FIT File Parser for Garmin wellness and metrics data
 *
 * Parses FIT files exported from Garmin Connect and extracts:
 * - Daily metrics (RHR, HRV, calories, steps)
 * - Sleep data (duration, score, stages)
 * - Body battery data
 * - Stress levels
 */

import FitParser from 'fit-file-parser';
import { readFile } from 'fs/promises';

export interface ParsedFitData {
  date: string; // YYYY-MM-DD
  restingHeartRate?: number;
  hrvMs?: number;
  bodyBattery?: number;
  stressLevel?: number;
  calories?: number;
  steps?: number;
  sleepScore?: number;
  sleepDurationHours?: number;
  deepSleepMinutes?: number;
  lightSleepMinutes?: number;
  remSleepMinutes?: number;
  awakeDurationMinutes?: number;
  weight?: number; // kg
  bodyFatPercent?: number;
  rawData: any; // Store complete raw data for debugging
}

export class FitFileParser {
  private parser: FitParser;

  constructor() {
    this.parser = new FitParser({
      force: true,
      speedUnit: 'km/h',
      lengthUnit: 'km',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'both', // Parse both list and cascade modes
    });
  }

  /**
   * Parse a FIT file from a file path
   */
  async parseFile(filePath: string): Promise<ParsedFitData | null> {
    try {
      const buffer = await readFile(filePath);
      return this.parseBuffer(buffer);
    } catch (error) {
      console.error('Error reading FIT file:', error);
      throw error;
    }
  }

  /**
   * Parse a FIT file from a buffer
   */
  parseBuffer(buffer: Buffer): Promise<ParsedFitData | null> {
    return new Promise((resolve, reject) => {
      this.parser.parse(buffer as any, (error: string | undefined, data: any) => {
        if (error) {
          console.error('Error parsing FIT file:', error);
          reject(error);
          return;
        }

        try {
          const parsed = this.extractData(data);
          resolve(parsed);
        } catch (err) {
          console.error('Error extracting FIT data:', err);
          reject(err);
        }
      });
    });
  }

  /**
   * Extract relevant data from parsed FIT file
   */
  private extractData(fitData: any): ParsedFitData | null {
    if (!fitData) {
      console.error('No data in FIT file');
      return null;
    }

    const result: ParsedFitData = {
      date: this.extractDate(fitData),
      rawData: fitData,
    };

    // Extract from monitor_info (has RMR and other daily summary data)
    if (fitData.monitor_info && Array.isArray(fitData.monitor_info)) {
      for (const info of fitData.monitor_info) {
        if (info.resting_metabolic_rate && !result.calories) {
          result.calories = info.resting_metabolic_rate;
        }
      }
    }

    // Extract from stress array (body battery, stress levels)
    if (fitData.stress && Array.isArray(fitData.stress)) {
      const validBodyBattery = fitData.stress
        .map((s: any) => s.body_battery)
        .filter((bb: any) => bb != null && bb < 127); // 127 is sentinel for no data

      if (validBodyBattery.length > 0) {
        // Use the last valid body battery value
        result.bodyBattery = validBodyBattery[validBodyBattery.length - 1];
      }

      // field_two might be stress level (needs verification)
      const validStress = fitData.stress
        .map((s: any) => s.field_two)
        .filter((s: any) => s != null && s < 101); // 101 might be sentinel

      if (validStress.length > 0) {
        // Average stress level
        result.stressLevel = Math.round(
          validStress.reduce((a: number, b: number) => a + b, 0) / validStress.length
        );
      }
    }

    // Extract from monitors array (heart rate, steps, activity)
    if (fitData.monitors && Array.isArray(fitData.monitors)) {
      const hrValues = fitData.monitors
        .map((m: any) => m.heart_rate)
        .filter((hr: any) => hr != null && hr > 0);

      if (hrValues.length > 0) {
        // Find minimum heart rate (likely RHR)
        result.restingHeartRate = Math.min(...hrValues);
      }
    }

    // Extract from sessions (for activity files)
    if (fitData.sessions && Array.isArray(fitData.sessions)) {
      for (const session of fitData.sessions) {
        if (session.avg_heart_rate && !result.restingHeartRate) {
          result.restingHeartRate = session.avg_heart_rate;
        }
        if (session.total_calories && !result.calories) {
          result.calories = session.total_calories;
        }
      }
    }

    // Extract from records array (activity data points)
    if (fitData.records && Array.isArray(fitData.records)) {
      for (const record of fitData.records) {
        // Resting heart rate
        if (record.resting_heart_rate && !result.restingHeartRate) {
          result.restingHeartRate = record.resting_heart_rate;
        }

        // HRV
        if (record.hrv && !result.hrvMs) {
          result.hrvMs = Array.isArray(record.hrv) ? record.hrv[0] : record.hrv;
        }
        if (record.weekly_average_hrv && !result.hrvMs) {
          result.hrvMs = record.weekly_average_hrv;
        }

        // Body Battery
        if (record.body_battery && record.body_battery < 127 && !result.bodyBattery) {
          result.bodyBattery = record.body_battery;
        }

        // Stress
        if (record.stress_level_value !== undefined && !result.stressLevel) {
          result.stressLevel = record.stress_level_value;
        }

        // Calories
        if (record.active_calories && !result.calories) {
          result.calories = record.active_calories;
        } else if (record.calories && !result.calories) {
          result.calories = record.calories;
        }

        // Steps
        if (record.steps && !result.steps) {
          result.steps = record.steps;
        }

        // Sleep score
        if (record.overall_sleep_score && !result.sleepScore) {
          result.sleepScore = record.overall_sleep_score;
        } else if (record.sleep_score && !result.sleepScore) {
          result.sleepScore = record.sleep_score;
        }

        // Sleep duration
        if (record.total_sleep && !result.sleepDurationHours) {
          result.sleepDurationHours = record.total_sleep / 3600; // Convert seconds to hours
        }

        // Sleep stages
        if (record.deep_sleep_seconds && !result.deepSleepMinutes) {
          result.deepSleepMinutes = record.deep_sleep_seconds / 60;
        }
        if (record.light_sleep_seconds && !result.lightSleepMinutes) {
          result.lightSleepMinutes = record.light_sleep_seconds / 60;
        }
        if (record.rem_sleep_seconds && !result.remSleepMinutes) {
          result.remSleepMinutes = record.rem_sleep_seconds / 60;
        }
        if (record.awake_seconds && !result.awakeDurationMinutes) {
          result.awakeDurationMinutes = record.awake_seconds / 60;
        }

        // Weight
        if (record.weight && !result.weight) {
          result.weight = record.weight;
        }

        // Body fat percentage
        if (record.body_fat_percent && !result.bodyFatPercent) {
          result.bodyFatPercent = record.body_fat_percent;
        }
      }
    }

    return result;
  }

  /**
   * Extract date from FIT file
   */
  private extractDate(fitData: any): string {
    // Try to find timestamp from various sources
    let timestamp: Date | null = null;

    // Check file_ids array
    if (fitData.file_ids && Array.isArray(fitData.file_ids) && fitData.file_ids.length > 0) {
      const fileId = fitData.file_ids[0];
      if (fileId.time_created) {
        timestamp = new Date(fileId.time_created);
      }
    }

    // Check monitor_info array
    if (!timestamp && fitData.monitor_info && Array.isArray(fitData.monitor_info)) {
      const monitorInfo = fitData.monitor_info.find((m: any) => m.timestamp);
      if (monitorInfo?.timestamp) {
        timestamp = new Date(monitorInfo.timestamp);
      }
    }

    // Check sessions array
    if (!timestamp && fitData.sessions && Array.isArray(fitData.sessions)) {
      const session = fitData.sessions.find((s: any) => s.start_time);
      if (session?.start_time) {
        timestamp = new Date(session.start_time);
      }
    }

    // Check records array
    if (!timestamp && fitData.records && Array.isArray(fitData.records)) {
      const firstRecord = fitData.records.find((r: any) => r.timestamp);
      if (firstRecord?.timestamp) {
        timestamp = new Date(firstRecord.timestamp);
      }
    }

    // Fallback to current date
    if (!timestamp) {
      console.warn('No timestamp found in FIT file, using current date');
      timestamp = new Date();
    }

    // Format as YYYY-MM-DD
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Parse multiple FIT files and return aggregated data by date
 */
export async function parseFitFiles(
  filePaths: string[]
): Promise<Map<string, ParsedFitData>> {
  const parser = new FitFileParser();
  const results = new Map<string, ParsedFitData>();

  for (const filePath of filePaths) {
    try {
      console.log(`Parsing FIT file: ${filePath}`);
      const data = await parser.parseFile(filePath);

      if (data) {
        // Merge with existing data for the same date
        const existing = results.get(data.date);
        if (existing) {
          // Merge non-null values, preferring non-null over null
          results.set(data.date, {
            ...existing,
            ...Object.fromEntries(
              Object.entries(data).filter(([_, v]) => v !== null && v !== undefined)
            ),
          });
        } else {
          results.set(data.date, data);
        }
      }
    } catch (error) {
      console.error(`Failed to parse ${filePath}:`, error);
      // Continue with other files
    }
  }

  return results;
}
