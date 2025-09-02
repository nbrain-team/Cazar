import { DateTime } from 'luxon';
import { DatabaseService } from './database';
import type { Driver, Timecard, Schedule } from '../types';

// Import HOS rules and calculations (we'll create a TypeScript wrapper)
interface HOSMetrics {
  hoursUsed: number;
  drivingHours: number;
  onDutyHours: number;
  weeklyHoursAvailable: number;
  drivingHoursAvailable: number;
  onDutyHoursAvailable: number;
  lastRestart: string | null;
  nextBreakRequired: boolean;
  canDrive: boolean;
}

interface HOSViolation {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  hoursOver?: number;
  driverId?: string;
  driverName?: string;
  occurredAt?: string;
}

interface HOSRecommendation {
  type: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  action: string;
  driverId?: string;
  driverName?: string;
}

interface DutySegment {
  startUtc: string;
  endUtc: string;
  status: 'OFF_DUTY' | 'SLEEPER_BERTH' | 'DRIVING' | 'ON_DUTY_NOT_DRIVING';
  driverId: string;
  driverName?: string;
}

export class HOSChatService {
  private static knowledgeBase = {
    regulations: {
      '60_hour_rule': {
        description: 'Drivers cannot drive after 60 hours on duty in 7 consecutive days',
        details: 'This is a rolling calculation that looks back 7 days from the current moment',
        violations: 'Exceeding 60 hours results in an out-of-service order until hours drop below limit',
      },
      '70_hour_rule': {
        description: 'Drivers cannot drive after 70 hours on duty in 8 consecutive days',
        details: 'Used by carriers operating 7 days a week. Rolling 8-day calculation',
        violations: 'Similar to 60-hour rule but with 8-day window',
      },
      '11_hour_driving': {
        description: 'Maximum 11 hours of driving after 10 consecutive hours off duty',
        details: 'Driving time resets after a qualifying 10-hour break',
        violations: 'Critical safety violation, immediate out-of-service',
      },
      '14_hour_duty': {
        description: 'Cannot drive beyond 14th hour after coming on duty',
        details: 'Includes all on-duty time, not just driving. Does not pause for breaks',
        violations: 'Must take 10-hour break before driving again',
      },
      '30_minute_break': {
        description: 'Required 30-minute break after 8 hours of driving',
        details: 'Can be satisfied by any non-driving period of 30+ minutes',
        violations: 'Cannot continue driving until break is taken',
      },
      '34_hour_restart': {
        description: 'Optional restart to reset 60/70 hour calculations',
        details: 'Must include two periods between 1-5 AM',
        benefits: 'Resets weekly hour calculations to zero',
      },
    },
    
    commonQuestions: {
      'what_counts_as_on_duty': 'All time working for carrier including driving, loading, unloading, inspecting, fueling, etc.',
      'what_is_off_duty': 'Time when driver is relieved of all duty and responsibility',
      'sleeper_berth_rules': 'Time spent in sleeper berth can be used for required off-duty time',
      'personal_conveyance': 'Personal use of CMV while off-duty, does not count as driving time',
      'adverse_conditions': 'Can extend driving by 2 hours in adverse weather or road conditions',
    },
  };

  /**
   * Main chat interface - processes natural language queries about HOS
   */
  static async processQuery(query: string): Promise<{
    answer: string;
    data?: any;
    suggestions?: string[];
    violations?: HOSViolation[];
    recommendations?: HOSRecommendation[];
  }> {
    const normalizedQuery = query.toLowerCase();
    
    // Determine query intent
    if (this.isViolationQuery(normalizedQuery)) {
      return await this.handleViolationQuery(normalizedQuery);
    } else if (this.isDriverStatusQuery(normalizedQuery)) {
      return await this.handleDriverStatusQuery(normalizedQuery);
    } else if (this.isSchedulingQuery(normalizedQuery)) {
      return await this.handleSchedulingQuery(normalizedQuery);
    } else if (this.isRegulationQuery(normalizedQuery)) {
      return this.handleRegulationQuery(normalizedQuery);
    } else if (this.isAvailabilityQuery(normalizedQuery)) {
      return await this.handleAvailabilityQuery(normalizedQuery);
    } else if (this.isPredictionQuery(normalizedQuery)) {
      return await this.handlePredictionQuery(normalizedQuery);
    } else {
      return this.handleGeneralQuery(normalizedQuery);
    }
  }

