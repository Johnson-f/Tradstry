"use client";

import React, { useState } from 'react';
import { useAIInsights } from '@/hooks/use-ai-insights';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchIcon, BrainIcon, TrashIcon, EditIcon, RefreshCwIcon } from 'lucide-react';

export function InsightsManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  
  const {
    insights,
    insightsLoading,
    deleteInsight,
    generateInsights,
    refetchInsights
  } = useAIInsights({ insightsParams: { limit: 50 } });

  const handleDeleteInsight = (insightId: string) => {
    if (confirm('Delete this insight?')) {
      deleteInsight.mutate({ insightId, softDelete: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold">Insights Management</h3>
          <p className="text-muted-foreground">Manage your AI trading insights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refetchInsights}>
            <RefreshCwIcon className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => generateInsights.mutate({})}>
            <BrainIcon className="h-4 w-4 mr-2" />
            Generate
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Search insights..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button>
              <SearchIcon className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Insights ({insights.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {insightsLoading ? (
            <div>Loading...</div>
          ) : insights.length === 0 ? (
            <div className="text-center py-8">
              <BrainIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p>No insights yet. Generate some to get started!</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4">
                {insights.map((insight) => (
                  <div key={insight.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex gap-2">
                        <Badge variant={insight.priority === 'high' ? 'destructive' : 'default'}>
                          {insight.priority}
                        </Badge>
                        <Badge variant="outline">{insight.insight_type}</Badge>
                        {insight.actionable && <Badge>Actionable</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <EditIcon className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteInsight(insight.id)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm">{insight.content}</p>
                    <div className="text-xs text-muted-foreground mt-2">
                      {new Date(insight.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
