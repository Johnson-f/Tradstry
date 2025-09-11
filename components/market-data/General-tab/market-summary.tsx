"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
  const { marketNews, isLoading, error } = useLatestMarketNews(7); // Limit to 7 articles

  // Get the most recent update time
  const latestUpdate = marketNews.length > 0 
    ? marketNews[0]?.updated_at || marketNews[0]?.created_at
    : undefined;

  if (error) {
    return (
      <div className="space-y-4">
        {/* Header outside card */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Market Summary</h2>
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Clock className="w-3 h-3" />
            <span>Updated {formatTimeAgo(latestUpdate)}</span>
          </div>
        </div>
        
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-6">
            <Alert variant="destructive" className="bg-red-900/20 border-red-700">
              <AlertDescription className="text-red-300">
                Failed to load market news: {error.message}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header outside card */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Market Summary</h2>
        <div className="flex items-center gap-1 text-sm text-gray-400">
          <Clock className="w-3 h-3" />
          <span>Updated {formatTimeAgo(latestUpdate)}</span>
        </div>
      </div>
      
      {/* Card with news content */}
      <Card className="bg-gray-900 border-gray-700 text-white">
        <CardContent className="px-10 py-1">
          {isLoading ? (
            // Loading skeletons
            <div className="space-y-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index}>
                  <NewsItemSkeleton />
                  {index < 6 && <Separator className="mt-4 bg-gray-700" />}
                </div>
              ))}
            </div>
          ) : marketNews.length === 0 ? (
            // No news available
            <div className="text-center py-8 text-gray-400">
              <p>No market news available at the moment.</p>
            </div>
          ) : (
            // Render news items with separators
            <div className="space-y-4">
              {marketNews.slice(0, 7).map((news, index) => (
                <div key={news.id || index}>
                  <NewsItem
                    title={news.title}
                    summary={news.summary}
                    content={news.content}
                    publishedAt={news.published_at || news.updated_at}
                  />
                  {index < marketNews.slice(0, 7).length - 1 && (
                    <Separator className="mt-4 bg-gray-700" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketSummary;