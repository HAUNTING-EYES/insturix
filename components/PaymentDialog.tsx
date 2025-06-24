"use client"

import { useState, useMemo, useEffect } from "react"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  getFilteredRowModel,
  type ColumnFiltersState,
  getFacetedRowModel,
  getFacetedUniqueValues,
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Download,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpDown,
  Eye,
  Calendar,
  CreditCard,
  DollarSign,
} from "lucide-react"
import { IPayment } from "@/types/userTypes"

export function PaymentHistoryDialog({
  open,
  onOpenChange,
  payments = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  payments: IPayment[]
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [pageSize, setPageSize] = useState(5)
  const [activeTab, setActiveTab] = useState("all")
  const isMobile = useMediaQuery("(max-width: 640px)")

  useEffect(() => {
    if (isMobile) {
      setColumnVisibility({
        time: false,
        phone_number: false,
        payment_id: false,
      })
    } else {
      setColumnVisibility({})
    }
  }, [isMobile])

  // Calculate summary statistics
  const totalAmount = useMemo(() => {
    return payments.reduce((sum, payment) => sum + payment.amount, 0)
  }, [payments])

  const averageAmount = useMemo(() => {
    return payments.length ? totalAmount / payments.length : 0
  }, [payments, totalAmount])

  const latestPayment = useMemo(() => {
    if (!payments.length) return null
    return payments.reduce((latest, payment) => {
      return new Date(payment.timestamp) > new Date(latest.timestamp) ? payment : latest
    }, payments[0])
  }, [payments])

  // Define columns for the table
  const columns: ColumnDef<IPayment>[] = [
    {
      accessorKey: "timestamp",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="p-0 hover:bg-transparent"
          >
            Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const date = row.getValue("timestamp") as Date
        return (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{new Date(date).toLocaleDateString()}</span>
          </div>
        )
      },
      filterFn: (row, id, value) => {
        return value.includes(activeTab) ? true : activeTab === "all" || row.getValue(id) === value
      },
    },
    {
      accessorKey: "amount",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="p-0 hover:bg-transparent"
          >
            Amount
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const amount = Number.parseFloat(row.getValue("amount"))
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(amount)
        return (
          <div className="flex items-center gap-2 font-medium">
            <DollarSign className="h-4 w-4 text-green-500" />
            {formatted}
          </div>
        )
      },
    },
    {
      accessorKey: "paymentId",
      header: "Payment ID",
      cell: ({ row }) => {
        return <span className="font-mono text-xs">{row.getValue("paymentId")}</span>
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = (row.getValue("status") as string) || "Completed"
        return (
          <Badge
            className={`${
              status === "Completed"
                ? "bg-green-100 text-green-800 hover:bg-green-100"
                : status === "Pending"
                  ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
                  : "bg-red-100 text-red-800 hover:bg-red-100"
            }`}
          >
            {status}
          </Badge>
        )
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const payment = row.original
        return (
          <Button variant="ghost" size="icon" onClick={() => console.log("View payment", payment.paymentId)}>
            <Eye className="h-4 w-4" />
          </Button>
        )
      },
    },
  ]

  const table = useReactTable({
    data: payments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination: {
        pageSize,
        pageIndex: 0,
      },
    },
  })

  const exportToCSV = () => {
    // Create CSV content
    const headers = columns
      .filter((col) => col.id !== "actions" && !columnVisibility[col.id as string])
      .map((col) => (col.header as string) || col.id)
      .join(",")

    const rows = payments.map((payment) => {
      return [
        new Date(payment.timestamp).toLocaleDateString(),
        payment.amount,
        payment.paymentId,
        payment.status || "Completed",
        payment.currency,
        payment.paymentMethod,
        payment.planName,
        payment.razorpayPaymentId || '',
        payment.razorpayOrderId || '',
      ].join(",")
    })

    const csvContent = [headers, ...rows].join("\n")

    // Create and download the file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `payment_history_${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-purple-500" />
            Payment History
          </DialogTitle>
          <DialogDescription>View and manage your payment history.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <TabsList className="bg-muted/50 w-full sm:w-auto overflow-x-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="Completed">Done</TabsTrigger>
              <TabsTrigger value="Pending">Pending</TabsTrigger>
              <TabsTrigger value="Failed">Failed</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-1 w-full sm:w-auto">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <TabsContent value="all" className="mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(totalAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    From {payments.length} payment{payments.length !== 1 ? "s" : ""}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Average Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(averageAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Per transaction</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Latest Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {latestPayment
                      ? new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(latestPayment.amount)
                      : "$0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {latestPayment ? new Date(latestPayment.timestamp).toLocaleDateString() : "No payments"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-4 mb-4">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by Payment ID..."
                  value={(table.getColumn("paymentId")?.getFilterValue() as string) ?? ""}
                  onChange={(event) => table.getColumn("paymentId")?.setFilterValue(event.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="w-full sm:w-auto">
                    <SelectValue placeholder="Rows per page" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 rows</SelectItem>
                    <SelectItem value="10">10 rows</SelectItem>
                    <SelectItem value="20">20 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto">
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      View
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {table
                      .getAllColumns()
                      .filter((column) => column.getCanHide())
                      .map((column) => {
                        return (
                          <DropdownMenuCheckboxItem
                            key={column.id}
                            className="capitalize"
                            checked={column.getIsVisible()}
                            onCheckedChange={(value) => column.toggleVisibility(!!value)}
                          >
                            {column.id.replace(/_/g, " ")}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        No payment history found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {table.getFilteredRowModel().rows.length} of {payments.length} payments
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                  Next
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
