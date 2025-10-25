"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCompanyInfo } from '@/lib/hooks/use-market-data';
import { Building2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeTable } from '@/lib/hooks/useRealtimeUpdates';

interface CompanyInfoCardProps {
  symbol: string;
  dataProvider?: string;
}

// Format functions
const formatMarketCap = (value: number | undefined | null): string => {
  if (!value || value === 0) return 'N/A';
  
  if (value >= 1e12) {
    return `$${(value / 1e12).toFixed(1)}T`;
  } else if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(0)}B`;
  } else if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(0)}M`;
  }
  return `$${value.toFixed(0)}`;
};

const formatEmployeeCount = (count: number | undefined | null): string => {
  if (!count || count === 0) return 'N/A';
  
  if (count >= 1000) {
    return `${Math.round(count / 1000)}K`;
  }
  return count.toString();
};

const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return '--';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
};

// Info row component
interface InfoRowProps {
  label: string;
  value: string | number | undefined | null;
  formatter?: (value: string | number | undefined | null) => string;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, formatter }) => {
  const displayValue = formatter ? formatter(value) : (value?.toString() || '--');
  
  return (
    <div className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700/30 last:border-b-0">
      <span className="text-gray-600 dark:text-gray-400 font-medium text-sm">{label}</span>
      <span className="text-gray-900 dark:text-gray-200 font-medium text-sm text-right max-w-[60%] truncate">
        {displayValue}
      </span>
    </div>
  );
};

// Loading skeleton
const CompanyInfoSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex justify-between items-center py-3">
          <Skeleton className="w-24 h-4" />
          <Skeleton className="w-20 h-4" />
        </div>
      ))}
    </div>
    
    <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700/30">
      <Skeleton className="w-full h-4" />
      <Skeleton className="w-full h-4" />
      <Skeleton className="w-3/4 h-4" />
    </div>
  </div>
);

export const CompanyInfoCard: React.FC<CompanyInfoCardProps> = ({ 
  symbol, 
  dataProvider 
}) => {
  const queryClient = useQueryClient();
  
  // Enable realtime updates for company info
  useRealtimeTable('company_info', queryClient, ['company-info', symbol]);
  
  const [showFullDescription, setShowFullDescription] = useState(false);
  
  const { companyInfo, isLoading, error } = useCompanyInfo(symbol, dataProvider);

  if (error) {
    return (
      <Card className="w-full bg-gray-800/50 border-gray-700/50">
        <CardContent className="p-6">
          <Alert variant="destructive" className="bg-red-900/20 border-red-500/30">
            <AlertDescription className="text-red-300">
              Failed to load company information: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <CompanyInfoSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (!companyInfo) {
    return (
      <Card className="w-full bg-gray-800/50 border-gray-700/50">
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No company information available for {symbol}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const description = companyInfo.description || '';
  const shouldTruncate = description.length > 200;
  const displayDescription = showFullDescription || !shouldTruncate 
    ? description 
    : description.slice(0, 200) + '...';

  return (
    <Card className="w-full bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 backdrop-blur-sm">
      <CardContent className="space-y-0">
        {/* Company Details Grid */}
        <div className="space-y-0">
          <InfoRow 
            label="Symbol" 
            value={symbol}
          />
          <InfoRow 
            label="Market Cap" 
            value={companyInfo.market_cap}
            formatter={formatMarketCap}
          />
          <InfoRow 
            label="IPO Date" 
            value={companyInfo.ipo_date}
            formatter={formatDate}
          />
          <InfoRow 
            label="CEO" 
            value={companyInfo.ceo}
          />
          <InfoRow 
            label="Fulltime Employees" 
            value={companyInfo.employees}
            formatter={formatEmployeeCount}
          />
          <InfoRow 
            label="Sector" 
            value={companyInfo.sector}
          />
          <InfoRow 
            label="Industry" 
            value={companyInfo.industry}
          />
          <InfoRow 
            label="Country" 
            value={companyInfo.headquarters?.split(',').pop()?.trim() || 'US'}
          />
          <InfoRow 
            label="Exchange" 
            value={companyInfo.exchange}
          />
        </div>

        {/* About Section */}
        {description && (
          <div className="pt-6 border-t border-gray-200 dark:border-gray-700/30 space-y-3">
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
              {displayDescription}
            </p>
            {shouldTruncate && (
              <button
                onClick={() => setShowFullDescription(!showFullDescription)}
                className="text-gray-600 dark:text-gray-400 text-sm hover:text-gray-900 dark:hover:text-gray-300 transition-colors font-medium"
              >
                {showFullDescription ? 'Read Less' : 'Read More'}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CompanyInfoCard;