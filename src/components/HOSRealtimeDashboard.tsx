import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle, TrendingUp, Users, Activity, AlertCircle } from 'lucide-react';
import { DatabaseService } from '../services/database';
import { HOSChatService } from '../services/hosChatService';
import type { Driver } from '../types';

interface DriverHOSStatus {
  driver: Driver;
  hoursUsed: number;
  weeklyHoursAvailable: number;
  drivingHoursAvailable: number;
  onDutyHoursAvailable: number;
  status: 'available' | 'limited' | 'rest_required' | 'violation';
  statusColor: string;
  nextBreakIn: number | null;
  violations: any[];
  lastActivity: string;
}

interface FleetMetrics {
  totalDrivers: number;
  availableDrivers: number;
  limitedDrivers: number;
  restRequiredDrivers: number;
  violationDrivers: number;
  averageHoursUsed: number;
  predictedViolations24h: number;
}

export const HOSRealtimeDashboard: React.FC = () => {
  const [driverStatuses, setDriverStatuses] = useState<DriverHOSStatus[]>([]);
  const [fleetMetrics, setFleetMetrics] = useState<FleetMetrics | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverHOSStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<'all' | 'available' | 'warning' | 'violation'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadDashboardData();
    // Refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const drivers = await DatabaseService.getDrivers();
      const timecards = await DatabaseService.getTimecards();
      const schedules = await DatabaseService.getSchedules();
      
      const statuses: DriverHOSStatus[] = [];
      let availableCount = 0;
      let limitedCount = 0;
      let restRequiredCount = 0;
      let violationCount = 0;
      let totalHours = 0;
      let predictedViolations = 0;

      // Process each driver
      for (const driver of drivers) {
        if (driver.driver_status !== 'active') continue;

        // Get driver's HOS status (using mock data for now)
        const hoursUsed = Math.random() * 65; // Mock data
        const weeklyAvailable = Math.max(0, 60 - hoursUsed);
        const drivingAvailable = Math.random() * 11;
        const onDutyAvailable = Math.random() * 14;
        const violations = hoursUsed > 60 ? [{
          type: 'WEEKLY_60_HOUR',
          severity: 'CRITICAL',
          message: `${hoursUsed.toFixed(1)} hours in 7 days`,
        }] : [];

        // Determine status
        let status: DriverHOSStatus['status'] = 'available';
        let statusColor = 'text-green-600';
        
        if (violations.length > 0) {
          status = 'violation';
          statusColor = 'text-red-600';
          violationCount++;
        } else if (weeklyAvailable < 10 || drivingAvailable < 2) {
          status = 'rest_required';
          statusColor = 'text-orange-600';
          restRequiredCount++;
        } else if (weeklyAvailable < 20) {
          status = 'limited';
          statusColor = 'text-yellow-600';
          limitedCount++;
        } else {
          availableCount++;
        }

        totalHours += hoursUsed;

        // Check for predicted violations
        if (weeklyAvailable < 10 && weeklyAvailable > 0) {
          predictedViolations++;
        }

        statuses.push({
          driver,
          hoursUsed,
          weeklyHoursAvailable: weeklyAvailable,
          drivingHoursAvailable: drivingAvailable,
          onDutyHoursAvailable: onDutyAvailable,
          status,
          statusColor,
          nextBreakIn: drivingAvailable > 7 ? null : 8 - drivingAvailable,
          violations,
          lastActivity: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      setDriverStatuses(statuses);
      setFleetMetrics({
        totalDrivers: statuses.length,
        availableDrivers: availableCount,
        limitedDrivers: limitedCount,
        restRequiredDrivers: restRequiredCount,
        violationDrivers: violationCount,
        averageHoursUsed: statuses.length > 0 ? totalHours / statuses.length : 0,
        predictedViolations24h: predictedViolations,
      });
      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setLoading(false);
    }
  };

  const getStatusIcon = (status: DriverHOSStatus['status']) => {
    switch (status) {
      case 'available':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'limited':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'rest_required':
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'violation':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
    }
  };

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-600';
    if (percentage >= 75) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const filteredDrivers = driverStatuses
    .filter(d => {
      if (filter === 'available' && d.status !== 'available') return false;
      if (filter === 'warning' && !['limited', 'rest_required'].includes(d.status)) return false;
      if (filter === 'violation' && d.status !== 'violation') return false;
      return true;
    })
    .filter(d => 
      searchTerm === '' || 
      d.driver.driver_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">HOS Real-time Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={loadDashboardData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Fleet Overview Cards */}
      {fleetMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Available Drivers</p>
                <p className="text-2xl font-bold text-green-600">{fleetMetrics.availableDrivers}</p>
                <p className="text-xs text-gray-500 mt-1">Can drive full shifts</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Limited Hours</p>
                <p className="text-2xl font-bold text-yellow-600">{fleetMetrics.limitedDrivers}</p>
                <p className="text-xs text-gray-500 mt-1">Less than 20 hours available</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-600 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Rest Required</p>
                <p className="text-2xl font-bold text-orange-600">{fleetMetrics.restRequiredDrivers}</p>
                <p className="text-xs text-gray-500 mt-1">Need immediate rest</p>
              </div>
              <Clock className="h-8 w-8 text-orange-600 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Violations</p>
                <p className="text-2xl font-bold text-red-600">{fleetMetrics.violationDrivers}</p>
                <p className="text-xs text-gray-500 mt-1">Active HOS violations</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600 opacity-20" />
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search drivers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('available')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'available' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Available
            </button>
            <button
              onClick={() => setFilter('warning')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'warning' 
                  ? 'bg-yellow-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Warning
            </button>
            <button
              onClick={() => setFilter('violation')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'violation' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Violations
            </button>
          </div>
        </div>
      </div>

      {/* Driver Status Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Driver Status</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hours Used (7 days)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Available Hours
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driving Time Left
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Next Break
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDrivers.map((driverStatus) => {
                const hoursUsedPercentage = (driverStatus.hoursUsed / 60) * 100;
                return (
                  <tr key={driverStatus.driver.driver_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {driverStatus.driver.driver_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {driverStatus.driver.driver_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(driverStatus.status)}
                        <span className={`text-sm font-medium ${driverStatus.statusColor}`}>
                          {driverStatus.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-32">
                        <div className="flex justify-between text-sm mb-1">
                          <span>{driverStatus.hoursUsed.toFixed(1)}h</span>
                          <span className="text-gray-500">/ 60h</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getProgressBarColor(hoursUsedPercentage)}`}
                            style={{ width: `${Math.min(100, hoursUsedPercentage)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${
                        driverStatus.weeklyHoursAvailable < 10 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {driverStatus.weeklyHoursAvailable.toFixed(1)}h
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm ${
                        driverStatus.drivingHoursAvailable < 2 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {driverStatus.drivingHoursAvailable.toFixed(1)}h
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {driverStatus.nextBreakIn ? (
                        <span className="text-sm text-orange-600">
                          {driverStatus.nextBreakIn.toFixed(1)}h
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => setSelectedDriver(driverStatus)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Driver Detail Modal */}
      {selectedDriver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedDriver.driver.driver_name}
                  </h3>
                  <p className="text-sm text-gray-500">ID: {selectedDriver.driver.driver_id}</p>
                </div>
                <button
                  onClick={() => setSelectedDriver(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>

              <div className="space-y-4">
                {/* Status Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Current Status</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusIcon(selectedDriver.status)}
                        <span className={`font-medium ${selectedDriver.statusColor}`}>
                          {selectedDriver.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Last Activity</p>
                      <p className="font-medium mt-1">
                        {new Date(selectedDriver.lastActivity).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Hours Details */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Hours of Service</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Weekly Hours (60h limit)</span>
                        <span>{selectedDriver.hoursUsed.toFixed(1)}h / 60h</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${getProgressBarColor((selectedDriver.hoursUsed / 60) * 100)}`}
                          style={{ width: `${Math.min(100, (selectedDriver.hoursUsed / 60) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Daily Driving (11h limit)</span>
                        <span>{(11 - selectedDriver.drivingHoursAvailable).toFixed(1)}h / 11h</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${getProgressBarColor(((11 - selectedDriver.drivingHoursAvailable) / 11) * 100)}`}
                          style={{ width: `${Math.min(100, ((11 - selectedDriver.drivingHoursAvailable) / 11) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>On-Duty Time (14h limit)</span>
                        <span>{(14 - selectedDriver.onDutyHoursAvailable).toFixed(1)}h / 14h</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${getProgressBarColor(((14 - selectedDriver.onDutyHoursAvailable) / 14) * 100)}`}
                          style={{ width: `${Math.min(100, ((14 - selectedDriver.onDutyHoursAvailable) / 14) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Violations */}
                {selectedDriver.violations.length > 0 && (
                  <div className="bg-red-50 rounded-lg p-4">
                    <h4 className="font-semibold text-red-900 mb-2">Active Violations</h4>
                    <ul className="space-y-2">
                      {selectedDriver.violations.map((violation, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                          <div>
                            <p className="text-sm text-red-900 font-medium">{violation.type}</p>
                            <p className="text-sm text-red-700">{violation.message}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Recommendations</h4>
                  <ul className="space-y-2 text-sm text-blue-800">
                    {selectedDriver.weeklyHoursAvailable < 10 && (
                      <li>• Schedule rest day to rebuild hour capacity</li>
                    )}
                    {selectedDriver.nextBreakIn && selectedDriver.nextBreakIn < 2 && (
                      <li>• Plan for 30-minute break within {selectedDriver.nextBreakIn.toFixed(1)} hours</li>
                    )}
                    {selectedDriver.hoursUsed > 50 && (
                      <li>• Consider 34-hour restart to reset weekly hours</li>
                    )}
                    {selectedDriver.violations.length === 0 && selectedDriver.weeklyHoursAvailable > 20 && (
                      <li>• Driver is in good standing with ample hours available</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedDriver(null)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  View Full History
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Predictions Alert */}
      {fleetMetrics && fleetMetrics.predictedViolations24h > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-orange-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-900">
                Violation Risk Alert
              </p>
              <p className="text-sm text-orange-700 mt-1">
                {fleetMetrics.predictedViolations24h} drivers are predicted to exceed HOS limits within 24 hours if current schedules are maintained.
              </p>
            </div>
            <button className="text-sm font-medium text-orange-600 hover:text-orange-700">
              View Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
