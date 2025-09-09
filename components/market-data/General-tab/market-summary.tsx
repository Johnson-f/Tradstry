"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLatestMarketNews } from '@/lib/hooks/use-market-data';
import { Clock, ExternalLink } from 'lucide-react';

// Format time ago helper
const formatTimeAgo = (dateString?: string) => {
  if (!dateString) return 'Recently';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  
  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
};

// News item component
interface NewsItemProps {
  title: string;
  summary?: string;
  content?: string;
  url?: string;
  publishedAt?: string;
  source?: string;
}

const NewsItem: React.FC<NewsItemProps> = ({ 
  title, 
  summary, 
  content, 
  url, 
  publishedAt, 
  source 
}) => {
  const displayText = summary || content || '';
  const truncatedText = displayText.length > 300 
    ? displayText.substring(0, 300) + '...' 
    : displayText;

  return (
    <div className="space-y-2 pb-4 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-tight text-white">
          {title}
        </h3>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      
      {truncatedText && (
        <p className="text-sm text-gray-300 leading-relaxed">
          {truncatedText}
        </p>
      )}
      
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {source && <span>{source}</span>}
        {source && publishedAt && <span>•</span>}
        {publishedAt && <span>{formatTimeAgo(publishedAt)}</span>}
      </div>
    </div>
  );
};

// Loading skeleton
const NewsItemSkeleton: React.FC = () => (
  <div className="space-y-2 pb-4">
    <Skeleton className="w-full h-5 bg-gray-700" />
    <Skeleton className="w-full h-4 bg-gray-700" />
    <Skeleton className="w-3/4 h-4 bg-gray-700" />
    <Skeleton className="w-1/4 h-3 bg-gray-700" />
  </div>
);

// Main component
export const MarketSummary: React.FC = () => {
  const { marketNews, isLoading, error } = useLatestMarketNews(6); // Limit to 6 articles

  // Get the most recent update time
  const latestUpdate = marketNews.length > 0 
    ? marketNews[0]?.updated_at || marketNews[0]?.created_at
    : undefined;

  if (error) {
    return (
      <Card className="bg-gray-900 border-gray-700">
        <CardContent className="p-6">
          <Alert variant="destructive" className="bg-red-900/20 border-red-700">
            <AlertDescription>
              Failed to load market news: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-700 text-white">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Market Summary</CardTitle>
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Clock className="w-3 h-3" />
            <span>Updated {formatTimeAgo(latestUpdate)}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-4">
          {isLoading ? (
            // Loading skeletons
            Array.from({ length: 4 }).map((_, index) => (
              <NewsItemSkeleton key={index} />
            ))
          ) : marketNews.length === 0 ? (
            // No news available
            <div className="text-center py-8 text-gray-400">
              <p>No market news available at the moment.</p>
            </div>
          ) : (
            // Render news items
            marketNews.map((news, index) => (
              <React.Fragment key={news.id || index}>
                <NewsItem
                  title={news.title}
                  summary={news.summary}
                  content={news.content}
                  url={news.url}
                  publishedAt={news.published_at || news.updated_at}
                  source={news.source}
                />
                {index < marketNews.length - 1 && (
                  <hr className="border-gray-700" />
                )}
              </React.Fragment>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MarketSummary;