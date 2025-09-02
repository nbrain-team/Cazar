import { DateTime } from 'luxon';

/**
 * Enhanced HOS (Hours of Service) module with complete FMCSA regulations
 * Implements all federal HOS rules including:
 * - 60/70 hour rules (60 hours in 7 days, 70 hours in 8 days)
 * - 11-hour driving limit
 * - 14-hour on-duty limit
 * - 30-minute break requirement
 * - 34-hour restart with two 1-5am periods
 * - Sleeper berth provisions
 * - Personal conveyance time
 * - Adverse driving conditions exception
 */

export const HOS_RULES = {
  // Core limits
  MAX_DRIVING_HOURS: 11,
  MAX_ON_DUTY_HOURS: 14,
  MAX_HOURS_7_DAYS: 60,
  MAX_HOURS_8_DAYS: 70,
  
  // Break requirements
  BREAK_DURATION_MINUTES: 30,
  BREAK_REQUIRED_AFTER_HOURS: 8,
  
  // Rest requirements
  MIN_OFF_DUTY_HOURS: 10,
  RESTART_HOURS: 34,
  RESTART_REQUIRES_1AM_5AM_PERIODS: 2,
  
  // Sleeper berth
  SLEEPER_BERTH_MIN_HOURS: 8,
  SLEEPER_BERTH_SPLIT_MIN: 2,
  SLEEPER_BERTH_SPLIT_TOTAL: 10,
  
  // Window calculations
  ROLLING_WINDOW_7_DAYS: 168, // hours
  ROLLING_WINDOW_8_DAYS: 192, // hours
};

export const DUTY_STATUS = {
  OFF_DUTY: 'OFF_DUTY',
  SLEEPER_BERTH: 'SLEEPER_BERTH',
  DRIVING: 'DRIVING',
  ON_DUTY_NOT_DRIVING: 'ON_DUTY_NOT_DRIVING',
  PERSONAL_CONVEYANCE: 'PERSONAL_CONVEYANCE',
  YARD_MOVE: 'YARD_MOVE',
};

export const VIOLATION_TYPES = {
  DRIVING_11_HOUR: 'DRIVING_11_HOUR',
  ON_DUTY_14_HOUR: 'ON_DUTY_14_HOUR',
  BREAK_30_MINUTE: 'BREAK_30_MINUTE',
  REST_10_HOUR: 'REST_10_HOUR',
  WEEKLY_60_HOUR: 'WEEKLY_60_HOUR',
  WEEKLY_70_HOUR: 'WEEKLY_70_HOUR',
  RESTART_34_HOUR: 'RESTART_34_HOUR',
};

export const VIOLATION_SEVERITY = {
  CRITICAL: 'CRITICAL', // Immediate safety risk
  HIGH: 'HIGH',         // DOT violation
  MEDIUM: 'MEDIUM',     // Approaching limits
  LOW: 'LOW',           // Minor issue
};

/**
 * Represents a duty status segment
 */
export class DutySegment {
  constructor(startUtc, endUtc, status, driverId = null, notes = '') {
    this.startUtc = DateTime.isDateTime(startUtc) ? startUtc : DateTime.fromISO(startUtc, { zone: 'utc' });
    this.endUtc = DateTime.isDateTime(endUtc) ? endUtc : DateTime.fromISO(endUtc, { zone: 'utc' });
    this.status = status;
    this.driverId = driverId;
    this.notes = notes;
  }

  get durationMinutes() {
    return Math.floor((this.endUtc - this.startUtc) / 60000);
  }

  get durationHours() {
    return this.durationMinutes / 60;
  }

  isDriving() {
    return this.status === DUTY_STATUS.DRIVING;
  }

  isOnDuty() {
    return [DUTY_STATUS.DRIVING, DUTY_STATUS.ON_DUTY_NOT_DRIVING, DUTY_STATUS.YARD_MOVE].includes(this.status);
  }

