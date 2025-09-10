"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLatestMarketNews } from '@/lib/hooks/use-market-data';
import { Clock } from 'lucide-react';

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
  publishedAt?: string;
}

const NewsItem: React.FC<NewsItemProps> = ({ 
  title, 
  summary, 
  content, 
  publishedAt
}) => {
  const displayText = summary || content || '';
  
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold leading-tight text-white line-clamp-2">
        {title}
      </h3>
      
      {displayText && (
        <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">
          {displayText}
        </p>
      )}
    </div>
  );
};

// Loading skeleton
const NewsItemSkeleton: React.FC = () => (
  <div className="space-y-2">
    <Skeleton className="w-full h-5 bg-gray-700" />
    <Skeleton className="w-full h-4 bg-gray-700" />
    <Skeleton className="w-3/4 h-4 bg-gray-700" />
  </div>
);

// Main component
export const MarketSummary: React.FC = () => {
  const { marketNews, isLoading, error } = useLatestMarketNews(3); // Limit to 3 articles for compact layout

  // Get the most recent update time
  const latestUpdate = marketNews.length > 0 
    ? marketNews[0]?.updated_at || marketNews[0]?.created_at
    : undefined;

  if (error) {
    return (
      <Card className="bg-gray-900 border-gray-700">
        <CardContent className="p-6">
          <Alert variant="destructive" className="bg-red-900/20 border-red-700">
            <AlertDescription className="text-red-300">
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
          <CardTitle className="text-lg font-semibold text-white">Market Summary</CardTitle>
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Clock className="w-3 h-3" />
            <span>Updated {formatTimeAgo(latestUpdate)}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-6">
        {isLoading ? (
          // Loading skeletons
          Array.from({ length: 3 }).map((_, index) => (
            <NewsItemSkeleton key={index} />
          ))
        ) : marketNews.length === 0 ? (
          // No news available
          <div className="text-center py-8 text-gray-400">
            <p>No market news available at the moment.</p>
          </div>
        ) : (
          // Render news items
          marketNews.slice(0, 3).map((news, index) => (
            <NewsItem
              key={news.id || index}
              title={news.title}
              summary={news.summary}
              content={news.content}
              publishedAt={news.published_at || news.updated_at}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default MarketSummary;