"use client";

import React from 'react';
import { useLatestSymbolNews } from '@/lib/hooks/use-market-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, ExternalLink, TrendingUp } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface RecentDevelopmentsProps {
  symbol: string;
  className?: string;
}

interface NewsItemProps {
  title: string;
  summary?: string;
  publishedAt: string;
  newsUrl?: string;
  sourceName?: string;
  sentimentScore?: number;
}

const NewsItem = ({ title, summary, publishedAt, newsUrl, sourceName, sentimentScore }: NewsItemProps) => {
  const formatTimeAgo = (dateString: string): string => {
    try {
      const date = parseISO(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Recently';
    }
  };

  const getSentimentIcon = (score?: number) => {
    if (!score) return <TrendingUp className="h-4 w-4 text-gray-400" />;
    
    if (score > 0.1) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (score < -0.1) return <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />;
    return <TrendingUp className="h-4 w-4 text-gray-400" />;
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
  };

  return (
    <div className="group cursor-pointer">
      <div 
        className="p-4 rounded-lg bg-gray-800/50 hover:bg-gray-800/70 transition-colors border border-gray-700/50 hover:border-gray-600/50"
        onClick={() => newsUrl && window.open(newsUrl, '_blank')}
      >
        {/* Header with icon and timestamp */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            {getSentimentIcon(sentimentScore)}
            <span className="text-xs text-cyan-400 font-medium">
              {formatTimeAgo(publishedAt)}
            </span>
          </div>
          {newsUrl && (
            <ExternalLink className="h-3 w-3 text-gray-500 group-hover:text-gray-400 transition-colors" />
          )}
        </div>

        {/* Title */}
        <h3 className="text-white font-medium text-sm leading-tight mb-2 group-hover:text-cyan-50 transition-colors">
          {truncateText(title, 80)}
        </h3>

        {/* Summary/Description */}
        {summary && (
          <p className="text-gray-400 text-xs leading-relaxed mb-3">
            {truncateText(summary, 150)}
          </p>
        )}

        {/* Source */}
        {sourceName && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {sourceName}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export function RecentDevelopments({ symbol, className = '' }: RecentDevelopmentsProps) {
  const { symbolNews, isLoading, error } = useLatestSymbolNews(symbol, 6);

  const getLastUpdated = (): string => {
    if (!symbolNews || symbolNews.length === 0) return 'Never updated';
    
    try {
      const latestNews = symbolNews[0];
      const publishedDate = parseISO(latestNews.published_at || latestNews.time_published || '');
      return `Updated ${formatDistanceToNow(publishedDate, { addSuffix: true })}`;
    } catch {
      return 'Recently updated';
    }
  };

  if (error) {
    return (
      <Card className={`bg-gray-900 border-gray-800 ${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg font-semibold">Recent Developments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-400 text-sm py-8">
            Error loading news: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-gray-900 border-gray-800 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg font-semibold">
            Recent Developments
          </CardTitle>
          <div className="flex items-center space-x-1 text-gray-500 text-xs">
            <Clock className="h-3 w-3" />
            <span>{getLastUpdated()}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="p-4 rounded-lg bg-gray-800/30 border border-gray-700/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-4 bg-gray-700 rounded w-20"></div>
                    <div className="h-3 bg-gray-700 rounded w-3"></div>
                  </div>
                  <div className="h-4 bg-gray-700 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-700 rounded w-3/4 mb-3"></div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-700 rounded w-full"></div>
                    <div className="h-3 bg-gray-700 rounded w-5/6"></div>
                    <div className="h-3 bg-gray-700 rounded w-4/6"></div>
                  </div>
                  <div className="h-3 bg-gray-700 rounded w-16 mt-3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : symbolNews && symbolNews.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {symbolNews.slice(0, 6).map((newsItem) => (
              <NewsItem
                key={newsItem.id}
                title={newsItem.title}
                summary={newsItem.title} // Using title as summary since the API might not have separate summary
                publishedAt={newsItem.published_at || newsItem.time_published || ''}
                newsUrl={newsItem.news_url}
                sourceName={newsItem.source_name}
                sentimentScore={newsItem.sentiment_score}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-600" />
            <p className="text-sm">No recent developments available for {symbol}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RecentDevelopments;