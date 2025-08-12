import type { WorkHoursAuditDaily, WorkHoursPolicyProfile } from '../types';
import { DatabaseService } from './database';

const defaultPolicies: WorkHoursPolicyProfile[] = [
  { station_code: 'DYY5', state_code: 'NY', min_meal_minutes: 30, meal_window_start_minute: 240, meal_window_end_minute: 360, min_rest_hours_between_shifts: 10, max_daily_on_duty_hours: 12, max_weekly_hours: 60 },
  { station_code: 'VNY1', state_code: 'NY', min_meal_minutes: 30, meal_window_start_minute: 240, meal_window_end_minute: 360, min_rest_hours_between_shifts: 10, max_daily_on_duty_hours: 12, max_weekly_hours: 60 },
];

export class WhcService {
  static async getPolicy(station_code: string): Promise<WorkHoursPolicyProfile> {
    return defaultPolicies.find(p => p.station_code === station_code) || defaultPolicies[0];
  }

  // Mock compute using routes as proxy for shifts; real version would parse ADP punches with meal notes
  static async computeDailyAudit(station_code: string, date: string): Promise<WorkHoursAuditDaily[]> {
    const policy = await this.getPolicy(station_code);
    const routes = await DatabaseService.getRoutes();

    const audits: WorkHoursAuditDaily[] = routes
      .filter(r => r.route_location_id.startsWith(station_code) || ['DYY5','VNY1'].includes(station_code))
      .filter(r => r.route_date === date)
      .map(r => {
        const start = new Date(`${r.route_date}T${r.route_start_time}`);
        const end = new Date(`${r.route_date}T${r.route_end_time}`);
        const minutes = (end.getTime() - start.getTime()) / 60000;
        const mealMinutes = 30; // mock
        const withinWindow = policy.meal_window_start_minute <= 250 && policy.meal_window_end_minute >= 280; // mock proxy
        const onDutyHours = +(minutes / 60 - mealMinutes / 60).toFixed(2);
        const dailyMax = onDutyHours > policy.max_daily_on_duty_hours;
        const weeklyHours = 45; // mock aggregate
        const weeklyOt = weeklyHours > policy.max_weekly_hours;
        const fifthSixth = false; // mock toggle later

        const reasons: string[] = [];
        if (mealMinutes < policy.min_meal_minutes) reasons.push('Meal short');
        if (!withinWindow) reasons.push('Meal outside window');
        if (dailyMax) reasons.push('Daily > policy');
        if (weeklyOt) reasons.push('Weekly OT risk');
        if (fifthSixth) reasons.push('5th/6th day');

        const verdict: WorkHoursAuditDaily['verdict'] = reasons.length === 0 ? 'PASS' : (dailyMax || weeklyOt ? 'FAIL' : 'WARN');

        return {
          work_date: r.route_date,
          station_code,
          position_id: undefined,
          transporter_id: undefined,
          driver_name: r.driver_id,
          shift_start: start.toISOString(),
          shift_end: end.toISOString(),
          on_duty_hours: onDutyHours,
          meal_minutes: mealMinutes,
          meal_within_window: withinWindow,
          short_rest_flag: false,
          daily_max_exceeded: dailyMax,
          fifth_sixth_day_flag: fifthSixth,
          weekly_hours: weeklyHours,
          weekly_ot_flag: weeklyOt,
          verdict,
          reasons
        };
      });

    return audits;
  }
} 