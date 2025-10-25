"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  useInstitutionalHolders, 
  useMutualFundHolders, 
  useInsiderTransactions, 
  useInsiderPurchasesSummary, 
  useInsiderRoster 
} from '@/lib/hooks/use-market-data';
import { Loader2, Building2, TrendingUp, Users, FileText, UserCheck } from 'lucide-react';
import type { 
  InstitutionalHolder, 
  MutualFundHolder, 
  InsiderTransaction, 
  InsiderPurchasesSummary, 
  InsiderRoster 
} from '@/lib/types/market-data';

interface HoldersTabProps {
  symbol: string;
  className?: string;
}

export function HoldersTab({ symbol, className = '' }: HoldersTabProps) {
  const { institutionalHolders, isLoading: institutionalLoading } = useInstitutionalHolders(symbol);
  const { mutualFundHolders, isLoading: mutualFundLoading } = useMutualFundHolders(symbol);
  const { insiderTransactions, isLoading: transactionsLoading } = useInsiderTransactions(symbol);
  const { insiderPurchasesSummary, isLoading: purchasesLoading } = useInsiderPurchasesSummary(symbol);
  const { insiderRoster, isLoading: rosterLoading } = useInsiderRoster(symbol);

  const formatNumber = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '--';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  };

  const formatCurrency = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '--';
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: string | null | undefined): string => {
    if (!date) return '--';
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <Tabs defaultValue="institutional" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="institutional" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Institutional
          </TabsTrigger>
          <TabsTrigger value="mutual-fund" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Mutual Funds
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="purchases" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Purchases
          </TabsTrigger>
          <TabsTrigger value="roster" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Roster
          </TabsTrigger>
        </TabsList>

        {/* Institutional Holders Tab */}
        <TabsContent value="institutional" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Institutional Holders</CardTitle>
              <CardDescription>
                Top institutional investors holding {symbol} shares
              </CardDescription>
            </CardHeader>
            <CardContent>
              {institutionalLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : institutionalHolders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No institutional holders data available
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Holder</TableHead>
                        <TableHead className="text-right">Shares</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Date Reported</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {institutionalHolders.map((holder: InstitutionalHolder, index: number) => (
                        <TableRow key={`${holder.holder_name}-${index}`}>
                          <TableCell className="font-medium max-w-xs truncate">
                            {holder.holder_name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(holder.shares)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(holder.value)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatDate(holder.date_reported)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mutual Fund Holders Tab */}
        <TabsContent value="mutual-fund" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Mutual Fund Holders</CardTitle>
              <CardDescription>
                Top mutual funds holding {symbol} shares
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mutualFundLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : mutualFundHolders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No mutual fund holders data available
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fund</TableHead>
                        <TableHead className="text-right">Shares</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Date Reported</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mutualFundHolders.map((holder: MutualFundHolder, index: number) => (
                        <TableRow key={`${holder.holder_name}-${index}`}>
                          <TableCell className="font-medium max-w-xs truncate">
                            {holder.holder_name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(holder.shares)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(holder.value)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatDate(holder.date_reported)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insider Transactions Tab */}
        <TabsContent value="transactions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Insider Transactions</CardTitle>
              <CardDescription>
                Recent insider trading activity for {symbol}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : insiderTransactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No insider transactions data available
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Insider</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead className="text-right">Transaction</TableHead>
                        <TableHead className="text-right">Shares</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insiderTransactions.map((transaction: InsiderTransaction, index: number) => (
                        <TableRow key={`${transaction.holder_name}-${index}`}>
                          <TableCell className="font-medium max-w-xs truncate">
                            {transaction.holder_name || '--'}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {transaction.insider_position || '--'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge 
                              variant={
                                transaction.transaction_type?.toLowerCase().includes('purchase') || transaction.transaction_type?.toLowerCase().includes('buy')
                                  ? 'default' 
                                  : transaction.transaction_type?.toLowerCase().includes('sale') || transaction.transaction_type?.toLowerCase().includes('sell')
                                  ? 'destructive' 
                                  : 'secondary'
                              }
                            >
                              {transaction.transaction_type || '--'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(transaction.shares)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(transaction.value)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatDate(transaction.date_reported)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insider Purchases Summary Tab */}
        <TabsContent value="purchases" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Insider Purchases Summary</CardTitle>
              <CardDescription>
                Summary of insider purchase activity for {symbol}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {purchasesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : insiderPurchasesSummary.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No insider purchases summary available
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Purchase Txns</TableHead>
                        <TableHead className="text-right">Purchase Shares</TableHead>
                        <TableHead className="text-right">Sale Txns</TableHead>
                        <TableHead className="text-right">Sale Shares</TableHead>
                        <TableHead className="text-right">Net Shares</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insiderPurchasesSummary.map((summary: InsiderPurchasesSummary, index: number) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {summary.summary_period || '--'}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(summary.purchases_transactions)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(summary.purchases_shares)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(summary.sales_transactions)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(summary.sales_shares)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(summary.net_shares)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insider Roster Tab */}
        <TabsContent value="roster" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Insider Roster</CardTitle>
              <CardDescription>
                Key insiders and their positions at {symbol}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rosterLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : insiderRoster.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No insider roster data available
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead className="text-right">Shares (Direct)</TableHead>
                        <TableHead className="text-right">Shares (Indirect)</TableHead>
                        <TableHead className="text-right">Latest Transaction</TableHead>
                        <TableHead className="text-right">Transaction Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insiderRoster.map((insider: InsiderRoster, index: number) => (
                        <TableRow key={`${insider.holder_name}-${index}`}>
                          <TableCell className="font-medium max-w-xs truncate">
                            {insider.holder_name || '--'}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {insider.insider_position || '--'}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(insider.shares_owned_directly)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(insider.shares_owned_indirectly)}
                          </TableCell>
                          <TableCell className="text-right">
                            {insider.most_recent_transaction || '--'}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatDate(insider.latest_transaction_date)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default HoldersTab;