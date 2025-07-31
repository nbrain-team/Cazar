import { prisma } from './prismaClient';
import { 
  generateMockDrivers, 
  generateMockRoutes, 
  generateMockTimecards, 
  generateMockScorecards,
  generateMockSchedules,
  generateMockDiscrepancies
} from './mockData';
import type { Driver, Route, Scorecard, Timecard, Schedule, TimecardDiscrepancy } from '../types';

// Check if we should use mock data
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true' || !import.meta.env.VITE_DATABASE_URL;

// Driver operations
export async function getDrivers(): Promise<Driver[]> {
  if (USE_MOCK_DATA) {
    return generateMockDrivers(25);
  }
  
  const drivers = await prisma.driver.findMany({
    orderBy: { driverName: 'asc' }
  });
  
  return drivers.map(d => ({
    driver_id: d.driverId,
    driver_name: d.driverName,
    driver_status: d.driverStatus,
    employment_status: d.employmentStatus,
    job_title: d.jobTitle || undefined,
    pay_type: d.payType || undefined,
    pay_rate: d.payRate ? Number(d.payRate) : undefined,
    department: d.department || undefined,
    location: d.location || undefined,
    email: d.email || undefined,
    phone: d.phone || undefined,
    hire_date: d.hireDate?.toISOString(),
    license_number: d.licenseNumber || undefined,
    license_expiry: d.licenseExpiry?.toISOString()
  }));
}

export async function getDriverById(driverId: string): Promise<Driver | null> {
  if (USE_MOCK_DATA) {
    const drivers = generateMockDrivers(25);
    return drivers.find(d => d.driver_id === driverId) || null;
  }
  
  const driver = await prisma.driver.findUnique({
    where: { driverId }
  });
  
  if (!driver) return null;
  
  return {
    driver_id: driver.driverId,
    driver_name: driver.driverName,
    driver_status: driver.driverStatus,
    employment_status: driver.employmentStatus,
    job_title: driver.jobTitle || undefined,
    pay_type: driver.payType || undefined,
    pay_rate: driver.payRate ? Number(driver.payRate) : undefined,
    department: driver.department || undefined,
    location: driver.location || undefined,
    email: driver.email || undefined,
    phone: driver.phone || undefined,
    hire_date: driver.hireDate?.toISOString(),
    license_number: driver.licenseNumber || undefined,
    license_expiry: driver.licenseExpiry?.toISOString()
  };
}

// Route operations
export async function getRoutes(_dateRange?: { start: Date; end: Date }): Promise<Route[]> {
  if (USE_MOCK_DATA) {
    const drivers = generateMockDrivers(25);
    return generateMockRoutes(drivers);
  }
  
  const routes = await prisma.route.findMany({
    where: _dateRange ? {
      routeDate: {
        gte: _dateRange.start,
        lte: _dateRange.end
      }
    } : undefined,
    orderBy: { routeDate: 'desc' }
  });
  
  return routes.map(r => ({
    route_id: r.routeId,
    route_date: r.routeDate.toISOString(),
    driver_id: r.driverId,
    route_start_time: r.routeStartTime.toISOString(),
    route_end_time: r.routeEndTime.toISOString(),
    route_completion_status: r.routeCompletionStatus,
    route_location_id: r.routeLocationId || undefined,
    vehicle_type: r.vehicleType || undefined,
    total_stops: r.totalStops || undefined,
    total_packages: r.totalPackages || undefined,
    packages_delivered: r.packagesDelivered || undefined,
    packages_undelivered: r.packagesUndelivered || undefined,
    flex_app_check_in_time: r.flexAppCheckInTime?.toISOString(),
    flex_app_check_out_time: r.flexAppCheckOutTime?.toISOString()
  }));
}

// Timecard operations
export async function getTimecards(_dateRange?: { start: Date; end: Date }): Promise<Timecard[]> {
  if (USE_MOCK_DATA) {
    const drivers = generateMockDrivers(25);
    const routes = generateMockRoutes(drivers);
    return generateMockTimecards(routes);
  }
  
  const timecards = await prisma.timecard.findMany({
    where: _dateRange ? {
      date: {
        gte: _dateRange.start,
        lte: _dateRange.end
      }
    } : undefined,
    orderBy: { date: 'desc' }
  });
  
  return timecards.map(t => ({
    timecard_id: t.timecardId,
    employee_id: t.employeeId,
    clock_in_time: t.clockInTime.toISOString(),
    clock_out_time: t.clockOutTime?.toISOString() || '',
    break_start_time: t.breakStartTime?.toISOString() || '',
    break_end_time: t.breakEndTime?.toISOString() || '',
    total_hours_worked: t.totalHoursWorked ? Number(t.totalHoursWorked) : 0,
    overtime_hours: t.overtimeHours ? Number(t.overtimeHours) : 0,
    shift_id: t.shiftId || undefined,
    scheduled_shift_start: t.scheduledShiftStart?.toISOString() || '',
    scheduled_shift_end: t.scheduledShiftEnd?.toISOString() || '',
    date: t.date.toISOString()
  }));
}

