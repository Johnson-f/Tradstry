import React from 'react';
import { useAIReports, useReportGeneration } from '@/hooks/use-ai-reports';
import { REPORT_TYPES, TIME_RANGES } from '@/lib/types/ai-reports';
import type { ReportRequest } from '@/lib/types/ai-reports';

/**
 * AI Reports Test Component
 * Demonstrates the complete AI reports integration
 */
export function AIReportsTestComponent() {
  const {
    reports,
    currentReport,
    loading,
    generating,
    error,
    generateReport,
    generateReportAsync,
    getReports,
    getReport,
    deleteReport,
    refreshReports,
    clearError,
    clearCurrentReport,
  } = useAIReports();

  const {
    isPolling,
    currentTaskId,
    progress,
    startGeneration,
    stopPolling,
  } = useReportGeneration();

  const handleGenerateReport = async () => {
    const request: ReportRequest = {
      time_range: '30d',
      report_type: 'comprehensive',
      sections: ['summary', 'analytics', 'insights', 'recommendations'],
    };

    try {
      await generateReport(request);
    } catch (error) {
      console.error('Failed to generate report:', error);
    }
  };

  const handleGenerateReportAsync = async () => {
    const request: ReportRequest = {
      time_range: '30d',
      report_type: 'performance',
      sections: ['summary', 'analytics', 'performance_metrics'],
    };

    try {
      const taskId = await generateReportAsync(request);
      console.log('Started async generation with task ID:', taskId);
    } catch (error) {
      console.error('Failed to start async generation:', error);
    }
  };

  const handleStartGenerationWithPolling = async () => {
    const request: ReportRequest = {
      time_range: '90d',
      report_type: 'risk',
      sections: ['summary', 'risk_analysis', 'recommendations'],
    };

    try {
      await startGeneration(request, (report) => {
        console.log('Report generation completed:', report.title);
      });
    } catch (error) {
      console.error('Failed to generate report with polling:', error);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">AI Reports Integration Test</h1>
      
      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error:</p>
          <p>{error.message}</p>
          <button 
            onClick={clearError}
            className="mt-2 bg-red-500 text-white px-3 py-1 rounded text-sm"
          >
            Clear Error
          </button>
        </div>
      )}

      {/* Loading States */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className={`px-3 py-1 rounded text-sm ${loading ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
            Loading: {loading ? 'Yes' : 'No'}
          </div>
          <div className={`px-3 py-1 rounded text-sm ${generating ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
            Generating: {generating ? 'Yes' : 'No'}
          </div>
          <div className={`px-3 py-1 rounded text-sm ${isPolling ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
            Polling: {isPolling ? 'Yes' : 'No'}
          </div>
        </div>
        
        {isPolling && (
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">
              Task ID: {currentTaskId} | Progress: {progress}%
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          onClick={handleGenerateReport}
          disabled={generating || loading}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
        >
          Generate Report (Sync)
        </button>
        
        <button
          onClick={handleGenerateReportAsync}
          disabled={generating || loading}
          className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
        >
          Generate Report (Async)
        </button>
        
        <button
          onClick={handleStartGenerationWithPolling}
          disabled={generating || loading || isPolling}
          className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
        >
          Generate with Polling
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => getReports()}
          disabled={loading}
          className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
        >
          Refresh Reports
        </button>
        
        <button
          onClick={stopPolling}
          disabled={!isPolling}
          className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
        >
          Stop Polling
        </button>
      </div>

      {/* Reports List */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Reports ({reports.length})</h2>
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{report.title}</h3>
                  <p className="text-gray-600 text-sm">
                    {REPORT_TYPES[report.report_type]} • {TIME_RANGES[report.time_range]}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">{report.summary}</p>
                  <div className="flex gap-4 mt-2 text-sm text-gray-600">
                    <span>Trades: {report.trade_count}</span>
                    <span>PnL: ${report.total_pnl.toFixed(2)}</span>
                    <span>Win Rate: {(report.win_rate * 100).toFixed(1)}%</span>
                    <span>Risk Score: {report.risk_score.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => getReport(report.id)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                  >
                    View
                  </button>
                  <button
                    onClick={() => deleteReport(report.id)}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Report Details */}
      {currentReport && (
        <div className="border rounded-lg p-6 bg-white shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-semibold">{currentReport.title}</h2>
            <button
              onClick={clearCurrentReport}
              className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
            >
              Close
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Summary</h3>
              <p className="text-gray-700">{currentReport.summary}</p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Analytics</h3>
              <div className="space-y-1 text-sm">
                <div>Total Trades: {currentReport.analytics.total_trades}</div>
                <div>Win Rate: {(currentReport.analytics.win_rate * 100).toFixed(1)}%</div>
                <div>Total PnL: ${currentReport.analytics.total_pnl.toFixed(2)}</div>
                <div>Profit Factor: {currentReport.analytics.profit_factor.toFixed(2)}</div>
              </div>
            </div>
          </div>
          
          <div className="mt-6">
            <h3 className="font-semibold mb-2">Recommendations</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              {currentReport.recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

