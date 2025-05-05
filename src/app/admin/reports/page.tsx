"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, Users, IndianRupee, Activity, AlertCircle, CalendarDays } from 'lucide-react';
import AdminGuard from '@/components/guards/admin-guard';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from '@/lib/utils';
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
// Import chart components if you have them (e.g., from ShadCN/Recharts)
// import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"

// Placeholder data structure for charts
// const data = [
//   { name: "Jan", total: Math.floor(Math.random() * 5000) + 1000 },
//   { name: "Feb", total: Math.floor(Math.random() * 5000) + 1000 },
//   // ... more months
// ]

function AdminReportsPageContent() {
  const [reportType, setReportType] = React.useState<string>('user_activity');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of current month
    to: new Date(), // Today
  });

  const handleGenerateReport = () => {
    console.log("Generating report:", {
      type: reportType,
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    });
    // TODO: Add logic to fetch and display report data based on type and date range
    alert(`Generating ${reportType.replace('_', ' ')} report from ${format(dateRange?.from || new Date(), 'PPP')} to ${format(dateRange?.to || new Date(), 'PPP')}. (Implementation pending)`);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <BarChart3 className="w-7 h-7" /> Reports
      </h1>

      {/* --- Report Selection & Filters --- */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Report</CardTitle>
          <CardDescription>Select the report type and date range.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
          {/* Report Type */}
          <div className="flex-1 space-y-2">
            <label htmlFor="reportType" className="text-sm font-medium">Report Type</label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger id="reportType">
                <SelectValue placeholder="Select a report" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user_activity">User Activity (Signups, Logins)</SelectItem>
                <SelectItem value="cashback_performance">Cashback Performance (Tracked, Confirmed)</SelectItem>
                <SelectItem value="payout_summary">Payout Summary (Requests, Approved, Paid)</SelectItem>
                <SelectItem value="store_performance">Store Performance (Clicks, Transactions)</SelectItem>
                <SelectItem value="referral_report">Referral Report</SelectItem>
                 {/* Add more report types as needed */}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Picker */}
          <div className="space-y-2">
             <label htmlFor="dateRange" className="text-sm font-medium">Date Range</label>
             <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="dateRange"
                  variant={"outline"}
                  className={cn(
                    "w-full sm:w-[300px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
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
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Generate Button */}
          <Button onClick={handleGenerateReport} className="h-10">Generate</Button>
        </CardContent>
      </Card>

      {/* --- Report Display Area (Placeholder) --- */}
      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{reportType.replace('_', ' ')} Report</CardTitle>
          <CardDescription>
            Showing data {dateRange?.from ? `from ${format(dateRange.from, "PPP")}` : ''} {dateRange?.to ? `to ${format(dateRange.to, "PPP")}` : ''}.
            (Report content implementation pending)
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px] flex items-center justify-center text-muted-foreground">
           {/* Placeholder for Charts or Data Tables */}
           <div className="text-center space-y-2">
              <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground/50" />
               <p>Report data will be displayed here.</p>
               {/* Example Chart Placeholder (requires setup) */}
               {/* <ResponsiveContainer width="100%" height={350}>
                 <BarChart data={data}>
                   <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false}/>
                   <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`}/>
                   <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                 </BarChart>
               </ResponsiveContainer> */}
           </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <AdminGuard>
      <AdminReportsPageContent />
    </AdminGuard>
  );
}
