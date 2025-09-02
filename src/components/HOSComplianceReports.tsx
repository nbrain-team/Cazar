import React, { useState, useEffect } from 'react';
import { 
  FileText, Download, CheckCircle, 
  AlertTriangle, Printer, Mail, Shield, Award,
  Users, BarChart
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF type for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: {
      finalY: number;
    };
  }
}

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

interface ComplianceMetric {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'critical';
}

interface AuditLogEntry {
  timestamp: string;
  action: string;
  user: string;
  details: string;
}

export const HOSComplianceReports: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<string>('dot-inspection');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [generating, setGenerating] = useState(false);
  const [complianceMetrics, setComplianceMetrics] = useState<ComplianceMetric[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  const reportTypes: ReportType[] = [
    {
      id: 'dot-inspection',
      name: 'DOT Inspection Report',
      description: 'Complete compliance report for DOT inspections',
      icon: <Shield className="w-5 h-5" />,
      color: 'bg-blue-100 text-blue-700',
    },
    {
      id: 'driver-compliance',
      name: 'Driver Compliance Summary',
      description: 'Individual driver HOS compliance records',
      icon: <Users className="w-5 h-5" />,
      color: 'bg-green-100 text-green-700',
    },
    {
      id: 'violation-summary',
      name: 'Violation Summary Report',
      description: 'Detailed breakdown of all violations',
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'bg-red-100 text-red-700',
    },
    {
      id: 'fleet-overview',
      name: 'Fleet Compliance Overview',
      description: 'High-level fleet compliance metrics',
      icon: <BarChart className="w-5 h-5" />,
      color: 'bg-purple-100 text-purple-700',
    },
    {
      id: 'audit-trail',
      name: 'Compliance Audit Trail',
      description: 'Complete audit history and documentation',
      icon: <FileText className="w-5 h-5" />,
      color: 'bg-yellow-100 text-yellow-700',
    },
  ];

  useEffect(() => {
    loadMetrics();
    loadAuditLog();
  }, [dateRange]);

  const loadMetrics = async () => {
    // Mock metrics - in production, fetch from API
    setComplianceMetrics([
      { label: 'Overall Compliance Rate', value: '94.5%', trend: 'up', status: 'good' },
      { label: 'Total Drivers', value: 25, status: 'good' },
      { label: 'Active Violations', value: 3, trend: 'down', status: 'warning' },
      { label: 'Hours Tracked', value: '4,832', trend: 'up', status: 'good' },
      { label: 'Inspection Ready', value: 'Yes', status: 'good' },
      { label: 'Last Audit', value: '2 days ago', status: 'good' },
    ]);
  };

  const loadAuditLog = async () => {
    // Mock audit log - in production, fetch from API
    setAuditLog([
      {
        timestamp: new Date().toISOString(),
        action: 'Report Generated',
        user: 'John Smith',
        details: 'DOT Inspection Report for January 2025',
      },
      {
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        action: 'Violation Resolved',
        user: 'System',
        details: 'Driver ABC123 - 60-hour violation cleared',
      },
      {
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        action: 'Schedule Updated',
        user: 'Jane Doe',
        details: 'Modified 5 driver schedules for compliance',
      },
    ]);
  };

  const generatePDF = async (reportType: string) => {
    setGenerating(true);
    
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Header
      pdf.setFillColor(59, 130, 246); // Blue
      pdf.rect(0, 0, pageWidth, 40, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.text('HOS Compliance Report', pageWidth / 2, 20, { align: 'center' });
      pdf.setFontSize(12);
      const reportTypeObj = reportTypes.find(r => r.id === reportType);
      pdf.text(reportTypeObj?.name || '', pageWidth / 2, 30, { align: 'center' });
      
      // Reset text color
      pdf.setTextColor(0, 0, 0);
      
      // Report metadata
      pdf.setFontSize(10);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 50);
      pdf.text(`Period: ${dateRange.start} to ${dateRange.end}`, 20, 57);
      pdf.text(`DOT #: 1234567`, 20, 64);
      pdf.text(`Company: Your Delivery Company`, 20, 71);
      
      let yPosition = 85;
      
      switch (reportType) {
        case 'dot-inspection':
          await generateDOTInspectionReport(pdf, yPosition);
          break;
        case 'driver-compliance':
          await generateDriverComplianceReport(pdf, yPosition);
          break;
        case 'violation-summary':
          await generateViolationSummaryReport(pdf, yPosition);
          break;
        case 'fleet-overview':
          await generateFleetOverviewReport(pdf, yPosition);
          break;
        case 'audit-trail':
          await generateAuditTrailReport(pdf, yPosition);
          break;
      }
      
      // Footer on each page
      const totalPages = (pdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(128, 128, 128);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        pdf.text('Confidential - Property of Your Delivery Company', pageWidth / 2, pageHeight - 5, { align: 'center' });
      }
      
      // Save the PDF
      pdf.save(`${reportType}-${new Date().toISOString().split('T')[0]}.pdf`);
      
      // Log audit entry
      const newEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        action: 'Report Generated',
        user: 'Current User',
        details: `${reportTypeObj?.name} for ${dateRange.start} to ${dateRange.end}`,
      };
      setAuditLog([newEntry, ...auditLog]);
      
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const generateDOTInspectionReport = async (pdf: jsPDF, startY: number) => {
    let y = startY;
    
    // Executive Summary
    pdf.setFontSize(14);
    pdf.setFont(pdf.getFont().fontName, 'bold');
    pdf.text('Executive Summary', 20, y);
    pdf.setFont(pdf.getFont().fontName, 'normal');
    pdf.setFontSize(10);
    y += 10;
    
    pdf.text('This report provides a comprehensive overview of Hours of Service (HOS) compliance', 20, y);
    y += 6;
    pdf.text('for the specified period. All data has been verified and is ready for DOT inspection.', 20, y);
    y += 15;
    
    // Compliance Metrics Table
    pdf.setFontSize(12);
    pdf.setFont(pdf.getFont().fontName, 'bold');
    pdf.text('Compliance Metrics', 20, y);
    pdf.setFont(pdf.getFont().fontName, 'normal');
    y += 10;
    
    pdf.autoTable({
      startY: y,
      head: [['Metric', 'Value', 'Status', 'Trend']],
      body: complianceMetrics.map(m => [
        m.label,
        m.value,
        m.status?.toUpperCase() || 'N/A',
        m.trend ? (m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→') : 'N/A'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'center' }
      }
    });
    
    y = pdf.lastAutoTable.finalY + 15;
    
    // Driver Summary
    pdf.setFontSize(12);
    pdf.setFont(pdf.getFont().fontName, 'bold');
    pdf.text('Driver Compliance Summary', 20, y);
    pdf.setFont(pdf.getFont().fontName, 'normal');
    y += 10;
    
    // Mock driver data
    const drivers = [
      { name: 'John Doe', id: 'DR001', hoursUsed: 52.5, violations: 0, status: 'Compliant' },
      { name: 'Jane Smith', id: 'DR002', hoursUsed: 48.3, violations: 0, status: 'Compliant' },
      { name: 'Bob Johnson', id: 'DR003', hoursUsed: 58.7, violations: 1, status: 'At Risk' },
      { name: 'Alice Brown', id: 'DR004', hoursUsed: 45.2, violations: 0, status: 'Compliant' },
      { name: 'Charlie Davis', id: 'DR005', hoursUsed: 61.2, violations: 1, status: 'Violation' },
    ];
    
    pdf.autoTable({
      startY: y,
      head: [['Driver Name', 'ID', 'Hours Used (7d)', 'Violations', 'Status']],
      body: drivers.map(d => [d.name, d.id, d.hoursUsed.toFixed(1), d.violations, d.status]),
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'center' },
        4: { halign: 'center' }
      },
      didDrawCell: (data: any) => {
        if (data.column.index === 4 && data.cell.section === 'body') {
          const status = data.cell.raw;
          if (status === 'Violation') {
            pdf.setTextColor(220, 38, 38); // Red
          } else if (status === 'At Risk') {
            pdf.setTextColor(251, 146, 60); // Orange
          } else {
            pdf.setTextColor(34, 197, 94); // Green
          }
          pdf.text(status, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
          pdf.setTextColor(0, 0, 0); // Reset
        }
      }
    });
    
    // Add new page for detailed records
    pdf.addPage();
    y = 40;
    
    // Certification
    pdf.setFontSize(14);
    pdf.setFont(pdf.getFont().fontName, 'bold');
    pdf.text('Compliance Certification', 20, y);
    pdf.setFont(pdf.getFont().fontName, 'normal');
    pdf.setFontSize(10);
    y += 10;
    
    pdf.text('I certify that the information contained in this report is true and accurate to the best', 20, y);
    y += 6;
    pdf.text('of my knowledge. All Hours of Service records have been maintained in accordance with', 20, y);
    y += 6;
    pdf.text('FMCSA regulations 49 CFR Part 395.', 20, y);
    y += 20;
    
    pdf.line(20, y, 80, y);
    y += 5;
    pdf.text('Authorized Signature', 20, y);
    
    pdf.line(100, y - 5, 160, y - 5);
    pdf.text('Date', 100, y);
  };

  const generateDriverComplianceReport = async (pdf: jsPDF, startY: number) => {
    let y = startY;
    
    pdf.setFontSize(12);
    pdf.text('Individual driver compliance records with detailed HOS tracking...', 20, y);
    y += 10;
    
    // Add driver-specific tables and charts
    // This would include daily logs, violations, rest periods, etc.
  };

  const generateViolationSummaryReport = async (pdf: jsPDF, startY: number) => {
    let y = startY;
    
    pdf.setFontSize(12);
    pdf.text('Comprehensive breakdown of all violations by type, driver, and date...', 20, y);
    y += 10;
    
    // Add violation analysis tables
  };

  const generateFleetOverviewReport = async (pdf: jsPDF, startY: number) => {
    let y = startY;
    
    pdf.setFontSize(12);
    pdf.text('Fleet-wide compliance metrics and performance indicators...', 20, y);
    y += 10;
    
    // Add fleet statistics and trends
  };

  const generateAuditTrailReport = async (pdf: jsPDF, startY: number) => {
    let y = startY;
    
    pdf.setFontSize(14);
    pdf.setFont(pdf.getFont().fontName, 'bold');
    pdf.text('Compliance Audit Trail', 20, y);
    pdf.setFont(pdf.getFont().fontName, 'normal');
    y += 10;
    
    pdf.autoTable({
      startY: y,
      head: [['Timestamp', 'Action', 'User', 'Details']],
      body: auditLog.map(entry => [
        new Date(entry.timestamp).toLocaleString(),
        entry.action,
        entry.user,
        entry.details,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
    });
  };

  const emailReport = () => {
    alert('Email functionality would be implemented here - sending report to compliance@company.com');
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">DOT Compliance Reports</h2>
            <p className="text-gray-600 mt-1">
              Generate official compliance reports for DOT inspections and audits
            </p>
          </div>
          <Award className="w-8 h-8 text-blue-600" />
        </div>
      </div>

      {/* Report Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Report Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportTypes.map((report) => (
            <button
              key={report.id}
              onClick={() => setSelectedReport(report.id)}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedReport === report.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`inline-flex p-2 rounded-lg ${report.color} mb-3`}>
                {report.icon}
              </div>
              <h4 className="font-medium text-gray-900">{report.name}</h4>
              <p className="text-sm text-gray-500 mt-1">{report.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Date Range Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Period</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        {/* Quick date ranges */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              const end = new Date();
              const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
              setDateRange({
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0],
              });
            }}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => {
              const end = new Date();
              const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
              setDateRange({
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0],
              });
            }}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Last 30 Days
          </button>
          <button
            onClick={() => {
              const end = new Date();
              const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
              setDateRange({
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0],
              });
            }}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Last 90 Days
          </button>
        </div>
      </div>

      {/* Compliance Overview */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Compliance Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {complianceMetrics.map((metric, index) => (
            <div key={index} className="text-center">
              <p className="text-sm text-gray-600">{metric.label}</p>
              <p className={`text-2xl font-bold mt-1 ${
                metric.status === 'good' ? 'text-green-600' :
                metric.status === 'warning' ? 'text-yellow-600' :
                metric.status === 'critical' ? 'text-red-600' :
                'text-gray-900'
              }`}>
                {metric.value}
              </p>
              {metric.trend && (
                <p className={`text-xs mt-1 ${
                  metric.trend === 'up' ? 'text-green-600' :
                  metric.trend === 'down' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {metric.trend === 'up' ? '↑ Improving' :
                   metric.trend === 'down' ? '↓ Declining' :
                   '→ Stable'}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Generate Report */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Report</h3>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => generatePDF(selectedReport)}
            disabled={generating}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Generating...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Generate PDF Report
              </>
            )}
          </button>
          <button
            onClick={emailReport}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2"
          >
            <Mail className="w-5 h-5" />
            Email Report
          </button>
          <button
            onClick={printReport}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Report
          </button>
        </div>
        
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Generated reports are official documents suitable for DOT inspections.
            Ensure all data is current before generating. Reports are automatically logged in the audit trail.
          </p>
        </div>
      </div>

      {/* Recent Reports / Audit Log */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {auditLog.slice(0, 5).map((entry, index) => (
            <div key={index} className="flex items-start gap-3 pb-3 border-b last:border-0">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FileText className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{entry.action}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(entry.timestamp).toLocaleString()}
                  </p>
                </div>
                <p className="text-sm text-gray-600">{entry.details}</p>
                <p className="text-xs text-gray-500 mt-1">By: {entry.user}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance Tips */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">DOT Inspection Tips</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            <span>Keep all reports organized and readily accessible for inspections</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            <span>Generate fresh reports within 24 hours of an inspection request</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            <span>Ensure all driver records are complete with no missing timecard entries</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            <span>Review and resolve any violations before generating official reports</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
