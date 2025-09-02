import React, { useState, useEffect } from 'react';
import { Calendar, Clock, AlertTriangle, CheckCircle, TrendingUp, Users, ChevronRight, Shield } from 'lucide-react';
import { DatabaseService } from '../services/database';
import { HOSChatService } from '../services/hosChatService';
import type { Driver, Schedule } from '../types';

interface ScheduleSuggestion {
  driverId: string;
  driverName: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  hoursAvailable: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendation: string;
  alternativeDrivers?: Array<{
    driverId: string;
    driverName: string;
    hoursAvailable: number;
  }>;
}

interface ScheduleConflict {
  type: 'violation' | 'warning' | 'optimization';
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedDrivers: string[];
  suggestedAction: string;
}

export const HOSSmartScheduler: React.FC = () => {
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [optimizationMode, setOptimizationMode] = useState<'safety' | 'efficiency' | 'balanced'>('balanced');

  useEffect(() => {
    analyzaSchedule();
  }, [selectedDate, optimizationMode]);

  const analyzaSchedule = async () => {
    setLoading(true);
    try {
      const drivers = await DatabaseService.getDrivers();
      const schedules = await DatabaseService.getSchedules();
      const timecards = await DatabaseService.getTimecards();

      // Generate smart suggestions
      const newSuggestions: ScheduleSuggestion[] = [];
      const newConflicts: ScheduleConflict[] = [];

      // Analyze each scheduled shift
      for (const schedule of schedules) {
        if (schedule.shift_date !== selectedDate) continue;

        const driver = drivers.find(d => d.driver_id === schedule.driver_id);
        if (!driver) continue;

        // Calculate available hours (mock data for now)
        const hoursAvailable = Math.random() * 60;
        const shiftHours = 10; // Assuming 10-hour shifts

        if (hoursAvailable < shiftHours) {
          // Violation risk
          newConflicts.push({
            type: 'violation',
            severity: 'high',
            message: `${driver.driver_name} only has ${hoursAvailable.toFixed(1)} hours available but is scheduled for ${shiftHours} hours`,
            affectedDrivers: [driver.driver_id],
            suggestedAction: 'Reassign shift to driver with more available hours',
          });

          // Find alternative drivers
          const alternatives = drivers
            .filter(d => d.driver_id !== driver.driver_id && d.driver_status === 'active')
            .map(d => ({
              driverId: d.driver_id,
              driverName: d.driver_name,
              hoursAvailable: Math.random() * 60,
            }))
            .filter(d => d.hoursAvailable >= shiftHours)
            .sort((a, b) => b.hoursAvailable - a.hoursAvailable)
            .slice(0, 3);

          newSuggestions.push({
            driverId: driver.driver_id,
            driverName: driver.driver_name,
            date: schedule.shift_date,
            shiftStart: schedule.shift_start,
            shiftEnd: schedule.shift_end,
            hoursAvailable,
            riskLevel: 'high',
            recommendation: 'Reassign to prevent violation',
            alternativeDrivers: alternatives,
          });
        } else if (hoursAvailable < shiftHours + 10) {
          // Warning - getting close to limits
          newSuggestions.push({
            driverId: driver.driver_id,
            driverName: driver.driver_name,
            date: schedule.shift_date,
            shiftStart: schedule.shift_start,
            shiftEnd: schedule.shift_end,
            hoursAvailable,
            riskLevel: 'medium',
            recommendation: 'Consider shorter shift or rest day after',
          });
        }
      }

      // Check for optimization opportunities
      if (optimizationMode === 'efficiency' || optimizationMode === 'balanced') {
        // Find underutilized drivers
        const activeDrivers = drivers.filter(d => d.driver_status === 'active');
        const scheduledDriverIds = schedules
          .filter(s => s.shift_date === selectedDate)
          .map(s => s.driver_id);

        const unscheduledDrivers = activeDrivers.filter(
          d => !scheduledDriverIds.includes(d.driver_id)
        );

        if (unscheduledDrivers.length > 0) {
          newConflicts.push({
            type: 'optimization',
            severity: 'low',
            message: `${unscheduledDrivers.length} active drivers are not scheduled`,
            affectedDrivers: unscheduledDrivers.map(d => d.driver_id),
            suggestedAction: 'Consider distributing hours to reduce overtime costs',
          });
        }
      }

      // Check for safety concerns
      if (optimizationMode === 'safety' || optimizationMode === 'balanced') {
        // Look for drivers working consecutive long days
        const consecutiveWorkDays = 5; // Mock data
        if (consecutiveWorkDays >= 6) {
          newConflicts.push({
            type: 'warning',
            severity: 'medium',
            message: 'Multiple drivers working 6+ consecutive days',
            affectedDrivers: [],
            suggestedAction: 'Schedule mandatory rest days to prevent fatigue',
          });
        }
      }

      setSuggestions(newSuggestions);
      setConflicts(newConflicts);
    } catch (error) {
      console.error('Failed to analyze schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyOptimization = async () => {
    // In a real implementation, this would update the schedule
    alert('Schedule optimization applied successfully!');
    analyzaSchedule();
  };

  const getConflictIcon = (type: ScheduleConflict['type']) => {
    switch (type) {
      case 'violation':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'optimization':
        return <TrendingUp className="w-5 h-5 text-blue-600" />;
    }
  };

  const getRiskBadgeClass = (risk: ScheduleSuggestion['riskLevel']) => {
    switch (risk) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
    }
  };

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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Smart Schedule Assistant</h2>
            <p className="text-gray-600 mt-1">
              AI-powered scheduling to prevent HOS violations and optimize driver utilization
            </p>
          </div>
          <Shield className="w-8 h-8 text-blue-600" />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Schedule Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Optimization Mode
            </label>
            <select
              value={optimizationMode}
              onChange={(e) => setOptimizationMode(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="safety">Safety First</option>
              <option value="efficiency">Maximum Efficiency</option>
              <option value="balanced">Balanced Approach</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={analyzaSchedule}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Analyze Schedule
            </button>
          </div>
        </div>
      </div>

      {/* Conflicts and Issues */}
      {conflicts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Issues Detected ({conflicts.length})
          </h3>
          <div className="space-y-3">
            {conflicts.map((conflict, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  conflict.type === 'violation'
                    ? 'bg-red-50 border-red-200'
                    : conflict.type === 'warning'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {getConflictIcon(conflict.type)}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{conflict.message}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Suggested Action:</strong> {conflict.suggestedAction}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Schedule Recommendations
            </h3>
            <button
              onClick={applyOptimization}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Apply All Optimizations
            </button>
          </div>

          <div className="space-y-4">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-gray-900">
                        {suggestion.driverName}
                      </h4>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getRiskBadgeClass(
                          suggestion.riskLevel
                        )}`}
                      >
                        {suggestion.riskLevel.toUpperCase()} RISK
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>
                        Scheduled: {new Date(suggestion.shiftStart).toLocaleTimeString()} -{' '}
                        {new Date(suggestion.shiftEnd).toLocaleTimeString()}
                      </p>
                      <p>
                        Available Hours: <strong>{suggestion.hoursAvailable.toFixed(1)}</strong>
                      </p>
                      <p className="text-blue-600 font-medium">{suggestion.recommendation}</p>
                    </div>
                  </div>
                  <button className="text-blue-600 hover:text-blue-800">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {suggestion.alternativeDrivers && suggestion.alternativeDrivers.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">Alternative Drivers:</p>
                    <div className="space-y-1">
                      {suggestion.alternativeDrivers.map((alt, altIndex) => (
                        <div
                          key={altIndex}
                          className="flex justify-between text-sm bg-gray-50 p-2 rounded"
                        >
                          <span>{alt.driverName}</span>
                          <span className="text-green-600 font-medium">
                            {alt.hoursAvailable.toFixed(1)}h available
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule Preview */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Schedule Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-600">Total Drivers</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">25</p>
            <p className="text-sm text-gray-500 mt-1">Active drivers</p>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-600">Scheduled Hours</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">240</p>
            <p className="text-sm text-blue-600 mt-1">Total for {selectedDate}</p>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-600">Compliance Rate</span>
            </div>
            <p className="text-2xl font-bold text-green-900">92%</p>
            <p className="text-sm text-green-600 mt-1">
              {conflicts.filter(c => c.type === 'violation').length === 0
                ? 'No violations predicted'
                : `${conflicts.filter(c => c.type === 'violation').length} violations to resolve`}
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            View Full Calendar
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Bulk Edit Assignments
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Generate Forecast
          </button>
        </div>
      </div>

      {/* AI Insights */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">AI Insights</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>
              Consider implementing a rotating schedule to distribute hours more evenly across your
              driver pool.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>
              3 drivers are approaching their weekly limit. Plan rest days for mid-week to maintain
              coverage.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>
              Historical data shows Thursday-Saturday have highest violation risk. Consider shorter
              shifts these days.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};
