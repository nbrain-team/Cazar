import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import { Activity, MessageSquare, FileText, TrendingUp, Settings, Calendar } from 'lucide-react';
import { HOSRealtimeDashboard } from '../components/HOSRealtimeDashboard';
import { HOSChatPanel } from '../components/HOSChatPanel';
import { HOSSmartScheduler } from '../components/HOSSmartScheduler';
import { HOSViolationAnalytics } from '../components/HOSViolationAnalytics';
import { HOSComplianceReports } from '../components/HOSComplianceReports';
import Hos607Page from './Hos607Page';
import './HOSCompliancePage.css';
import '../components/HOSModule.css';

// Placeholder component for settings
const HOSSettings = () => (
  <div className="hos-settings-placeholder">
    <h3>HOS Settings</h3>
    <p>Coming soon: Configure alert thresholds, notification preferences, and compliance rules.</p>
  </div>
);

export default function HOSCompliancePage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="hos-compliance-page">
      <div className="hos-header">
        <h1>HOS Compliance Center</h1>
        <p>Comprehensive Hours of Service management, violation prevention, and compliance tracking</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="hos-tabs">
        <TabsList className="hos-tabs-list">
            <TabsTrigger value="dashboard" className="hos-tab-trigger">
              <Activity />
              Real-time Dashboard
            </TabsTrigger>
            <TabsTrigger value="grid" className="hos-tab-trigger">
              <FileText />
              60/7 Grid View
            </TabsTrigger>
            <TabsTrigger value="chat" className="hos-tab-trigger">
              <MessageSquare />
              Compliance Assistant
            </TabsTrigger>
            <TabsTrigger value="scheduler" className="hos-tab-trigger">
              <Calendar />
              Smart Scheduler
            </TabsTrigger>
            <TabsTrigger value="analytics" className="hos-tab-trigger">
              <TrendingUp />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="reports" className="hos-tab-trigger">
              <FileText />
              Reports
            </TabsTrigger>
            <TabsTrigger value="settings" className="hos-tab-trigger">
              <Settings />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="hos-tab-content">
            <HOSRealtimeDashboard />
          </TabsContent>

          <TabsContent value="grid" className="hos-tab-content">
            <div className="hos-grid-container">
              <Hos607Page />
            </div>
          </TabsContent>

          <TabsContent value="chat" className="hos-tab-content">
            <div className="hos-chat-grid">
              <div className="hos-chat-main">
                <HOSChatPanel />
              </div>
              <div className="hos-chat-sidebar">
                <div className="hos-stats-card">
                  <h3>Quick Stats</h3>
                  <div className="hos-stats-list">
                    <div className="hos-stat-item">
                      <span className="hos-stat-label">Active Drivers:</span>
                      <span className="hos-stat-value">25</span>
                    </div>
                    <div className="hos-stat-item">
                      <span className="hos-stat-label">Current Violations:</span>
                      <span className="hos-stat-value danger">3</span>
                    </div>
                    <div className="hos-stat-item">
                      <span className="hos-stat-label">At Risk (24h):</span>
                      <span className="hos-stat-value warning">7</span>
                    </div>
                    <div className="hos-stat-item">
                      <span className="hos-stat-label">Compliance Rate:</span>
                      <span className="hos-stat-value success">88%</span>
                    </div>
                  </div>
                </div>
                
                <div className="hos-tips-card">
                  <h4>💡 Pro Tips</h4>
                  <ul className="hos-tips-list">
                    <li>Ask about specific drivers by name</li>
                    <li>Request predictions for upcoming shifts</li>
                    <li>Get explanations of any HOS rule</li>
                    <li>Find optimal driver assignments</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scheduler" className="hos-tab-content">
            <HOSSmartScheduler />
          </TabsContent>

          <TabsContent value="analytics" className="hos-tab-content">
            <HOSViolationAnalytics />
          </TabsContent>

          <TabsContent value="reports" className="hos-tab-content">
            <HOSComplianceReports />
          </TabsContent>

          <TabsContent value="settings" className="hos-tab-content">
            <HOSSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