  /**
   * Check if query is about violations
   */
  private static isViolationQuery(query: string): boolean {
    const violationKeywords = ['violation', 'violate', 'exceeded', 'over hours', 'illegal', 'compliant', 'compliance', 'out of service'];
    return violationKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is about driver status
   */
  private static isDriverStatusQuery(query: string): boolean {
    const statusKeywords = ['status', 'where is', 'how many hours', 'current hours', 'hours left', 'can drive'];
    return statusKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is about scheduling
   */
  private static isSchedulingQuery(query: string): boolean {
    const scheduleKeywords = ['schedule', 'assign', 'plan', 'tomorrow', 'next week', 'shift', 'route assignment'];
    return scheduleKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is about regulations
   */
  private static isRegulationQuery(query: string): boolean {
    const regulationKeywords = ['rule', 'regulation', 'what is', 'explain', 'how does', 'requirement', 'fmcsa', 'dot'];
    return regulationKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is about availability
   */
  private static isAvailabilityQuery(query: string): boolean {
    const availabilityKeywords = ['available', 'who can', 'drivers available', 'capacity', 'coverage'];
    return availabilityKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is about predictions
   */
  private static isPredictionQuery(query: string): boolean {
    const predictionKeywords = ['will', 'predict', 'forecast', 'projection', 'if', 'what happens'];
    return predictionKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Handle violation-related queries
   */
  private static async handleViolationQuery(query: string): Promise<any> {
    const drivers = await DatabaseService.getDrivers();
    const timecards = await DatabaseService.getTimecards();
    const currentViolations: HOSViolation[] = [];
    
    // Analyze each driver for violations
    for (const driver of drivers) {
      const driverSegments = await this.getDriverDutySegments(driver.driver_id, timecards);
      const compliance = this.checkDriverCompliance(driverSegments);
      
      if (compliance.violations && compliance.violations.length > 0) {
        compliance.violations.forEach((v: HOSViolation) => {
          currentViolations.push({
            ...v,
            driverId: driver.driver_id,
            driverName: driver.driver_name,
          });
        });
      }
    }
    
    // Filter by severity if requested
    let filteredViolations = currentViolations;
    if (query.includes('critical') || query.includes('serious')) {
      filteredViolations = currentViolations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH');
    }
    
    // Generate response
    if (filteredViolations.length === 0) {
      return {
        answer: "Good news! There are currently no HOS violations across your fleet. All drivers are compliant with federal regulations.",
        violations: [],
        suggestions: [
          "View driver hours summary",
          "Check upcoming potential violations",
          "Review weekly compliance trends",
        ],
      };
    } else {
      const criticalCount = filteredViolations.filter(v => v.severity === 'CRITICAL').length;
      const highCount = filteredViolations.filter(v => v.severity === 'HIGH').length;
      
      return {
        answer: `Found ${filteredViolations.length} HOS violations: ${criticalCount} critical, ${highCount} high priority. Critical violations require immediate action to avoid DOT penalties and ensure safety.`,
        violations: filteredViolations,
        recommendations: this.generateViolationRecommendations(filteredViolations),
        suggestions: [
          "Show me drivers who need immediate rest",
          "What's the compliance trend this week?",
          "Calculate potential DOT fines",
        ],
      };
    }
  }

  /**
   * Handle driver status queries
   */
  private static async handleDriverStatusQuery(query: string): Promise<any> {
    const drivers = await DatabaseService.getDrivers();
    const timecards = await DatabaseService.getTimecards();
    
    // Extract driver name from query if present
    const driverName = this.extractDriverName(query, drivers);
    
    if (driverName) {
      const driver = drivers.find(d => 
        d.driver_name.toLowerCase().includes(driverName.toLowerCase())
      );
      
      if (driver) {
        const segments = await this.getDriverDutySegments(driver.driver_id, timecards);
        const metrics = this.calculateDriverMetrics(segments);
        
        return {
          answer: `${driver.driver_name} has worked ${metrics.hoursUsed.toFixed(1)} hours in the last 7 days. They have ${metrics.weeklyHoursAvailable.toFixed(1)} hours available before hitting the 60-hour limit. Current status: ${metrics.canDrive ? 'Available to drive' : 'Cannot drive (needs rest)'}`,
          data: {
            driver,
            metrics,
            lastDriveTime: segments[segments.length - 1]?.endUtc || 'No recent activity',
          },
          suggestions: [
            `Can ${driver.driver_name} work a 10-hour shift tomorrow?`,
            `When does ${driver.driver_name} need their next break?`,
            `Show ${driver.driver_name}'s schedule for this week`,
          ],
        };
      }
    }
    
    // General fleet status
    const fleetStatus = await this.calculateFleetStatus(drivers, timecards);
    
    return {
      answer: `Fleet Status: ${fleetStatus.availableDrivers} drivers available to drive, ${fleetStatus.nearingLimits} approaching hour limits, ${fleetStatus.needingRest} need rest. Average hours used: ${fleetStatus.averageHoursUsed.toFixed(1)}/60.`,
      data: fleetStatus,
      suggestions: [
        "Which drivers are closest to violations?",
        "Show me drivers with most available hours",
        "Who needs to take a 34-hour restart?",
      ],
    };
  }

  /**
   * Handle scheduling queries
   */
  private static async handleSchedulingQuery(query: string): Promise<any> {
    const drivers = await DatabaseService.getDrivers();
    const schedules = await DatabaseService.getSchedules();
    const timecards = await DatabaseService.getTimecards();
    
    // Parse scheduling intent
    if (query.includes('tomorrow') || query.includes('next')) {
      const availableDrivers = await this.getAvailableDriversForDate(
        DateTime.now().plus({ days: 1 }),
        drivers,
        timecards
      );
      
      return {
        answer: `For tomorrow, you have ${availableDrivers.length} drivers available with sufficient hours. Top recommendations based on hours available: ${availableDrivers.slice(0, 3).map(d => `${d.name} (${d.hoursAvailable.toFixed(1)}h)`).join(', ')}.`,
        data: availableDrivers,
        recommendations: this.generateSchedulingRecommendations(availableDrivers),
        suggestions: [
          "Create optimal schedule for tomorrow",
          "Which drivers should take rest days?",
          "Show predicted violations for next week",
        ],
      };
    }
    
    // General scheduling optimization
    const optimization = await this.optimizeWeeklySchedule(drivers, schedules, timecards);
    
    return {
      answer: "I've analyzed your scheduling needs and identified opportunities to optimize driver assignments while maintaining HOS compliance.",
      data: optimization,
      recommendations: optimization.recommendations,
      suggestions: [
        "Apply recommended schedule changes",
        "Show impact on overtime costs",
        "Check coverage gaps",
      ],
    };
  }

  /**
   * Handle regulation explanation queries
   */
  private static handleRegulationQuery(query: string): any {
    // Match query to specific regulations
    const regulations = this.knowledgeBase.regulations;
    
    for (const [key, regulation] of Object.entries(regulations)) {
      const searchKey = key.replace(/_/g, ' ');
      if (query.includes(searchKey) || query.includes(key)) {
        const violationsOrBenefits = 'violations' in regulation ? regulation.violations : ('benefits' in regulation ? regulation.benefits : '');
        return {
          answer: `${regulation.description}\n\nDetails: ${regulation.details}\n\nViolations: ${violationsOrBenefits}`,
          suggestions: [
            "Show current violations of this rule",
            "Which drivers are close to this limit?",
            "How can I prevent these violations?",
          ],
        };
      }
    }
    
    // General regulation overview
    return {
      answer: "The main HOS regulations include:\n\n" +
        "• 60-hour/7-day limit (or 70-hour/8-day)\n" +
        "• 11-hour driving limit\n" +
        "• 14-hour on-duty limit\n" +
        "• 30-minute break requirement\n" +
        "• 10-hour off-duty requirement\n" +
        "• 34-hour restart provision\n\n" +
        "Which specific rule would you like me to explain?",
      suggestions: [
        "Explain the 60-hour rule",
        "What is the 30-minute break requirement?",
        "How does the 34-hour restart work?",
      ],
    };
  }

  /**
   * Handle availability queries
   */
  private static async handleAvailabilityQuery(_query: string): Promise<any> {
    const drivers = await DatabaseService.getDrivers();
    const timecards = await DatabaseService.getTimecards();
    // const routes = await DatabaseService.getRoutes();
    
    const now = DateTime.now();
    const availableNow = [];
    const availableSoon = [];
    
    for (const driver of drivers) {
      if (driver.driver_status !== 'active') continue;
      
      const segments = await this.getDriverDutySegments(driver.driver_id, timecards);
      const metrics = this.calculateDriverMetrics(segments);
      
      if (metrics.canDrive && metrics.drivingHoursAvailable > 2) {
        availableNow.push({
          driver,
          hoursAvailable: Math.min(metrics.drivingHoursAvailable, metrics.weeklyHoursAvailable),
          needsBreakIn: metrics.nextBreakRequired ? 0 : 8 - (metrics.drivingHours % 8),
        });
      } else if (metrics.weeklyHoursAvailable > 10) {
        // Calculate when they'll be available
        const lastSegment = segments[segments.length - 1];
        if (lastSegment) {
          const restNeeded = 10 - (now.diff(DateTime.fromISO(lastSegment.endUtc), 'hours').hours);
          if (restNeeded > 0 && restNeeded < 24) {
            availableSoon.push({
              driver,
              availableIn: restNeeded,
              hoursAvailable: metrics.weeklyHoursAvailable,
            });
          }
        }
      }
    }
    
    return {
      answer: `Currently ${availableNow.length} drivers are available to drive. ${availableSoon.length} more will be available within 24 hours after completing required rest.`,
      data: {
        availableNow: availableNow.sort((a, b) => b.hoursAvailable - a.hoursAvailable),
        availableSoon: availableSoon.sort((a, b) => a.availableIn - b.availableIn),
        totalActive: drivers.filter(d => d.driver_status === 'active').length,
      },
      suggestions: [
        "Show drivers with most hours available",
        "Who needs breaks in the next 4 hours?",
        "Optimize today's route assignments",
      ],
    };
  }

  /**
   * Handle prediction queries
   */
  private static async handlePredictionQuery(_query: string): Promise<any> {
    const drivers = await DatabaseService.getDrivers();
    const schedules = await DatabaseService.getSchedules();
    const timecards = await DatabaseService.getTimecards();
    
    // Predict violations for upcoming schedules
    const predictions = [];
    
    for (const schedule of schedules) {
      const driver = drivers.find(d => d.driver_id === schedule.driver_id);
      if (!driver) continue;
      
      const segments = await this.getDriverDutySegments(driver.driver_id, timecards);
      const plannedSegment = {
        startUtc: schedule.shift_start,
        endUtc: schedule.shift_end,
        status: 'DRIVING' as const,
        driverId: driver.driver_id,
      };
      
      const prediction = this.predictViolation(segments, [plannedSegment]);
      
      if (prediction.violationTime) {
        predictions.push({
          driver,
          schedule,
          prediction,
        });
      }
    }
    
    if (predictions.length === 0) {
      return {
        answer: "Great news! Based on current schedules, no HOS violations are predicted for the upcoming shifts. All drivers should remain compliant if schedules are followed as planned.",
        suggestions: [
          "What if we extend shifts by 2 hours?",
          "Show weekly violation risk forecast",
          "Which drivers have the most buffer time?",
        ],
      };
    } else {
      return {
        answer: `Warning: ${predictions.length} potential violations predicted based on current schedules. The earliest violation would occur for ${predictions[0].driver.driver_name} at ${predictions[0].prediction.violationTime}.`,
        data: predictions,
        recommendations: this.generatePreventiveRecommendations(predictions),
        suggestions: [
          "Show me alternative schedules",
          "Which drivers can cover these shifts?",
          "Calculate impact of schedule changes",
        ],
      };
    }
  }

  /**
   * Handle general queries
   */
  private static handleGeneralQuery(query: string): any {
    // Check common questions
    for (const [key, answer] of Object.entries(this.knowledgeBase.commonQuestions)) {
      if (query.includes(key.replace(/_/g, ' '))) {
        return {
          answer,
          suggestions: [
            "Show me current driver statuses",
            "Check for violations",
            "Explain another HOS rule",
          ],
        };
      }
    }
    
    // Default response with helpful options
    return {
      answer: "I can help you with HOS compliance, violations, driver availability, scheduling, and regulation explanations. What would you like to know?",
      suggestions: [
        "Show me current HOS violations",
        "Which drivers are available now?",
        "Explain the 60-hour rule",
        "Predict violations for tomorrow",
        "Who needs a 34-hour restart?",
      ],
    };
  }

  /**
   * Helper method to extract driver name from query
   */
  private static extractDriverName(query: string, drivers: Driver[]): string | null {
    for (const driver of drivers) {
      const nameParts = driver.driver_name.toLowerCase().split(' ');
      for (const part of nameParts) {
        if (query.includes(part) && part.length > 2) {
          return driver.driver_name;
        }
      }
    }
    return null;
  }

  /**
   * Get duty segments for a driver from timecards
   */
  private static async getDriverDutySegments(driverId: string, timecards: Timecard[]): Promise<DutySegment[]> {
    const driverTimecards = timecards.filter(t => t.employee_id === driverId);
    const segments: DutySegment[] = [];
    
    for (const timecard of driverTimecards) {
      // Convert timecard to duty segments
      const clockIn = DateTime.fromISO(timecard.clock_in_time);
      const clockOut = DateTime.fromISO(timecard.clock_out_time);
      
      // Add driving segment (simplified - in reality would check actual driving vs on-duty)
      segments.push({
        startUtc: clockIn.toISO() || '',
        endUtc: clockOut.toISO() || '',
        status: 'DRIVING',
        driverId: driverId,
      });
      
      // Add off-duty segment until next shift
      const nextTimecard = driverTimecards.find(t => 
        DateTime.fromISO(t.clock_in_time) > clockOut
      );
      
      if (nextTimecard) {
        segments.push({
          startUtc: clockOut.toISO() || '',
          endUtc: DateTime.fromISO(nextTimecard.clock_in_time).toISO() || '',
          status: 'OFF_DUTY',
          driverId: driverId,
        });
      }
    }
    
    return segments.sort((a, b) => 
      DateTime.fromISO(a.startUtc).valueOf() - DateTime.fromISO(b.startUtc).valueOf()
    );
  }

  /**
   * Calculate driver HOS metrics (simplified version)
   */
  private static calculateDriverMetrics(segments: DutySegment[]): HOSMetrics {
    const now = DateTime.now();
    const sevenDaysAgo = now.minus({ days: 7 });
    
    let totalHours = 0;
    let drivingHours = 0;
    let onDutyHours = 0;
    let lastRestEnd: DateTime | null = null;
    
    for (const segment of segments) {
      const start = DateTime.fromISO(segment.startUtc);
      const end = DateTime.fromISO(segment.endUtc);
      
      // Count hours in 7-day window
      if (end > sevenDaysAgo && segment.status !== 'OFF_DUTY') {
        const effectiveStart = start < sevenDaysAgo ? sevenDaysAgo : start;
        const effectiveEnd = end > now ? now : end;
        const hours = effectiveEnd.diff(effectiveStart, 'hours').hours;
        
        totalHours += hours;
        
        if (segment.status === 'DRIVING') {
          drivingHours += hours;
        }
        onDutyHours += hours;
      }
      
      // Track rest periods
      if (segment.status === 'OFF_DUTY' && end.diff(start, 'hours').hours >= 10) {
        lastRestEnd = end;
      }
    }
    
    // Calculate hours since last rest
    if (lastRestEnd) {
      const hoursSinceRest = now.diff(lastRestEnd, 'hours').hours;
      drivingHours = Math.min(drivingHours, hoursSinceRest);
      onDutyHours = Math.min(onDutyHours, hoursSinceRest);
    }
    
    return {
      hoursUsed: totalHours,
      drivingHours: drivingHours,
      onDutyHours: onDutyHours,
      weeklyHoursAvailable: Math.max(0, 60 - totalHours),
      drivingHoursAvailable: Math.max(0, 11 - drivingHours),
      onDutyHoursAvailable: Math.max(0, 14 - onDutyHours),
      lastRestart: null, // Simplified
      nextBreakRequired: drivingHours >= 7.5,
      canDrive: totalHours < 60 && drivingHours < 11 && onDutyHours < 14,
    };
  }

  /**
   * Check driver compliance (simplified)
   */
  private static checkDriverCompliance(segments: DutySegment[]): { violations: HOSViolation[] } {
    const metrics = this.calculateDriverMetrics(segments);
    const violations: HOSViolation[] = [];
    
    if (metrics.hoursUsed > 60) {
      violations.push({
        type: 'WEEKLY_60_HOUR',
        severity: 'CRITICAL',
        message: `Driver has worked ${metrics.hoursUsed.toFixed(1)} hours in 7 days (limit: 60)`,
        hoursOver: metrics.hoursUsed - 60,
      });
    }
    
    if (metrics.drivingHours > 11) {
      violations.push({
        type: 'DRIVING_11_HOUR',
        severity: 'CRITICAL',
        message: `Driver has driven ${metrics.drivingHours.toFixed(1)} hours since last rest (limit: 11)`,
        hoursOver: metrics.drivingHours - 11,
      });
    }
    
    if (metrics.onDutyHours > 14) {
      violations.push({
        type: 'ON_DUTY_14_HOUR',
        severity: 'HIGH',
        message: `Driver has been on duty ${metrics.onDutyHours.toFixed(1)} hours since last rest (limit: 14)`,
        hoursOver: metrics.onDutyHours - 14,
      });
    }
    
    return { violations };
  }

  /**
   * Calculate fleet-wide status
   */
  private static async calculateFleetStatus(drivers: Driver[], timecards: Timecard[]) {
    let availableDrivers = 0;
    let nearingLimits = 0;
    let needingRest = 0;
    let totalHoursUsed = 0;
    let activeDrivers = 0;
    
    for (const driver of drivers) {
      if (driver.driver_status !== 'active') continue;
      
      activeDrivers++;
      const segments = await this.getDriverDutySegments(driver.driver_id, timecards);
      const metrics = this.calculateDriverMetrics(segments);
      
      totalHoursUsed += metrics.hoursUsed;
      
      if (metrics.canDrive) {
        availableDrivers++;
      } else {
        needingRest++;
      }
      
      if (metrics.weeklyHoursAvailable < 10 || metrics.drivingHoursAvailable < 2) {
        nearingLimits++;
      }
    }
    
    return {
      availableDrivers,
      nearingLimits,
      needingRest,
      totalActive: activeDrivers,
      averageHoursUsed: activeDrivers > 0 ? totalHoursUsed / activeDrivers : 0,
    };
  }

  /**
   * Get available drivers for a specific date
   */
  private static async getAvailableDriversForDate(
    _date: DateTime,
    drivers: Driver[],
    timecards: Timecard[]
  ) {
    const available = [];
    
    for (const driver of drivers) {
      if (driver.driver_status !== 'active') continue;
      
      const segments = await this.getDriverDutySegments(driver.driver_id, timecards);
      const metrics = this.calculateDriverMetrics(segments);
      
      if (metrics.weeklyHoursAvailable >= 8) {
        available.push({
          driverId: driver.driver_id,
          name: driver.driver_name,
          hoursAvailable: metrics.weeklyHoursAvailable,
          canWorkFull10Hours: metrics.weeklyHoursAvailable >= 10 && metrics.onDutyHoursAvailable >= 10,
        });
      }
    }
    
    return available.sort((a, b) => b.hoursAvailable - a.hoursAvailable);
  }

  /**
   * Optimize weekly schedule
   */
  private static async optimizeWeeklySchedule(
    drivers: Driver[],
    schedules: Schedule[],
    timecards: Timecard[]
  ) {
    const recommendations: HOSRecommendation[] = [];
    const coverageGaps = [];
    
    // Analyze each day
    for (let i = 0; i < 7; i++) {
      const date = DateTime.now().plus({ days: i });
      const daySchedules = schedules.filter(s => 
        DateTime.fromISO(s.shift_date).hasSame(date, 'day')
      );
      
      // Check coverage
      if (daySchedules.length < 10) { // Assuming need 10 drivers minimum
        coverageGaps.push({
          date: date.toISODate(),
          driversScheduled: daySchedules.length,
          driversNeeded: 10 - daySchedules.length,
        });
      }
      
      // Check for optimization opportunities
      for (const schedule of daySchedules) {
        const driver = drivers.find(d => d.driver_id === schedule.driver_id);
        if (!driver) continue;
        
        const segments = await this.getDriverDutySegments(driver.driver_id, timecards);
        const metrics = this.calculateDriverMetrics(segments);
        
        // Check if driver is being underutilized
        if (metrics.weeklyHoursAvailable > 30 && daySchedules.length < 10) {
          recommendations.push({
            type: 'INCREASE_HOURS',
            priority: 'MEDIUM',
            message: `${driver.driver_name} has ${metrics.weeklyHoursAvailable.toFixed(1)} hours available - consider longer shifts`,
            action: 'Extend shift by 2-4 hours',
            driverId: driver.driver_id,
            driverName: driver.driver_name,
          });
        }
        
        // Check if driver needs rest
        if (metrics.weeklyHoursAvailable < 10) {
          recommendations.push({
            type: 'SCHEDULE_REST',
            priority: 'HIGH',
            message: `${driver.driver_name} approaching 60-hour limit - schedule rest day`,
            action: 'Remove from schedule or assign light duty',
            driverId: driver.driver_id,
            driverName: driver.driver_name,
          });
        }
      }
    }
    
    return {
      recommendations,
      coverageGaps,
      optimizationPotential: recommendations.length,
    };
  }

  /**
   * Predict violations (simplified)
   */
  private static predictViolation(
    existingSegments: DutySegment[],
    plannedSegments: DutySegment[]
  ) {
    // Simplified prediction - in reality would use the enhanced HOS module
    const currentMetrics = this.calculateDriverMetrics(existingSegments);
    
    let projectedHours = currentMetrics.hoursUsed;
    let violationTime = null;
    let violationType = null;
    
    for (const planned of plannedSegments) {
      const plannedHours = DateTime.fromISO(planned.endUtc)
        .diff(DateTime.fromISO(planned.startUtc), 'hours').hours;
      
      projectedHours += plannedHours;
      
      if (projectedHours > 60 && !violationTime) {
        const hoursUntilViolation = 60 - currentMetrics.hoursUsed;
        violationTime = DateTime.fromISO(planned.startUtc)
          .plus({ hours: hoursUntilViolation }).toISO();
        violationType = 'WEEKLY_60_HOUR';
      }
    }
    
    return {
      violationTime,
      violationType,
    };
  }

  /**
   * Generate recommendations for violations
   */
  private static generateViolationRecommendations(violations: HOSViolation[]): HOSRecommendation[] {
    const recommendations: HOSRecommendation[] = [];
    const driverViolations = new Map<string, HOSViolation[]>();
    
    // Group violations by driver
    violations.forEach(v => {
      if (v.driverId) {
        if (!driverViolations.has(v.driverId)) {
          driverViolations.set(v.driverId, []);
        }
        driverViolations.get(v.driverId)!.push(v);
      }
    });
    
    // Generate recommendations per driver
    driverViolations.forEach((driverViols, driverId) => {
      const critical = driverViols.find(v => v.severity === 'CRITICAL');
      
      if (critical) {
        recommendations.push({
          type: 'IMMEDIATE_REST',
          priority: 'HIGH',
          message: `${driverViols[0].driverName} must stop driving immediately due to ${critical.type} violation`,
          action: 'Remove from current route and assign 10+ hour rest period',
          driverId,
          driverName: driverViols[0].driverName,
        });
      }
      
      // Check for 34-hour restart recommendation
      const weeklyViolation = driverViols.find(v => v.type === 'WEEKLY_60_HOUR');
      if (weeklyViolation && weeklyViolation.hoursOver && weeklyViolation.hoursOver > 5) {
        recommendations.push({
          type: 'RESTART_REQUIRED',
          priority: 'MEDIUM',
          message: `${driverViols[0].driverName} should take 34-hour restart to reset weekly hours`,
          action: 'Schedule 34+ hours off including two 1-5 AM periods',
          driverId,
          driverName: driverViols[0].driverName,
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Generate scheduling recommendations
   */
  private static generateSchedulingRecommendations(availableDrivers: any[]): HOSRecommendation[] {
    const recommendations: HOSRecommendation[] = [];
    
    // Recommend drivers with most hours first
    const topDrivers = availableDrivers.slice(0, 5);
    topDrivers.forEach((driver, index) => {
      recommendations.push({
        type: 'OPTIMAL_ASSIGNMENT',
        priority: index === 0 ? 'HIGH' : 'MEDIUM',
        message: `${driver.name} has ${driver.hoursAvailable.toFixed(1)} hours available`,
        action: driver.canWorkFull10Hours 
          ? 'Can work full 10-hour shift' 
          : `Limited to ${Math.floor(driver.hoursAvailable)}-hour shift`,
        driverId: driver.driverId,
        driverName: driver.name,
      });
    });
    
    // Warn about drivers with limited hours
    const limitedDrivers = availableDrivers.filter(d => d.hoursAvailable < 20);
    if (limitedDrivers.length > 0) {
      recommendations.push({
        type: 'CAPACITY_WARNING',
        priority: 'MEDIUM',
        message: `${limitedDrivers.length} drivers have less than 20 hours available this week`,
        action: 'Consider scheduling rest days to rebuild hour capacity',
      });
    }
    
    return recommendations;
  }

  /**
   * Generate preventive recommendations
   */
  private static generatePreventiveRecommendations(predictions: any[]): HOSRecommendation[] {
    return predictions.map(p => ({
      type: 'PREVENT_VIOLATION',
      priority: 'HIGH',
      message: `${p.driver.driver_name} will violate ${p.prediction.violationType} at ${DateTime.fromISO(p.prediction.violationTime).toLocaleString(DateTime.DATETIME_SHORT)}`,
      action: 'Reduce shift length or reassign to another driver',
      driverId: p.driver.driver_id,
      driverName: p.driver.driver_name,
    }));
  }
}