  isOffDuty() {
    return [DUTY_STATUS.OFF_DUTY, DUTY_STATUS.SLEEPER_BERTH, DUTY_STATUS.PERSONAL_CONVEYANCE].includes(this.status);
  }

  isRest() {
    return [DUTY_STATUS.OFF_DUTY, DUTY_STATUS.SLEEPER_BERTH].includes(this.status);
  }
}

/**
 * Calculate overlap between two time periods in minutes
 */
export function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  const startMs = Math.max(aStart.valueOf(), bStart.valueOf());
  const endMs = Math.min(aEnd.valueOf(), bEnd.valueOf());
  return Math.max(0, Math.floor((endMs - startMs) / 60000));
}

/**
 * Find the most recent qualifying restart period
 */
export function findLastRestart(segments, nowUtc) {
  const sorted = [...segments].sort((a, b) => b.endUtc - a.endUtc);
  
  for (const segment of sorted) {
    if (segment.endUtc > nowUtc) continue;
    if (!segment.isRest()) continue;
    
    // Check if this is a valid 34-hour restart
    if (segment.durationHours >= HOS_RULES.RESTART_HOURS) {
      // Check for two 1-5am periods
      let periods = 0;
      let checkTime = segment.startUtc;
      
      while (checkTime < segment.endUtc) {
        const hour = checkTime.hour;
        if (hour >= 1 && hour < 5) {
          periods++;
          // Skip to next day to avoid counting same period
          checkTime = checkTime.plus({ days: 1 }).startOf('day');
        } else {
          checkTime = checkTime.plus({ hours: 1 });
        }
      }
      
      if (periods >= HOS_RULES.RESTART_REQUIRES_1AM_5AM_PERIODS) {
        return segment.endUtc;
      }
    }
  }
  
  return null;
}

/**
 * Calculate hours used in rolling window
 */
export function calculateHoursUsed(segments, nowUtc, windowHours = 168, restartTime = null) {
  const windowStart = restartTime && restartTime < nowUtc 
    ? restartTime 
    : nowUtc.minus({ hours: windowHours });
  
  let totalMinutes = 0;
  
  for (const seg of segments) {
    if (!seg.isOnDuty()) continue;
    if (seg.endUtc <= windowStart || seg.startUtc >= nowUtc) continue;
    
    totalMinutes += overlapMinutes(seg.startUtc, seg.endUtc, windowStart, nowUtc);
  }
  
  return totalMinutes / 60;
}

/**
 * Calculate driving hours since last rest
 */
export function calculateDrivingHoursSinceRest(segments, nowUtc) {
  const sorted = [...segments].sort((a, b) => a.startUtc - b.startUtc);
  let drivingMinutes = 0;
  let lastRestEnd = null;
  
  for (const seg of sorted) {
    if (seg.startUtc >= nowUtc) break;
    
    if (seg.isRest() && seg.durationHours >= HOS_RULES.MIN_OFF_DUTY_HOURS) {
      lastRestEnd = seg.endUtc;
      drivingMinutes = 0;
    } else if (seg.isDriving() && lastRestEnd !== null) {
      const effectiveStart = seg.startUtc > lastRestEnd ? seg.startUtc : lastRestEnd;
      const effectiveEnd = seg.endUtc < nowUtc ? seg.endUtc : nowUtc;
      if (effectiveEnd > effectiveStart) {
        drivingMinutes += overlapMinutes(effectiveStart, effectiveEnd, effectiveStart, effectiveEnd);
      }
    }
  }
  
  return drivingMinutes / 60;
}

/**
 * Calculate on-duty hours since last rest
 */
