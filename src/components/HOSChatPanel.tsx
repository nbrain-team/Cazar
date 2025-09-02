import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, AlertTriangle, CheckCircle, TrendingUp, Clock, HelpCircle } from 'lucide-react';
import { HOSChatService } from '../services/hosChatService';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: any;
  violations?: any[];
  recommendations?: any[];
  suggestions?: string[];
}

interface QuickAction {
  label: string;
  query: string;
  icon: React.ReactNode;
  color: string;
}

export const HOSChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hello! I\'m your HOS compliance assistant. I can help you with:\n\n• Checking driver violations and compliance status\n• Finding available drivers for shifts\n• Explaining HOS regulations\n• Predicting potential violations\n• Optimizing schedules for compliance\n\nWhat would you like to know?',
      timestamp: new Date(),
      suggestions: [
        'Show me current HOS violations',
        'Which drivers are available now?',
        'Explain the 60-hour rule',
        'Who needs a break soon?',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickActions: QuickAction[] = [
    {
      label: 'Check Violations',
      query: 'Show me all current HOS violations',
      icon: <AlertTriangle className="w-4 h-4" />,
      color: 'bg-red-100 text-red-700 hover:bg-red-200',
    },
    {
      label: 'Available Drivers',
      query: 'Which drivers are available to work now?',
      icon: <CheckCircle className="w-4 h-4" />,
      color: 'bg-green-100 text-green-700 hover:bg-green-200',
    },
    {
      label: 'Predictions',
      query: 'Predict violations for the next 24 hours',
      icon: <TrendingUp className="w-4 h-4" />,
      color: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
    },
    {
      label: 'Need Rest',
      query: 'Which drivers need rest breaks?',
      icon: <Clock className="w-4 h-4" />,
      color: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
    },
  ];

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Call the HOS chat service
      const response = await HOSChatService.processQuery(input);
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        data: response.data,
        violations: response.violations,
        recommendations: response.recommendations,
        suggestions: response.suggestions,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const handleQuickAction = (query: string) => {
    setInput(query);
    handleSend();
  };

  const renderViolations = (violations: any[]) => {
    return (
      <div className="mt-3 space-y-2">
        {violations.map((violation, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg border ${
              violation.severity === 'CRITICAL'
                ? 'bg-red-50 border-red-200'
                : violation.severity === 'HIGH'
                ? 'bg-orange-50 border-orange-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                className={`w-4 h-4 mt-0.5 ${
                  violation.severity === 'CRITICAL'
                    ? 'text-red-600'
                    : violation.severity === 'HIGH'
                    ? 'text-orange-600'
                    : 'text-yellow-600'
                }`}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {violation.driverName || 'Driver'} - {violation.type}
                </p>
                <p className="text-sm text-gray-600 mt-1">{violation.message}</p>
                {violation.hoursOver && (
                  <p className="text-xs text-gray-500 mt-1">
                    Exceeded by: {violation.hoursOver.toFixed(1)} hours
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderRecommendations = (recommendations: any[]) => {
    return (
      <div className="mt-3 space-y-2">
        {recommendations.map((rec, index) => (
          <div
            key={index}
            className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
          >
            <p className="text-sm font-medium text-blue-900">{rec.message}</p>
            <p className="text-sm text-blue-700 mt-1">
              <strong>Action:</strong> {rec.action}
            </p>
          </div>
        ))}
      </div>
    );
  };

  const renderData = (data: any) => {
    if (!data) return null;

    // Fleet status data
    if (data.availableDrivers !== undefined) {
      return (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600">Available</p>
            <p className="text-lg font-semibold text-green-600">{data.availableDrivers}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600">Near Limits</p>
            <p className="text-lg font-semibold text-yellow-600">{data.nearingLimits}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600">Need Rest</p>
            <p className="text-lg font-semibold text-orange-600">{data.needingRest}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600">Avg Hours</p>
            <p className="text-lg font-semibold text-gray-700">
              {data.averageHoursUsed?.toFixed(1) || '0'}/60
            </p>
          </div>
        </div>
      );
    }

    // Driver metrics data
    if (data.metrics) {
      const metrics = data.metrics;
      return (
        <div className="mt-3 bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Driver Metrics</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Hours Used (7 days):</span>
              <span className="font-medium">{metrics.hoursUsed.toFixed(1)}/60</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Weekly Available:</span>
              <span className="font-medium text-green-600">
                {metrics.weeklyHoursAvailable.toFixed(1)}h
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Driving Available:</span>
              <span className="font-medium">{metrics.drivingHoursAvailable.toFixed(1)}h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Can Drive:</span>
              <span className="font-medium">
                {metrics.canDrive ? (
                  <span className="text-green-600">Yes</span>
                ) : (
                  <span className="text-red-600">No</span>
                )}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Available drivers list
    if (data.availableNow) {
      return (
        <div className="mt-3 space-y-2">
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-sm font-medium text-green-900 mb-2">
              Available Now ({data.availableNow.length})
            </p>
            <div className="space-y-1">
              {data.availableNow.slice(0, 5).map((item: any, index: number) => (
                <div key={index} className="text-sm text-green-700">
                  {item.driver.driver_name} - {item.hoursAvailable.toFixed(1)}h available
                </div>
              ))}
            </div>
          </div>
          {data.availableSoon && data.availableSoon.length > 0 && (
            <div className="bg-yellow-50 rounded-lg p-3">
              <p className="text-sm font-medium text-yellow-900 mb-2">
                Available Soon ({data.availableSoon.length})
              </p>
              <div className="space-y-1">
                {data.availableSoon.slice(0, 3).map((item: any, index: number) => (
                  <div key={index} className="text-sm text-yellow-700">
                    {item.driver.driver_name} - Available in {item.availableIn.toFixed(1)}h
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">HOS Compliance Assistant</h3>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-6 py-3 border-b border-gray-200">
        <div className="flex gap-2 flex-wrap">
          {quickActions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleQuickAction(action.query)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${action.color}`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : ''}`}
          >
            {message.type === 'assistant' && (
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            )}
            <div
              className={`max-w-3xl ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white rounded-lg px-4 py-2'
                  : 'flex-1'
              }`}
            >
              <p className={`text-sm whitespace-pre-wrap ${
                message.type === 'assistant' ? 'text-gray-800' : ''
              }`}>
                {message.content}
              </p>
              
              {/* Render additional data for assistant messages */}
              {message.type === 'assistant' && (
                <>
                  {message.violations && renderViolations(message.violations)}
                  {message.recommendations && renderRecommendations(message.recommendations)}
                  {message.data && renderData(message.data)}
                  
                  {/* Suggestions */}
                  {message.suggestions && message.suggestions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              
              <p className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
            {message.type === 'user' && (
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-600" />
                </div>
              </div>
            )}
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <Bot className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="animate-pulse flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about HOS compliance, violations, or regulations..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <HelpCircle className="w-3 h-3" />
          <span>
            Ask questions like "Who has violations?", "Which drivers can work tomorrow?", or "Explain the 30-minute break rule"
          </span>
        </div>
      </div>
    </div>
  );
};
