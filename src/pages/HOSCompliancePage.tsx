import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import { Activity, MessageSquare, FileText, TrendingUp, Settings, Calendar } from 'lucide-react';
import { HOSRealtimeDashboard } from '../components/HOSRealtimeDashboard';
import { HOSChatPanel } from '../components/HOSChatPanel';
import { HOSSmartScheduler } from '../components/HOSSmartScheduler';
import { HOSViolationAnalytics } from '../components/HOSViolationAnalytics';
import { HOSComplianceReports } from '../components/HOSComplianceReports';
import Hos607Page from './Hos607Page';

// Placeholder component for settings
const HOSSettings = () => (
  <div className="p-6 bg-white rounded-lg shadow">
    <h3 className="text-lg font-semibold mb-4">HOS Settings</h3>
    <p className="text-gray-600">Coming soon: Configure alert thresholds, notification preferences, and compliance rules.</p>
  </div>
);

export default function HOSCompliancePage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">HOS Compliance Center</h1>
          <p className="text-gray-600 mt-2">
            Comprehensive Hours of Service management, violation prevention, and compliance tracking
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex space-x-1 rounded-lg bg-gray-100 p-1 mb-6">
            <TabsTrigger
              value="dashboard"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Activity className="w-4 h-4" />
              Real-time Dashboard
            </TabsTrigger>
            <TabsTrigger
              value="grid"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'grid'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              60/7 Grid View
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'chat'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Compliance Assistant
            </TabsTrigger>
            <TabsTrigger
              value="scheduler"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'scheduler'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Smart Scheduler
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'analytics'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger
              value="reports"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'reports'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              Reports
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'settings'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-0">
            <HOSRealtimeDashboard />
          </TabsContent>

          <TabsContent value="grid" className="mt-0">
            <div className="bg-white rounded-lg shadow">
              <Hos607Page />
            </div>
          </TabsContent>

          <TabsContent value="chat" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div className="h-[700px]">
                  <HOSChatPanel />
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Quick Stats</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Active Drivers:</span>
                      <span className="font-medium">25</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Current Violations:</span>
                      <span className="font-medium text-red-600">3</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">At Risk (24h):</span>
                      <span className="font-medium text-orange-600">7</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Compliance Rate:</span>
                      <span className="font-medium text-green-600">88%</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">💡 Pro Tips</h4>
                  <ul className="space-y-2 text-sm text-blue-800">
                    <li>• Ask about specific drivers by name</li>
                    <li>• Request predictions for upcoming shifts</li>
                    <li>• Get explanations of any HOS rule</li>
                    <li>• Find optimal driver assignments</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scheduler" className="mt-0">
            <HOSSmartScheduler />
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            <HOSViolationAnalytics />
          </TabsContent>

          <TabsContent value="reports" className="mt-0">
            <HOSComplianceReports />
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <HOSSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