// Scorecard operations
export async function getScorecards(): Promise<Scorecard[]> {
  if (USE_MOCK_DATA) {
    const drivers = generateMockDrivers(25);
    return generateMockScorecards(drivers);
  }
  
  const scorecards = await prisma.scorecard.findMany({
    orderBy: { scorecardWeek: 'desc' }
  });
  
  return scorecards.map(s => ({
    scorecard_week: s.scorecardWeek.toISOString(),
    driver_id: s.driverId,
    on_time_delivery_rate: s.onTimeDeliveryRate ? Number(s.onTimeDeliveryRate) : undefined,
    delivery_attempt_rate: s.deliveryAttemptRate ? Number(s.deliveryAttemptRate) : undefined,
    safe_driving_score: s.safeDrivingScore ? Number(s.safeDrivingScore) : undefined,
    customer_feedback_score: s.customerFeedbackScore ? Number(s.customerFeedbackScore) : undefined,
    route_completion_rate: s.routeCompletionRate ? Number(s.routeCompletionRate) : undefined,
    bonus_eligibility: s.bonusEligibility,
    bonus_amount_potential: s.bonusAmountPotential ? Number(s.bonusAmountPotential) : undefined
  }));
}

// Schedule operations
export async function getSchedules(): Promise<Schedule[]> {
  if (USE_MOCK_DATA) {
    const drivers = generateMockDrivers(25);
    return generateMockSchedules(drivers);
  }
  
  const schedules = await prisma.schedule.findMany({
    orderBy: { shiftDate: 'desc' }
  });
  
  return schedules.map(s => ({
    schedule_id: s.scheduleId,
    driver_id: s.driverId,
    shift_date: s.shiftDate.toISOString(),
    shift_start: s.shiftStart.toISOString(),
    shift_end: s.shiftEnd.toISOString(),
    assigned_vehicle: s.assignedVehicle || undefined,
    assigned_route: s.assignedRoute || undefined,
    scheduled_breaks: s.scheduledBreaks
  }));
}

// Discrepancy operations
export async function getDiscrepancies(): Promise<TimecardDiscrepancy[]> {
  if (USE_MOCK_DATA) {
    const drivers = generateMockDrivers(25);
    const routes = generateMockRoutes(drivers);
    const timecards = generateMockTimecards(routes);
    return generateMockDiscrepancies(timecards, routes, drivers);
  }
  
  const discrepancies = await prisma.timecardDiscrepancy.findMany({
    orderBy: { date: 'desc' }
  });
  
  return discrepancies.map(d => ({
    id: d.id,
    driver_id: d.driverId,
    driver_name: d.driverName || undefined,
    date: d.date.toISOString(),
    type: d.type,
    severity: d.severity as 'low' | 'medium' | 'high',
    description: d.description || undefined,
    adp_hours: d.adpHours ? Number(d.adpHours) : undefined,
    amazon_hours: d.amazonHours ? Number(d.amazonHours) : undefined,
    variance: d.variance ? Number(d.variance) : undefined,
    status: d.status,
    resolved_by: d.resolvedBy || undefined,
    resolved_at: d.resolvedAt?.toISOString()
  }));
}

// Update discrepancy status
export async function updateDiscrepancyStatus(
  id: string, 
  status: string, 
  resolvedBy?: string
): Promise<TimecardDiscrepancy> {
  if (USE_MOCK_DATA) {
    // Return mock updated discrepancy
    return {
      id,
      driver_id: 'DRV001',
      driver_name: 'Mock Driver',
      date: new Date().toISOString(),
      type: 'Clock-in Mismatch',
      severity: 'medium',
      status,
      resolved_by: resolvedBy,
      resolved_at: status === 'resolved' ? new Date().toISOString() : undefined
    };
  }
  
  const updated = await prisma.timecardDiscrepancy.update({
    where: { id },
    data: {
      status,
      resolvedBy,
      resolvedAt: status === 'resolved' ? new Date() : null
    }
  });
  
  return {
    id: updated.id,
    driver_id: updated.driverId,
    driver_name: updated.driverName || undefined,
    date: updated.date.toISOString(),
    type: updated.type,
    severity: updated.severity as 'low' | 'medium' | 'high',
    description: updated.description || undefined,
    adp_hours: updated.adpHours ? Number(updated.adpHours) : undefined,
    amazon_hours: updated.amazonHours ? Number(updated.amazonHours) : undefined,
    variance: updated.variance ? Number(updated.variance) : undefined,
    status: updated.status,
    resolved_by: updated.resolvedBy || undefined,
    resolved_at: updated.resolvedAt?.toISOString()
  };
} 