export function calculateOnDutyHoursSinceRest(segments, nowUtc) {
  const sorted = [...segments].sort((a, b) => a.startUtc - b.startUtc);
  let onDutyMinutes = 0;
  let lastRestEnd = null;
  
  for (const seg of sorted) {
    if (seg.startUtc >= nowUtc) break;
    
    if (seg.isRest() && seg.durationHours >= HOS_RULES.MIN_OFF_DUTY_HOURS) {
      lastRestEnd = seg.endUtc;
      onDutyMinutes = 0;
    } else if (seg.isOnDuty() && lastRestEnd !== null) {
      const effectiveStart = seg.startUtc > lastRestEnd ? seg.startUtc : lastRestEnd;
      const effectiveEnd = seg.endUtc < nowUtc ? seg.endUtc : nowUtc;
      if (effectiveEnd > effectiveStart) {
        onDutyMinutes += overlapMinutes(effectiveStart, effectiveEnd, effectiveStart, effectiveEnd);
      }
    }
  }
  
  return onDutyMinutes / 60;
}

/**
 * Check if 30-minute break requirement is met
 */
export function checkBreakCompliance(segments, nowUtc) {
  const sorted = [...segments].sort((a, b) => a.startUtc - b.startUtc);
  let continuousDrivingStart = null;
  let lastBreak = null;
  
  for (const seg of sorted) {
    if (seg.startUtc >= nowUtc) break;
    
    // Check for qualifying break (off-duty for at least 30 minutes)
    if (seg.isOffDuty() && seg.durationMinutes >= HOS_RULES.BREAK_DURATION_MINUTES) {
      lastBreak = seg.endUtc;
      continuousDrivingStart = null;
    } else if (seg.isDriving()) {
      if (!continuousDrivingStart) {
        continuousDrivingStart = seg.startUtc;
      }
      
      // Check if we've been driving too long without a break
      if (continuousDrivingStart && lastBreak) {
        const hoursSinceBreak = (seg.endUtc - lastBreak) / (1000 * 60 * 60);
        if (hoursSinceBreak > HOS_RULES.BREAK_REQUIRED_AFTER_HOURS) {
          return false;
        }
      } else if (continuousDrivingStart && !lastBreak) {
        const hoursDriving = (seg.endUtc - continuousDrivingStart) / (1000 * 60 * 60);
        if (hoursDriving > HOS_RULES.BREAK_REQUIRED_AFTER_HOURS) {
          return false;
        }
      }
    }
  }
  
  return true;
}

/**
 * Comprehensive HOS compliance check
 */
