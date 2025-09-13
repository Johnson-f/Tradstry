"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCompanyInfo } from '@/lib/hooks/use-market-data';
import { Building2, Users, Calendar, MapPin, ExternalLink, Globe } from 'lucide-react';

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
  if (!dateString) return 'N/A';
  
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

// Info item component
interface InfoItemProps {
  label: string;
  value: string | number | undefined | null;
  icon?: React.ReactNode;
  formatter?: (value: any) => string;
}

const InfoItem: React.FC<InfoItemProps> = ({ label, value, icon, formatter }) => {
  const displayValue = formatter ? formatter(value) : (value?.toString() || 'N/A');
  
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium text-foreground text-right">
        {displayValue}
      </div>
    </div>
  );
};

// Loading skeleton
const CompanyInfoSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <Skeleton className="w-8 h-8 rounded-full" />
      <div className="space-y-1">
        <Skeleton className="w-16 h-5" />
        <Skeleton className="w-24 h-4" />
      </div>
    </div>
    
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex justify-between">
          <Skeleton className="w-20 h-4" />
          <Skeleton className="w-16 h-4" />
        </div>
      ))}
    </div>
    
    <div className="space-y-2">
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
  const [showFullDescription, setShowFullDescription] = useState(false);
  
  const { companyInfo, isLoading, error } = useCompanyInfo(symbol, dataProvider);

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load company information: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <CompanyInfoSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (!companyInfo) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-center py-8 text-muted-foreground">
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
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
            {symbol.charAt(0)}
          </div>
          <div>
            <CardTitle className="text-xl font-bold">{symbol}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {companyInfo.name || companyInfo.company_name || 'Company Information'}
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-b pb-4">
          <InfoItem 
            label="Market Cap" 
            value={companyInfo.market_cap}
            formatter={formatMarketCap}
            icon={<Building2 className="w-4 h-4" />}
          />
          <InfoItem 
            label="IPO Date" 
            value={companyInfo.ipo_date}
            formatter={formatDate}
            icon={<Calendar className="w-4 h-4" />}
          />
          <InfoItem 
            label="CEO" 
            value={companyInfo.ceo}
            icon={<Users className="w-4 h-4" />}
          />
          <InfoItem 
            label="Fulltime Employees" 
            value={companyInfo.employees}
            formatter={formatEmployeeCount}
            icon={<Users className="w-4 h-4" />}
          />
          <InfoItem 
            label="Sector" 
            value={companyInfo.sector}
          />
          <InfoItem 
            label="Industry" 
            value={companyInfo.industry}
          />
          <InfoItem 
            label="Country" 
            value={companyInfo.headquarters?.split(',').pop()?.trim() || 'N/A'}
            icon={<MapPin className="w-4 h-4" />}
          />
          <InfoItem 
            label="Exchange" 
            value={companyInfo.exchange}
          />
        </div>

        {/* Additional Info */}
        {(companyInfo.pe_ratio || companyInfo.pb_ratio || companyInfo.dividend_yield) && (
          <div className="space-y-3 border-b pb-4">
            <h4 className="font-medium text-sm text-muted-foreground">Financial Ratios</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {companyInfo.pe_ratio && (
                <InfoItem label="P/E Ratio" value={companyInfo.pe_ratio.toFixed(2)} />
              )}
              {companyInfo.pb_ratio && (
                <InfoItem label="P/B Ratio" value={companyInfo.pb_ratio.toFixed(2)} />
              )}
              {companyInfo.dividend_yield && (
                <InfoItem 
                  label="Dividend Yield" 
                  value={`${(companyInfo.dividend_yield * 100).toFixed(2)}%`} 
                />
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {description && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground">About</h4>
            <p className="text-sm leading-relaxed text-foreground">
              {displayDescription}
            </p>
            {shouldTruncate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFullDescription(!showFullDescription)}
                className="h-auto p-0 font-medium text-blue-600 hover:text-blue-700 hover:bg-transparent"
              >
                {showFullDescription ? 'Read Less' : 'Read More'}
              </Button>
            )}
          </div>
        )}

        {/* Contact Information */}
        {(companyInfo.website || companyInfo.phone) && (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-medium text-sm text-muted-foreground">Contact</h4>
            <div className="flex flex-wrap gap-2">
              {companyInfo.website && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(companyInfo.website, '_blank')}
                  className="h-8 text-xs"
                >
                  <Globe className="w-3 h-3 mr-1" />
                  Website
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              )}
              {companyInfo.phone && (
                <Badge variant="outline" className="text-xs">
                  {companyInfo.phone}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Data Provider Badge */}
        {companyInfo.data_provider && (
          <div className="pt-2">
            <Badge variant="secondary" className="text-xs">
              Data from {companyInfo.data_provider}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CompanyInfoCard;