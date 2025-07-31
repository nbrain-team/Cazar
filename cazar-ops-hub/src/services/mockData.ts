import type { Driver, Route, Scorecard, Timecard, Schedule, TimecardDiscrepancy } from '../types';

// Generate realistic driver names
const firstNames = ['John', 'Sarah', 'Michael', 'Jennifer', 'David', 'Maria', 'James', 'Patricia', 'Robert', 'Linda'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

// Generate mock drivers
export const generateMockDrivers = (count: number = 20): Driver[] => {
  return Array.from({ length: count }, (_, i) => ({
    driver_id: `DRV${(i + 1).toString().padStart(3, '0')}`,
    driver_name: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    driver_status: Math.random() > 0.1 ? 'active' : 'inactive',
    employment_status: Math.random() > 0.1 ? 'active' : 'terminated',
    job_title: 'Delivery Driver',
    pay_type: 'hourly',
    pay_rate: 18 + Math.random() * 7, // $18-25/hour
    department: 'Operations',
    location: 'NYC'
  }));
};

// Generate mock routes for the past 7 days
export const generateMockRoutes = (drivers: Driver[]): Route[] => {
  const routes: Route[] = [];
  const today = new Date();
  
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    
    drivers.filter(d => d.driver_status === 'active').forEach((driver, index) => {
      if (Math.random() > 0.2) { // 80% chance driver worked that day
        const startHour = 6 + Math.floor(Math.random() * 4); // 6-10 AM start
        const duration = 8 + Math.floor(Math.random() * 4); // 8-12 hour shift
        
        routes.push({
          route_id: `RT${date.toISOString().split('T')[0]}-${(index + 1).toString().padStart(3, '0')}`,
          route_date: date.toISOString().split('T')[0],
          driver_id: driver.driver_id,
          route_start_time: `${startHour.toString().padStart(2, '0')}:00:00`,
          route_end_time: `${(startHour + duration).toString().padStart(2, '0')}:00:00`,
          route_completion_status: Math.random() > 0.05 ? 'completed' : 'partial',
          route_location_id: 'NYC-01',
          vehicle_type: Math.random() > 0.3 ? 'van' : 'e-bike',
          total_stops: 100 + Math.floor(Math.random() * 50),
          total_packages: 150 + Math.floor(Math.random() * 100),
          packages_delivered: 0,
          packages_undelivered: 0,
          flex_app_check_in_time: `${startHour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 15).toString().padStart(2, '0')}:00`,
          flex_app_check_out_time: `${(startHour + duration).toString().padStart(2, '0')}:${Math.floor(Math.random() * 30).toString().padStart(2, '0')}:00`
        });
        
        // Simulate some incomplete deliveries
        if (Math.random() < 0.1) {
          const lastRoute = routes[routes.length - 1];
          if (lastRoute && lastRoute.total_packages) {
            lastRoute.packages_delivered = Math.floor(lastRoute.total_packages * (0.85 + Math.random() * 0.15));
            lastRoute.packages_undelivered = lastRoute.total_packages - (lastRoute.packages_delivered || 0);
          }
        }
      }
    });
  }
  
  return routes;
};

// Generate mock timecards
export const generateMockTimecards = (routes: Route[]): Timecard[] => {
  return routes.map((route, index) => {
    const startTime = new Date(`${route.route_date}T${route.route_start_time}`);
    const endTime = new Date(`${route.route_date}T${route.route_end_time}`);
    
    // Add some variance to create discrepancies
    const variance = Math.random() > 0.7 ? Math.floor(Math.random() * 30) - 15 : 0; // +/- 15 minutes
    startTime.setMinutes(startTime.getMinutes() + variance);
    endTime.setMinutes(endTime.getMinutes() + variance);
    
    const breakStart = new Date(startTime);
    breakStart.setHours(startTime.getHours() + 4);
    const breakEnd = new Date(breakStart);
    breakEnd.setMinutes(breakStart.getMinutes() + 30);
    
    const totalHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60) - 0.5; // Subtract break
    
    return {
      timecard_id: `TC${index + 1}`,
      employee_id: route.driver_id,
      clock_in_time: startTime.toISOString(),
      clock_out_time: endTime.toISOString(),
      break_start_time: breakStart.toISOString(),
      break_end_time: breakEnd.toISOString(),
      total_hours_worked: totalHours,
      overtime_hours: Math.max(0, totalHours - 8),
      shift_id: `SH${index + 1}`,
      scheduled_shift_start: `${route.route_date}T${route.route_start_time}`,
      scheduled_shift_end: `${route.route_date}T${route.route_end_time}`,
      date: route.route_date
    };
  });
};