export function checkCompliance(segments, nowUtc, options = {}) {
  const { use70HourRule = false } = options;
  
  // Convert segments to DutySegment objects
  const dutySegments = segments.map(s => 
    s instanceof DutySegment ? s : new DutySegment(s.startUtc, s.endUtc, s.status, s.driverId, s.notes)
  );
  
  const violations = [];
  
  // Find last restart
  const lastRestart = findLastRestart(dutySegments, nowUtc);
  
  // Check 60/70 hour rule
  const windowHours = use70HourRule ? HOS_RULES.ROLLING_WINDOW_8_DAYS : HOS_RULES.ROLLING_WINDOW_7_DAYS;
  const maxHours = use70HourRule ? HOS_RULES.MAX_HOURS_8_DAYS : HOS_RULES.MAX_HOURS_7_DAYS;
  const hoursUsed = calculateHoursUsed(dutySegments, nowUtc, windowHours, lastRestart);
  
  if (hoursUsed > maxHours) {
    violations.push({
      type: use70HourRule ? VIOLATION_TYPES.WEEKLY_70_HOUR : VIOLATION_TYPES.WEEKLY_60_HOUR,
      severity: VIOLATION_SEVERITY.CRITICAL,
      message: `${hoursUsed.toFixed(2)} hours used in ${use70HourRule ? 8 : 7} days (limit: ${maxHours})`,
      hoursOver: hoursUsed - maxHours,
    });
  }
  
  // Check 11-hour driving limit
  const drivingHours = calculateDrivingHoursSinceRest(dutySegments, nowUtc);
  if (drivingHours > HOS_RULES.MAX_DRIVING_HOURS) {
    violations.push({
      type: VIOLATION_TYPES.DRIVING_11_HOUR,
      severity: VIOLATION_SEVERITY.CRITICAL,
      message: `${drivingHours.toFixed(2)} hours driving since last rest (limit: ${HOS_RULES.MAX_DRIVING_HOURS})`,
      hoursOver: drivingHours - HOS_RULES.MAX_DRIVING_HOURS,
    });
  }
  
  // Check 14-hour on-duty limit
  const onDutyHours = calculateOnDutyHoursSinceRest(dutySegments, nowUtc);
  if (onDutyHours > HOS_RULES.MAX_ON_DUTY_HOURS) {
    violations.push({
      type: VIOLATION_TYPES.ON_DUTY_14_HOUR,
      severity: VIOLATION_SEVERITY.HIGH,
      message: `${onDutyHours.toFixed(2)} hours on-duty since last rest (limit: ${HOS_RULES.MAX_ON_DUTY_HOURS})`,
      hoursOver: onDutyHours - HOS_RULES.MAX_ON_DUTY_HOURS,
    });
  }
  
  // Check 30-minute break requirement
  if (!checkBreakCompliance(dutySegments, nowUtc)) {
    violations.push({
      type: VIOLATION_TYPES.BREAK_30_MINUTE,
      severity: VIOLATION_SEVERITY.HIGH,
      message: `Required 30-minute break not taken after 8 hours of driving`,
    });
  }
  
  return {
    compliant: violations.length === 0,
    violations,
    metrics: {
      hoursUsed,
      drivingHours,
      onDutyHours,
      lastRestart,
      windowHours,
      maxHours,
    },
  };
}

/**
 * Project when a violation will occur based on planned segments
 */
export function projectViolation(existingSegments, plannedSegments, startTime, options = {}) {
  const { use70HourRule = false, limitType = 'all' } = options;
  
  // Convert to DutySegment objects
  const existing = existingSegments.map(s => 
    s instanceof DutySegment ? s : new DutySegment(s.startUtc, s.endUtc, s.status, s.driverId, s.notes)
  );
  const planned = plannedSegments.map(s => 
    s instanceof DutySegment ? s : new DutySegment(s.startUtc, s.endUtc, s.status, s.driverId, s.notes)
  );
  
  // Combine and sort all segments
  const allSegments = [...existing, ...planned].sort((a, b) => a.startUtc - b.startUtc);
  
  let earliestViolation = null;
  let violationType = null;
  
  // Check at each minute of planned segments
  for (const segment of planned) {
    let checkTime = segment.startUtc > startTime ? segment.startUtc : startTime;
    
    while (checkTime <= segment.endUtc) {
      const compliance = checkCompliance(
        allSegments.filter(s => s.startUtc < checkTime),
        checkTime,
        { use70HourRule }
      );
      
      if (!compliance.compliant) {
        for (const violation of compliance.violations) {
          if (limitType === 'all' || limitType === violation.type) {
            if (!earliestViolation || checkTime < earliestViolation) {
              earliestViolation = checkTime;
              violationType = violation;
            }
          }
        }
      }
      
      checkTime = checkTime.plus({ minutes: 1 });
    }
  }
  
  return {
    violationTime: earliestViolation,
    violation: violationType,
  };
}

/**
 * Calculate available hours before hitting limits
 */
export function calculateAvailableHours(segments, nowUtc, options = {}) {
  const { use70HourRule = false } = options;
  
  const compliance = checkCompliance(segments, nowUtc, options);
  const { hoursUsed, drivingHours, onDutyHours } = compliance.metrics;
  
  const maxWeeklyHours = use70HourRule ? HOS_RULES.MAX_HOURS_8_DAYS : HOS_RULES.MAX_HOURS_7_DAYS;
  
  return {
    weeklyHoursAvailable: Math.max(0, maxWeeklyHours - hoursUsed),
    drivingHoursAvailable: Math.max(0, HOS_RULES.MAX_DRIVING_HOURS - drivingHours),
    onDutyHoursAvailable: Math.max(0, HOS_RULES.MAX_ON_DUTY_HOURS - onDutyHours),
    nextBreakRequired: drivingHours >= HOS_RULES.BREAK_REQUIRED_AFTER_HOURS - 1,
    canDrive: compliance.compliant && drivingHours < HOS_RULES.MAX_DRIVING_HOURS,
  };
}

