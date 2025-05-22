// src/app/admin/reports/page.tsx
"use client"; // Make this a client component

import * as React from 'react';
import { useState, useEffect } from 'react';
import { BarChart3, CalendarDays, Download, Filter, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { DateRangePicker } from '@/components/ui/date-range-picker'; // Assuming this exists or will be created
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from "@/lib/utils"; // Added cn import
// import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart'; // Example import
// import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts'; // Example import

// Placeholder for DateRangePicker if not fully implemented
const DateRangePickerPlaceholder = ({ className, onUpdate, initialDateFrom, initialDateTo }: any) => (
  <div className={cn("flex items-center gap-2 p-2 border rounded-md bg-muted", className)}>
    <CalendarDays className="w-4 h-4" />
    <span>Date Range Placeholder (Not Implemented)</span>
  </div>
);

interface ReportData {
  // Define structure for your report data, e.g.,
  // name: string;
  // value: number;
  [key: string]: any;
}

function ReportsPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-1/3" /> {/* Title "Reports" */}

      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" /> {/* Card Title "Generate Report" */}
          <Skeleton className="h-4 w-3/4" /> {/* Card Description */}
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Select */}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full sm:w-[300px]" /> {/* Date Range Picker */}
          </div>
          <Skeleton className="h-10 w-24" /> {/* Generate Button */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" /> {/* Report Title */}
          <Skeleton className="h-4 w-3/4" /> {/* Report Description */}
        </CardHeader>
        <CardContent className="min-h-[300px] flex items-center justify-center">
          <div className="text-center space-y-2">
            <Skeleton className="h-10 w-10 mx-auto rounded-full" /> {/* Icon Placeholder */}
            <Skeleton className="h-5 w-1/2 mx-auto" /> {/* Text Placeholder */}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


export default function AdminReportsPage() {
  const [reportType, setReportType] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [reportData, setReportData] = useState<ReportData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    if (!reportType) {
      setError("Please select a report type.");
      return;
    }
    setLoading(true);
    setError(null);
    setReportData(null);

    // Simulate API call / data fetching
    console.log("Generating report:", { reportType, dateRange });
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Placeholder data based on report type
    if (reportType === 'user_signups') {
      setReportData([
        { month: 'Jan', signups: Math.floor(Math.random() * 100) + 50 },
        { month: 'Feb', signups: Math.floor(Math.random() * 100) + 70 },
        { month: 'Mar', signups: Math.floor(Math.random() * 100) + 90 },
      ]);
    } else if (reportType === 'cashback_earned') {
      setReportData([
        { category: 'Fashion', totalCashback: Math.floor(Math.random() * 5000) + 1000 },
        { category: 'Electronics', totalCashback: Math.floor(Math.random() * 8000) + 2000 },
        { category: 'Travel', totalCashback: Math.floor(Math.random() * 3000) + 500 },
      ]);
    } else {
      setReportData([]); // Empty data for other types for now
    }

    setLoading(false);
  };

  // Initial loading state check
  const [pageInitiallyLoading, setPageInitiallyLoading] = React.useState(true);
  React.useEffect(() => {
    setPageInitiallyLoading(false); // Consider this page loaded after initial mount
  }, []);


  if (pageInitiallyLoading) {
    return <AdminGuard><ReportsPageSkeleton /></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-8">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-primary" /> Reports
        </h1>

        <Card className="shadow-md border">
          <CardHeader>
            <CardTitle>Generate Report</CardTitle>
            <CardDescription>Select report type and date range to generate insights.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1">
              <label htmlFor="reportType" className="text-sm font-medium">Report Type</label>
              <Select value={reportType} onValueChange={setReportType} disabled={loading}>
                <SelectTrigger id="reportType">
                  <SelectValue placeholder="Select a report..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user_signups">User Signups Over Time</SelectItem>
                  <SelectItem value="cashback_earned">Total Cashback Earned by Category</SelectItem>
                  <SelectItem value="top_stores">Top Performing Stores (by Clicks/Sales)</SelectItem>
                  <SelectItem value="payout_summary">Payouts Summary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
               <label className="text-sm font-medium block mb-1">Date Range</label>
              {/* Replace with actual DateRangePicker when available */}
              <DateRangePickerPlaceholder
                className="w-full sm:w-auto"
                initialDateFrom={dateRange.from}
                initialDateTo={dateRange.to}
                onUpdate={(values: any) => setDateRange({ from: values.from, to: values.to })}
                // ... other props your DateRangePicker might need
              />
            </div>
            <Button onClick={handleGenerateReport} disabled={loading || !reportType}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
              Generate
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && reportData && (
          <Card className="shadow-md border">
            <CardHeader>
              <CardTitle>Report: {reportType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</CardTitle>
              {dateRange.from && dateRange.to && (
                <CardDescription>
                  For period: {dateRange.from.toLocaleDateString()} - {dateRange.to.toLocaleDateString()}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="min-h-[300px]">
              {reportData.length === 0 ? (
                <p className="text-muted-foreground text-center py-10">No data available for this report and period.</p>
              ) : (
                <div className="overflow-x-auto">
                  {/* Placeholder for actual chart or table */}
                  <pre className="text-xs bg-muted p-4 rounded-md">{JSON.stringify(reportData, null, 2)}</pre>
                  {/*
                  Example using a hypothetical BarChart (you'd need to install and set up recharts or similar)
                  <ChartContainer config={{ signups: { label: "Signups", color: "hsl(var(--primary))" } }} className="h-[300px] w-full">
                    <BarChart data={reportData} accessibilityLayer>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
                      <YAxis />
                      <RechartsTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="signups" fill="var(--color-signups)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                  */}
                </div>
              )}
              {reportData.length > 0 && (
                <div className="mt-4 text-right">
                  <Button variant="outline" size="sm" disabled>
                    <Download className="mr-2 h-4 w-4" /> Export CSV (Not Implemented)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {loading && !reportData && !error && ( // Show loading indicator only if no data and no error yet
          <div className="text-center py-10">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="mt-2 text-muted-foreground">Generating report...</p>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
