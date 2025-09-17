"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  FileTextIcon, 
  CalendarIcon, 
  ClockIcon, 
  TagIcon,
  DownloadIcon,
  ShareIcon,
  EditIcon
} from 'lucide-react';
import { format } from 'date-fns';
import type { AIReport } from '@/lib/services/ai-reports-service';

interface ReportDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: AIReport | null;
}

export function ReportDetailsDialog({ 
  open, 
  onOpenChange, 
  report 
}: ReportDetailsDialogProps) {
  const [activeTab, setActiveTab] = useState('content');

  if (!report) return null;

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'PPP p');
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'processing':
        return 'outline';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const renderMetadata = () => {
    if (!report.metadata) return null;

    return (
      <div className="space-y-4">
        {Object.entries(report.metadata).map(([key, value]) => (
          <div key={key} className="grid grid-cols-3 gap-4">
            <div className="font-medium capitalize">{key.replace(/_/g, ' ')}:</div>
            <div className="col-span-2 text-muted-foreground">
              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <DialogTitle className="text-xl">{report.title}</DialogTitle>
              <DialogDescription>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <CalendarIcon className="h-4 w-4" />
                    {formatDate(report.created_at)}
                  </div>
                  {report.updated_at && (
                    <div className="flex items-center gap-1">
                      <ClockIcon className="h-4 w-4" />
                      Updated {formatDate(report.updated_at)}
                    </div>
                  )}
                </div>
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getStatusColor(report.status)}>
                {report.status}
              </Badge>
              <Badge variant="outline">
                {report.report_type}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden mt-4">
              <TabsContent value="content" className="h-full">
                <ScrollArea className="h-[60vh]">
                  <div className="prose prose-sm max-w-none">
                    {report.content ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {report.content}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <FileTextIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No content available for this report.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="details" className="h-full">
                <ScrollArea className="h-[60vh]">
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Report Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium">Report ID</label>
                            <p className="text-sm text-muted-foreground font-mono">{report.id}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium">User ID</label>
                            <p className="text-sm text-muted-foreground font-mono">{report.user_id}</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium">Status</label>
                            <div className="mt-1">
                              <Badge variant={getStatusColor(report.status)}>
                                {report.status}
                              </Badge>
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Report Type</label>
                            <div className="mt-1">
                              <Badge variant="outline">
                                {report.report_type}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {(report.time_range || report.custom_start_date || report.custom_end_date) && (
                          <div>
                            <label className="text-sm font-medium">Time Range</label>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {report.time_range ? (
                                <span className="capitalize">{report.time_range.replace(/(\d+)([a-z])/g, '$1 $2')}</span>
                              ) : (
                                <span>
                                  {report.custom_start_date && format(new Date(report.custom_start_date), 'PPP')}
                                  {report.custom_start_date && report.custom_end_date && ' - '}
                                  {report.custom_end_date && format(new Date(report.custom_end_date), 'PPP')}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Timestamps</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Created</label>
                          <p className="text-sm text-muted-foreground">{formatDate(report.created_at)}</p>
                        </div>
                        {report.updated_at && (
                          <div>
                            <label className="text-sm font-medium">Last Updated</label>
                            <p className="text-sm text-muted-foreground">{formatDate(report.updated_at)}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="metadata" className="h-full">
                <ScrollArea className="h-[60vh]">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Report Metadata</CardTitle>
                      <CardDescription>
                        Additional data and configuration used for this report
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {report.metadata ? (
                        renderMetadata()
                      ) : (
                        <div className="text-center text-muted-foreground py-8">
                          <TagIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No metadata available for this report.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <Separator />

        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <EditIcon className="h-4 w-4 mr-2" />
              Edit Report
            </Button>
            <Button variant="outline" size="sm">
              <ShareIcon className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <DownloadIcon className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