// Generate mock schedules
export const generateMockSchedules = (drivers: Driver[]): Schedule[] => {
  const schedules: Schedule[] = [];
  const today = new Date();
  
  // Generate schedules for next 7 days
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    
    drivers.filter(d => d.driver_status === 'active').forEach((driver, index) => {
      if (Math.random() > 0.2) { // 80% chance driver is scheduled
        const startHour = 6 + Math.floor(Math.random() * 4);
        
        schedules.push({
          schedule_id: `SCH${date.toISOString().split('T')[0]}-${index + 1}`,
          driver_id: driver.driver_id,
          shift_date: date.toISOString().split('T')[0],
          shift_start: `${startHour.toString().padStart(2, '0')}:00:00`,
          shift_end: `${(startHour + 10).toString().padStart(2, '0')}:00:00`,
          assigned_vehicle: `VAN-${Math.floor(Math.random() * 20) + 1}`,
          assigned_route: `ROUTE-${date.toISOString().split('T')[0]}-${index + 1}`,
          scheduled_breaks: [`${(startHour + 4).toString().padStart(2, '0')}:00:00`]
        });
      }
    });
  }
  
  return schedules;
};

// Generate mock discrepancies
export const generateMockDiscrepancies = (timecards: Timecard[], routes: Route[], drivers: Driver[]): TimecardDiscrepancy[] => {
  const discrepancies: TimecardDiscrepancy[] = [];
  
  timecards.forEach((timecard, index) => {
    const route = routes.find(r => r.driver_id === timecard.employee_id && r.route_date === timecard.date);
    const driver = drivers.find(d => d.driver_id === timecard.employee_id);
    
    if (route && driver) {
      const adpHours = timecard.total_hours_worked;
      const routeStart = new Date(`${route.route_date}T${route.flex_app_check_in_time}`);
      const routeEnd = new Date(`${route.route_date}T${route.flex_app_check_out_time}`);
      const amazonHours = (routeEnd.getTime() - routeStart.getTime()) / (1000 * 60 * 60);
      const variance = Math.abs(adpHours - amazonHours);
      
      // Create discrepancy if variance > 0.25 hours (15 minutes)
      if (variance > 0.25) {
        discrepancies.push({
          id: `DISC${index + 1}`,
          driver_id: driver.driver_id,
          driver_name: driver.driver_name,
          date: timecard.date,
          type: 'time_mismatch',
          severity: variance > 1 ? 'high' : variance > 0.5 ? 'medium' : 'low',
          description: `Time variance detected: ADP shows ${adpHours.toFixed(2)} hours, Amazon shows ${amazonHours.toFixed(2)} hours`,
          adp_hours: adpHours,
          amazon_hours: amazonHours,
          variance: variance,
          status: 'pending'
        });
      }
      
      // Check for overtime alerts
      if (timecard.overtime_hours > 2) {
        discrepancies.push({
          id: `DISC-OT${index + 1}`,
          driver_id: driver.driver_id,
          driver_name: driver.driver_name,
          date: timecard.date,
          type: 'overtime_alert',
          severity: timecard.overtime_hours > 4 ? 'high' : 'medium',
          description: `Overtime alert: ${timecard.overtime_hours.toFixed(2)} hours of overtime recorded`,
          adp_hours: adpHours,
          amazon_hours: amazonHours,
          variance: 0,
          status: 'pending'
        });
      }
    }
  });
  
  return discrepancies;
};

// Generate mock scorecards
export const generateMockScorecards = (drivers: Driver[]): Scorecard[] => {
  const currentWeek = new Date().toISOString().split('T')[0];
  
  return drivers.filter(d => d.driver_status === 'active').map(driver => ({
    scorecard_week: currentWeek,
    driver_id: driver.driver_id,
    on_time_delivery_rate: 85 + Math.random() * 15, // 85-100%
    delivery_attempt_rate: 90 + Math.random() * 10, // 90-100%
    safe_driving_score: 80 + Math.random() * 20, // 80-100
    customer_feedback_score: 4 + Math.random(), // 4-5 stars
    route_completion_rate: 85 + Math.random() * 15, // 85-100%
    bonus_eligibility: Math.random() > 0.3,
    bonus_amount_potential: Math.random() > 0.3 ? 50 + Math.random() * 150 : 0 // $50-200
  }));
}; 