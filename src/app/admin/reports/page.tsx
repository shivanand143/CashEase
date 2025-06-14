
// src/app/admin/reports/page.tsx
"use client";

import * as React from 'react';
import { BarChart3, CalendarDays, Download, Filter, Loader2, AlertCircle, Users, ClipboardList, ShoppingBag, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCurrency, safeToDate } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { collection, query, where, getDocs, Timestamp, orderBy, getCountFromServer, limit, doc, getDoc } from 'firebase/firestore'; // Added getDoc
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, Transaction, Store, PayoutRequest, CashbackStatus, PayoutStatus } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts'; // Aliased BarChart



const DateRangePicker = ({ className, onUpdate, initialDateFrom, initialDateTo }: {
    className?: string;
    onUpdate: (range: { from?: Date, to?: Date }) => void;
    initialDateFrom?: Date;
    initialDateTo?: Date;
}) => {
  const [date, setDate] = React.useState<{ from?: Date; to?: Date } | undefined>(
    initialDateFrom ? { from: initialDateFrom, to: initialDateTo } : undefined
  );
  
  React.useEffect(() => {
    onUpdate(date ?? {});
  }, [date, onUpdate]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full sm:w-[280px] justify-start text-left font-normal h-10",
            !date?.from && !date?.to && "text-muted-foreground",
            className
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {date?.from ? (
            date.to ? (
              <>
                {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
              </>
            ) : (
              format(date.from, "LLL dd, y")
            )
          ) : (
            <span>Pick a date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
      <Calendar
  initialFocus
  mode="range"
  defaultMonth={date?.from}
  selected={date?.from ? (date as { from: Date; to?: Date }) : undefined}
  onSelect={(range) => setDate(range)} // 
  numberOfMonths={2}
/>


      </PopoverContent>
    </Popover>
  );
};


type ReportType = 'user_signups' | 'transaction_overview' | 'store_performance' | 'payout_summary' | '';

interface ReportData {
  title: string;
  description?: string;
  data: any[] | { summary: any, details?: any[] };
  columns?: { key: string; header: string; render?: (value: any, item: any) => React.ReactNode }[];
  summaryMetrics?: { label: string; value: string | number }[];
  chartData?: any[];
  chartConfig?: any;
}

function ReportsPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-1/3" />
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" /><Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-2"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-10 w-full" /></div>
          <div className="flex-1 min-w-[280px] space-y-2"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-10 w-full" /></div>
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><Skeleton className="h-7 w-1/2 mb-1" /><Skeleton className="h-4 w-3/4" /></CardHeader>
        <CardContent className="min-h-[300px] flex items-center justify-center">
          <div className="text-center space-y-2"><BarChart3 className="h-12 w-12 text-muted-foreground mx-auto" /><Skeleton className="h-5 w-1/2 mx-auto" /></div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminReportsPage() {
  const [reportType, setReportType] = React.useState<ReportType>('');
  const [dateRange, setDateRange] = React.useState<{ from?: Date; to?: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [reportData, setReportData] = React.useState<ReportData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pageInitiallyLoading, setPageInitiallyLoading] = React.useState(true);

  React.useEffect(() => {
    setPageInitiallyLoading(false);
  }, []);

  const fetchUserSignupsReport = async (from?: Date, to?: Date): Promise<ReportData> => {
    if (!db || firebaseInitializationError) throw new Error(firebaseInitializationError || "Database not available");
    const constraints = [];
    if (from) constraints.push(where('createdAt', '>=', Timestamp.fromDate(startOfDay(from))));
    if (to) constraints.push(where('createdAt', '<=', Timestamp.fromDate(endOfDay(to))));

    const usersQuery = query(collection(db, 'users'), ...constraints, orderBy('createdAt', 'desc'), limit(10));
    const userDocs = await getDocs(usersQuery);
    const recentUsers = userDocs.docs.map(docSingle => { // Renamed doc to docSingle
        const data = docSingle.data();
        return {
            id: docSingle.id,
            displayName: data.displayName || 'N/A',
            email: data.email,
            createdAt: format(safeToDate(data.createdAt) || new Date(), 'PPp'),
            role: data.role || 'user'
        }
    });

    const countQueryConstraints = [];
    if (from) countQueryConstraints.push(where('createdAt', '>=', Timestamp.fromDate(startOfDay(from))));
    if (to) countQueryConstraints.push(where('createdAt', '<=', Timestamp.fromDate(endOfDay(to))));
    const countQuery = query(collection(db, 'users'), ...countQueryConstraints);
    const snapshot = await getCountFromServer(countQuery);
    const totalCount = snapshot.data().count;

    return {
      title: "User Signups Report",
      description: `Total new users signed up and recent signups within the selected period.`,
      summaryMetrics: [{ label: "Total New Users", value: totalCount }],
      data: { summary: { count: totalCount }, details: recentUsers },
      columns: [
        { key: "displayName", header: "Display Name" },
        { key: "email", header: "Email" },
        { key: "role", header: "Role" },
        { key: "createdAt", header: "Joined At" },
      ],
    };
  };

  const fetchTransactionsReport = async (from?: Date, to?: Date): Promise<ReportData> => {
    if (!db || firebaseInitializationError) throw new Error(firebaseInitializationError || "Database not available");
    const transactionsRef = collection(db, 'transactions');
    const constraints = [];
    if (from) constraints.push(where('transactionDate', '>=', Timestamp.fromDate(startOfDay(from))));
    if (to) constraints.push(where('transactionDate', '<=', Timestamp.fromDate(endOfDay(to))));

    const q = query(transactionsRef, ...constraints);
    const snapshot = await getDocs(q);
    const transactions: Transaction[] = snapshot.docs.map(docSingle => ({id: docSingle.id, ...docSingle.data()} as Transaction)); // Renamed doc to docSingle

    const overview = {
      totalTransactions: transactions.length,
      totalSaleAmount: transactions.reduce((sum, tx) => sum + (tx.finalSaleAmount ?? tx.saleAmount ?? 0), 0),
      totalCashbackAmount: transactions.reduce((sum, tx) => sum + (tx.finalCashbackAmount ?? tx.initialCashbackAmount ?? 0), 0),
      byStatus: {
        pending: { count: 0, totalSale: 0, totalCashback: 0 },
        confirmed: { count: 0, totalSale: 0, totalCashback: 0 },
        rejected: { count: 0, totalSale: 0, totalCashback: 0 },
        cancelled: { count: 0, totalSale: 0, totalCashback: 0 },
        awaiting_payout: { count: 0, totalSale: 0, totalCashback: 0 },
        paid: { count: 0, totalSale: 0, totalCashback: 0 },
      } as Record<CashbackStatus, { count: number, totalSale: number, totalCashback: number }>
    };

    transactions.forEach(tx => {
      const status = tx.status;
      if (overview.byStatus[status]) {
        overview.byStatus[status].count++;
        overview.byStatus[status].totalSale += (tx.finalSaleAmount ?? tx.saleAmount ?? 0);
        overview.byStatus[status].totalCashback += (tx.finalCashbackAmount ?? tx.initialCashbackAmount ?? 0);
      }
    });

    const statusDetails = Object.entries(overview.byStatus).map(([status, data]) => ({
        status: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
        count: data.count,
        totalSale: formatCurrency(data.totalSale),
        totalCashback: formatCurrency(data.totalCashback)
    }));

    return {
      title: "Transaction Overview",
      description: "Summary of all transactions within the selected period.",
      summaryMetrics: [
        { label: "Total Transactions", value: overview.totalTransactions },
        { label: "Total Sales Value", value: formatCurrency(overview.totalSaleAmount) },
        { label: "Total Cashback Value", value: formatCurrency(overview.totalCashbackAmount) },
      ],
      data: { summary: overview, details: statusDetails },
      columns: [
        { key: "status", header: "Status" },
        { key: "count", header: "Count" },
        { key: "totalSale", header: "Total Sales" },
        { key: "totalCashback", header: "Total Cashback" },
      ],
    };
  };

  const fetchStorePerformanceReport = async (from?: Date, to?: Date): Promise<ReportData> => {
    if (!db || firebaseInitializationError) throw new Error(firebaseInitializationError ||"Database not available");
    const transactionsRef = collection(db, 'transactions');
    const constraints = [where('status', 'in', ['confirmed', 'paid', 'awaiting_payout'] as CashbackStatus[])];
    if (from) constraints.push(where('transactionDate', '>=', Timestamp.fromDate(startOfDay(from))));
    if (to) constraints.push(where('transactionDate', '<=', Timestamp.fromDate(endOfDay(to))));

    const q = query(transactionsRef, ...constraints);
    const snapshot = await getDocs(q);
    const transactions: Transaction[] = snapshot.docs.map(docSingle => ({id: docSingle.id, ...docSingle.data()} as Transaction)); // Renamed doc to docSingle

    const storePerformance: Record<string, { name: string, count: number, totalCashback: number, totalSales: number }> = {};

    for (const tx of transactions) {
      const storeId = tx.storeId || 'unknown_store';
      let storeName = tx.storeName || 'Unknown Store';
      if (!storePerformance[storeId]) {
        let currentStoreName = storeName;
        if (storeName === 'Unknown Store' && storeId !== 'unknown_store' && db) {
            const storeDocSnap = await getDoc(doc(db, 'stores', storeId)); // Renamed storeDoc to storeDocSnap
            if (storeDocSnap.exists()) {
                currentStoreName = storeDocSnap.data()?.name || 'Unknown Store';
            }
        }
        storePerformance[storeId] = { name: currentStoreName, count: 0, totalCashback: 0, totalSales: 0 };
      }
      storePerformance[storeId].count++;
      storePerformance[storeId].totalCashback += (tx.finalCashbackAmount ?? tx.initialCashbackAmount ?? 0);
      storePerformance[storeId].totalSales += (tx.finalSaleAmount ?? tx.saleAmount ?? 0);
    }

    const performanceDetails = Object.values(storePerformance)
        .sort((a,b) => b.totalCashback - a.totalCashback)
        .map(s => ({
            name: s.name,
            transactionCount: s.count,
            totalCashbackGenerated: parseFloat(s.totalCashback.toFixed(2)),
            totalSalesValue: parseFloat(s.totalSales.toFixed(2)),
        }));

    const chartData = performanceDetails.slice(0, 10).map(s => ({
        name: s.name.length > 15 ? s.name.substring(0,12) + '...' : s.name,
        cashback: s.totalCashbackGenerated,
    }));

    return {
      title: "Store Performance (Confirmed/Paid Transactions)",
      description: "Performance of stores based on confirmed/paid transactions within the period.",
      data: {
        summary: {}, // ✅ Provide empty or meaningful summary
        details: performanceDetails.map(s => ({
          ...s,
          totalCashbackGenerated: formatCurrency(s.totalCashbackGenerated),
          totalSalesValue: formatCurrency(s.totalSalesValue)
        }))
      }
      ,
      columns: [
        { key: "name", header: "Store Name" },
        { key: "transactionCount", header: "Transaction Count" },
        { key: "totalCashbackGenerated", header: "Total Cashback Generated" },
        { key: "totalSalesValue", header: "Total Sales Value" },
      ],
      chartData: chartData,
      chartConfig: {
        cashback: { label: "Cashback (₹)", color: "hsl(var(--primary))" }
      }
    };
  };

  const fetchPayoutSummaryReport = async (from?: Date, to?: Date): Promise<ReportData> => {
    if (!db || firebaseInitializationError) throw new Error(firebaseInitializationError ||"Database not available");
    const payoutsRef = collection(db, 'payoutRequests');
    const constraints = [];
    if (from) constraints.push(where('requestedAt', '>=', Timestamp.fromDate(startOfDay(from))));
    if (to) constraints.push(where('requestedAt', '<=', Timestamp.fromDate(endOfDay(to))));

    const q = query(payoutsRef, ...constraints);
    const snapshot = await getDocs(q);
    const payouts: PayoutRequest[] = snapshot.docs.map(docSingle => ({id: docSingle.id, ...docSingle.data()} as PayoutRequest)); // Renamed doc to docSingle

    const overview = {
      totalRequests: payouts.length,
      totalAmountRequested: payouts.reduce((sum, pr) => sum + (pr.amount || 0), 0),
      byStatus: {
        pending: { count: 0, totalAmount: 0 },
        approved: { count: 0, totalAmount: 0 },
        processing: { count: 0, totalAmount: 0 },
        paid: { count: 0, totalAmount: 0 },
        rejected: { count: 0, totalAmount: 0 },
        failed: { count: 0, totalAmount: 0 },
      } as Record<PayoutStatus, { count: number, totalAmount: number }>
    };

    payouts.forEach(pr => {
      const status = pr.status;
      if (overview.byStatus[status]) {
        overview.byStatus[status].count++;
        overview.byStatus[status].totalAmount += (pr.amount || 0);
      }
    });

    const statusDetails = Object.entries(overview.byStatus).map(([status, data]) => ({
        status: status.charAt(0).toUpperCase() + status.slice(1),
        count: data.count,
        totalAmount: formatCurrency(data.totalAmount),
    }));

    return {
      title: "Payout Summary",
      description: "Summary of all payout requests within the selected period.",
      summaryMetrics: [
        { label: "Total Payout Requests", value: overview.totalRequests },
        { label: "Total Amount Requested", value: formatCurrency(overview.totalAmountRequested) },
      ],
      data: { summary: overview, details: statusDetails },
      columns: [
        { key: "status", header: "Status" },
        { key: "count", header: "Request Count" },
        { key: "totalAmount", header: "Total Amount" },
      ],
    };
  };


  const handleGenerateReport = async () => {
    if (!reportType) {
      setError("Please select a report type.");
      return;
    }
    if (firebaseInitializationError || !db) {
        setError(firebaseInitializationError || "Database not available.");
        return;
    }
    setLoading(true);
    setError(null);
    setReportData(null);

    try {
      let data;
      switch (reportType) {
        case 'user_signups': data = await fetchUserSignupsReport(dateRange.from, dateRange.to); break;
        case 'transaction_overview': data = await fetchTransactionsReport(dateRange.from, dateRange.to); break;
        case 'store_performance': data = await fetchStorePerformanceReport(dateRange.from, dateRange.to); break;
        case 'payout_summary': data = await fetchPayoutSummaryReport(dateRange.from, dateRange.to); break;
        default: throw new Error("Invalid report type selected");
      }
      setReportData(data);
    } catch (err) {
      console.error("Error generating report:", err);
      setError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  };

  if (pageInitiallyLoading) {
    return <AdminGuard><ReportsPageSkeleton /></AdminGuard>;
  }

  const renderReportData = () => {
    if (!reportData) return <p className="text-muted-foreground text-center py-10">Select a report type and date range to generate data.</p>;

    const { data, columns, summaryMetrics, chartData, chartConfig } = reportData;
    const detailsArray = Array.isArray(data) ? data : (data as any).details;

    return (
      <div className="space-y-6">
        {summaryMetrics && summaryMetrics.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                {summaryMetrics.map(metric => (
                    <Card key={metric.label} className="shadow-sm">
                        <CardHeader className="pb-2 pt-3 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
                            {/* Optional: Icon based on metric */}
                        </CardHeader>
                        <CardContent className="pb-3">
                            <p className="text-2xl font-bold">{metric.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )}
        {chartData && chartConfig && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Chart: {reportData.title.replace(' Report', '').replace(' Overview', '')}</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} interval={0} tick={{fontSize: 10}}/>
                  <YAxis tickFormatter={(value) => `₹${value}`} />
                  <RechartsTooltip
                    formatter={(value:any, name:any) => [formatCurrency(value), name.charAt(0).toUpperCase() + name.slice(1)]}
                    cursor={{fill: 'hsl(var(--muted))'}}
                    contentStyle={{backgroundColor: 'hsl(var(--background))', borderRadius: 'var(--radius)'}}
                  />
                  <Legend />
                  {Object.entries(chartConfig).map(([key, config]: [string, any]) => (
                    <Bar key={key} dataKey={key} fill={config.color} name={config.label} radius={[4, 4, 0, 0]} />
                  ))}
                </RechartsBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {columns && detailsArray && detailsArray.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map(col => <TableHead key={col.key}>{col.header}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
              {detailsArray.map((item: any, index: number) => (
  <TableRow key={index}>
    {columns.map(col => (
      <TableCell key={col.key}>
        {item[col.key as keyof typeof item]}
      </TableCell>
    ))}
  </TableRow>
))}

              </TableBody>
            </Table>
          </div>
        ) : detailsArray && detailsArray.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">No detailed data available for this report and period.</p>
        ) : !columns && detailsArray ? (
            <pre className="text-xs bg-muted p-4 rounded-md overflow-x-auto">{JSON.stringify(detailsArray, null, 2)}</pre>
        ) : null }
      </div>
    );
  };

  return (
    <AdminGuard>
      <div className="space-y-8">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-primary" /> Admin Reports
        </h1>

        <Card className="shadow-md border">
          <CardHeader>
            <CardTitle>Generate Report</CardTitle>
            <CardDescription>Select report type and date range to generate insights.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label htmlFor="reportType" className="text-sm font-medium">Report Type</label>
              <Select value={reportType} onValueChange={(value) => setReportType(value as ReportType)} disabled={loading}>
                <SelectTrigger id="reportType" className="h-10"><SelectValue placeholder="Select a report..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user_signups">User Signups</SelectItem>
                  <SelectItem value="transaction_overview">Transaction Overview</SelectItem>
                  <SelectItem value="store_performance">Store Performance</SelectItem>
                  <SelectItem value="payout_summary">Payout Summary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[280px] space-y-1">
              <label className="text-sm font-medium block mb-1">Date Range</label>
              <DateRangePicker
                className="w-full"
                initialDateFrom={dateRange.from}
                initialDateTo={dateRange.to}
                onUpdate={(newRange) => setDateRange(newRange)}
              />
            </div>
            <Button onClick={handleGenerateReport} disabled={loading || !reportType} className="w-full sm:w-auto h-10">
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

        {reportData && !loading && (
          <Card className="shadow-md border">
            <CardHeader>
              <CardTitle>{reportData.title}</CardTitle>
              {reportData.description && <CardDescription>{reportData.description}</CardDescription>}
              {dateRange.from && (
                <CardDescription className="text-xs">
                  For period: {format(dateRange.from, "PPP")} {dateRange.to ? ` - ${format(dateRange.to, "PPP")}` : '(Open End Date)'}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="min-h-[200px]">
              {renderReportData()}
            </CardContent>
          </Card>
        )}
        {loading && !reportData && !error && (
          <div className="text-center py-10">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="mt-2 text-muted-foreground">Generating report...</p>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
