import { PrismaClient } from '@prisma/client';
import { generateMockDrivers, generateMockRoutes, generateMockTimecards, generateMockDiscrepancies, generateMockSchedules, generateMockScorecards } from '../src/services/mockData';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Clear existing data
  await prisma.timecardDiscrepancy.deleteMany();
  await prisma.scorecard.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.timecard.deleteMany();
  await prisma.route.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.user.deleteMany();

  // Create admin user
  await prisma.user.create({
    data: {
      email: 'admin@cazar.com',
      passwordHash: 'password', // In production, this should be hashed
      name: 'Admin User',
      role: 'admin',
    },
  });

  // Generate and insert mock drivers
  const mockDrivers = generateMockDrivers(25);
  for (const driver of mockDrivers) {
    await prisma.driver.create({
      data: {
        driverId: driver.driver_id,
        driverName: driver.driver_name,
        driverStatus: driver.driver_status,
        employmentStatus: driver.employment_status,
        jobTitle: driver.job_title,
        payType: driver.pay_type,
        payRate: driver.pay_rate,
        department: driver.department,
        location: driver.location,
        email: `${driver.driver_id.toLowerCase()}@cazar.com`,
        phone: `212-555-${Math.floor(Math.random() * 9000) + 1000}`,
        hireDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000 * 3), // Random date within last 3 years
      },
    });
  }

  // Generate and insert routes
  const drivers = await prisma.driver.findMany();
  const mockRoutes = generateMockRoutes(drivers as any);
  
  for (const route of mockRoutes) {
    await prisma.route.create({
      data: {
        routeId: route.route_id,
        routeDate: new Date(route.route_date),
        driverId: route.driver_id,
        routeStartTime: new Date(`2000-01-01T${route.route_start_time}`),
        routeEndTime: new Date(`2000-01-01T${route.route_end_time}`),
        routeCompletionStatus: route.route_completion_status,
        routeLocationId: route.route_location_id,
        vehicleType: route.vehicle_type,
        totalStops: route.total_stops,
        totalPackages: route.total_packages,
        packagesDelivered: route.packages_delivered,
        packagesUndelivered: route.packages_undelivered,
        flexAppCheckInTime: route.flex_app_check_in_time ? new Date(`2000-01-01T${route.flex_app_check_in_time}`) : null,
        flexAppCheckOutTime: route.flex_app_check_out_time ? new Date(`2000-01-01T${route.flex_app_check_out_time}`) : null,
      },
    });
  }

  // Generate and insert timecards
  const routes = await prisma.route.findMany();
  const mockTimecards = generateMockTimecards(routes as any);
  
  for (const timecard of mockTimecards) {
    await prisma.timecard.create({
      data: {
        timecardId: timecard.timecard_id,
        employeeId: timecard.employee_id,
        clockInTime: new Date(timecard.clock_in_time),
        clockOutTime: new Date(timecard.clock_out_time),
        breakStartTime: new Date(timecard.break_start_time),
        breakEndTime: new Date(timecard.break_end_time),
        totalHoursWorked: timecard.total_hours_worked,
        overtimeHours: timecard.overtime_hours,
        shiftId: timecard.shift_id,
        scheduledShiftStart: new Date(timecard.scheduled_shift_start),
        scheduledShiftEnd: new Date(timecard.scheduled_shift_end),
        date: new Date(timecard.date),
      },
    });
  }

  // Generate and insert schedules
  const mockSchedules = generateMockSchedules(drivers as any);
  
  for (const schedule of mockSchedules) {
    await prisma.schedule.create({
      data: {
        scheduleId: schedule.schedule_id,
        driverId: schedule.driver_id,
        shiftDate: new Date(schedule.shift_date),
        shiftStart: new Date(`2000-01-01T${schedule.shift_start}`),
        shiftEnd: new Date(`2000-01-01T${schedule.shift_end}`),
        assignedVehicle: schedule.assigned_vehicle,
        assignedRoute: schedule.assigned_route,
        scheduledBreaks: schedule.scheduled_breaks,
      },
    });
  }

  // Generate and insert scorecards
  const mockScorecards = generateMockScorecards(drivers as any);
  
  for (const scorecard of mockScorecards) {
    await prisma.scorecard.create({
      data: {
        scorecardWeek: new Date(scorecard.scorecard_week),
        driverId: scorecard.driver_id,
        onTimeDeliveryRate: scorecard.on_time_delivery_rate,
        deliveryAttemptRate: scorecard.delivery_attempt_rate,
        safeDrivingScore: scorecard.safe_driving_score,
        customerFeedbackScore: scorecard.customer_feedback_score,
        routeCompletionRate: scorecard.route_completion_rate,
        bonusEligibility: scorecard.bonus_eligibility,
        bonusAmountPotential: scorecard.bonus_amount_potential,
      },
    });
  }

  // Generate and insert discrepancies
  const timecards = await prisma.timecard.findMany();
  const mockDiscrepancies = generateMockDiscrepancies(timecards as any, routes as any, drivers as any);
  
  for (const discrepancy of mockDiscrepancies) {
    await prisma.timecardDiscrepancy.create({
      data: {
        driverId: discrepancy.driver_id,
        driverName: discrepancy.driver_name,
        date: new Date(discrepancy.date),
        type: discrepancy.type,
        severity: discrepancy.severity,
        description: discrepancy.description,
        adpHours: discrepancy.adp_hours,
        amazonHours: discrepancy.amazon_hours,
        variance: discrepancy.variance,
        status: discrepancy.status,
      },
    });
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 