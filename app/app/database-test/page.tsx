"use client";

import { useEffect, useState } from "react";
import { useBrowserDatabase } from "@/lib/browser-database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, CheckCircle, XCircle, Loader2, Info } from "lucide-react";

export default function DatabaseTestPage() {
  const [logs, setLogs] = useState<string[]>([]);

  const {
    isInitialized,
    isInitializing,
    error,
    isOpfsSupported,
    init,
    execute,
    query,
  } = useBrowserDatabase({
    dbName: 'tradistry-test-db',
    enablePersistence: true,
    initSql: [
      `CREATE TABLE IF NOT EXISTS test_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        level TEXT DEFAULT 'info',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ],
    autoInit: false // Manual init to see the process
  });

  // Add log function
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev, logMessage]);
    console.log(logMessage);
  };

  // Database initialization logging
  useEffect(() => {
    addLog('🚀 Database test page loaded');
    addLog(`🔧 OPFS Support: ${isOpfsSupported ? 'Available' : 'Not Available'}`);
  }, [isOpfsSupported]);

  useEffect(() => {
    if (isInitializing) {
      addLog('⏳ Database initialization started...');
    }
  }, [isInitializing]);

  useEffect(() => {
    if (isInitialized) {
      addLog('✅ Database initialized successfully!');
      addLog('📊 Database features ready:');
      addLog('  - SQLite WASM engine loaded');
      addLog('  - Test tables created');
      addLog(`  - Storage: ${isOpfsSupported ? 'Persistent (OPFS)' : 'In-memory'}`);
      addLog('  - Ready for operations');
    }
  }, [isInitialized, isOpfsSupported]);

  useEffect(() => {
    if (error) {
      addLog(`❌ Database error: ${error.message}`);
    }
  }, [error]);

  const handleInitDatabase = async () => {
    try {
      addLog('🔄 Manually initializing database...');
      await init();
    } catch (err) {
      addLog(`💥 Manual initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleTestInsert = async () => {
    if (!isInitialized) {
      addLog('⚠️ Database not initialized yet');
      return;
    }

    try {
      addLog('📝 Testing INSERT operation...');
      const result = await execute(
        'INSERT INTO test_table (name, value) VALUES (?, ?)',
        [`Test Entry ${Date.now()}`, `Value ${Math.random().toFixed(4)}`]
      );
      addLog(`✅ INSERT successful - Row ID: ${result.lastInsertRowid}, Changes: ${result.changes}`);
    } catch (err) {
      addLog(`❌ INSERT failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleTestQuery = async () => {
    if (!isInitialized) {
      addLog('⚠️ Database not initialized yet');
      return;
    }

    try {
      addLog('🔍 Testing SELECT query...');
      const result = await query('SELECT * FROM test_table ORDER BY created_at DESC LIMIT 5');
      addLog(`✅ SELECT successful - Found ${result.values.length} rows`);
      
      if (result.values.length > 0) {
        addLog('📋 Recent entries:');
        result.values.forEach((row, index) => {
          addLog(`  ${index + 1}. ID: ${row[0]}, Name: ${row[1]}, Value: ${row[2]}`);
        });
      }
    } catch (err) {
      addLog(`❌ SELECT failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
    addLog('🧹 Logs cleared');
  };

  const getStatusIcon = () => {
    if (isInitializing) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (isInitialized) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (error) return <XCircle className="h-4 w-4 text-red-500" />;
    return <Database className="h-4 w-4 text-gray-500" />;
  };

  const getStatusText = () => {
    if (isInitializing) return "Initializing...";
    if (isInitialized) return "Ready";
    if (error) return "Error";
    return "Not Initialized";
  };

  const getStatusColor = () => {
    if (isInitializing) return "bg-yellow-500";
    if (isInitialized) return "bg-green-500";
    if (error) return "bg-red-500";
    return "bg-gray-500";
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Database className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Browser Database Test</h1>
            <p className="text-muted-foreground">Testing SQLite WASM in browser with logging</p>
          </div>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon()}
              Database Status
            </CardTitle>
            <CardDescription>
              Current state of the SQLite WASM database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
                {getStatusText()}
              </Badge>
              
              <Badge variant={isOpfsSupported ? "default" : "secondary"}>
                OPFS: {isOpfsSupported ? "Supported" : "Not Supported"}
              </Badge>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-700 text-sm">{error.message}</p>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {!isInitialized && !isInitializing && (
                <Button onClick={handleInitDatabase} disabled={isInitializing}>
                  Initialize Database
                </Button>
              )}
              
              {isInitialized && (
                <>
                  <Button onClick={handleTestInsert} variant="outline">
                    Test Insert
                  </Button>
                  <Button onClick={handleTestQuery} variant="outline">
                    Test Query
                  </Button>
                </>
              )}
              
              <Button onClick={handleClearLogs} variant="ghost" size="sm">
                Clear Logs
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Logs Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              Database Logs
            </CardTitle>
            <CardDescription>
              Real-time logging of database operations and status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-950 text-green-400 p-4 rounded-md font-mono text-sm max-h-96 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-gray-500">No logs yet...</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>About This Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Tests SQLite WASM initialization in the browser</p>
            <p>• Demonstrates persistent storage with OPFS when available</p>
            <p>• Shows real-time logging of database operations</p>
            <p>• Creates test tables and performs basic CRUD operations</p>
            <p>• Falls back to in-memory storage if OPFS is not supported</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