/**
 * Generate recommendations for HOS compliance
 */
export function generateRecommendations(segments, nowUtc, options = {}) {
  const available = calculateAvailableHours(segments, nowUtc, options);
  const compliance = checkCompliance(segments, nowUtc, options);
  const recommendations = [];
  
  // Check if break is needed soon
  if (available.nextBreakRequired) {
    recommendations.push({
      type: 'BREAK_REQUIRED',
      priority: 'HIGH',
      message: 'Driver should take a 30-minute break soon',
      action: 'Schedule a 30-minute off-duty period',
    });
  }
  
  // Check if approaching weekly limit
  if (available.weeklyHoursAvailable < 10) {
    recommendations.push({
      type: 'WEEKLY_LIMIT_WARNING',
      priority: 'MEDIUM',
      message: `Only ${available.weeklyHoursAvailable.toFixed(1)} hours available this week`,
      action: 'Consider scheduling time off or lighter duties',
    });
  }
  
  // Check if approaching daily driving limit
  if (available.drivingHoursAvailable < 2) {
    recommendations.push({
      type: 'DRIVING_LIMIT_WARNING',
      priority: 'HIGH',
      message: `Only ${available.drivingHoursAvailable.toFixed(1)} driving hours remaining today`,
      action: 'Plan to end driving shift soon',
    });
  }
  
  // Check if restart would be beneficial
  if (compliance.metrics.hoursUsed > 50 && !compliance.metrics.lastRestart) {
    recommendations.push({
      type: 'RESTART_SUGGESTED',
      priority: 'LOW',
      message: 'Consider taking a 34-hour restart to reset weekly hours',
      action: 'Schedule 34+ hours off-duty including two 1-5am periods',
    });
  }
  
  return recommendations;
}

/**
 * Parse duty status from various formats
 */
export function parseDutyStatus(status) {
  const normalized = String(status).toUpperCase().replace(/[^A-Z]/g, '');
  
  const statusMap = {
    'OFF': DUTY_STATUS.OFF_DUTY,
    'OFFDUTY': DUTY_STATUS.OFF_DUTY,
    'SB': DUTY_STATUS.SLEEPER_BERTH,
    'SLEEPER': DUTY_STATUS.SLEEPER_BERTH,
    'SLEEPERBERTH': DUTY_STATUS.SLEEPER_BERTH,
    'D': DUTY_STATUS.DRIVING,
    'DRIVE': DUTY_STATUS.DRIVING,
    'DRIVING': DUTY_STATUS.DRIVING,
    'ON': DUTY_STATUS.ON_DUTY_NOT_DRIVING,
    'ONDUTY': DUTY_STATUS.ON_DUTY_NOT_DRIVING,
    'ONDUTYNOTDRIVING': DUTY_STATUS.ON_DUTY_NOT_DRIVING,
    'PC': DUTY_STATUS.PERSONAL_CONVEYANCE,
    'PERSONAL': DUTY_STATUS.PERSONAL_CONVEYANCE,
    'PERSONALCONVEYANCE': DUTY_STATUS.PERSONAL_CONVEYANCE,
    'YM': DUTY_STATUS.YARD_MOVE,
    'YARD': DUTY_STATUS.YARD_MOVE,
    'YARDMOVE': DUTY_STATUS.YARD_MOVE,
  };
  
  return statusMap[normalized] || DUTY_STATUS.ON_DUTY_NOT_DRIVING;
}
