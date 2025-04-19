"use client"

import { useState, useMemo } from "react"
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
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Search,
  ArrowUpDown,
  Calendar,
  UserCog,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Package,
  AlertCircle,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { usePlans, Plan } from "@/lib/hooks/usePlans"
import { format } from "date-fns"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { UserType } from "@/types/userTypes"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

export function PlanHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: Plan[];
}) {
  const { data, isLoading, isError, cancelPlan, isCanceling } = usePlans()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [activeTab, setActiveTab] = useState("all")
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const router = useRouter()

  // Map user type to plan name for better display
  const currentPlanName = useMemo(() => {
    if (!data?.userType) return "No active plan";
    
    switch (data.userType) {
      case UserType.Free:
        return "Free";
      case UserType.Plus:
        return "Plus";
      case UserType.Pro:
        return "Pro";
      case UserType.Premium:
        return "Premium";
      default:
        return data?.currentPlan?.name || "Free";
    }
  }, [data?.userType, data?.currentPlan?.name]);

  const handleCancelPlan = () => {
    cancelPlan()
    toast.success("Plan canceled successfully")
    setCancelConfirmOpen(false)
    setSelectedPlan(null)
    router.refresh()
  }

  // Define columns for the table
  const columns: ColumnDef<Plan>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="p-0 hover:bg-transparent"
          >
            Plan Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-2 font-medium">
            <Package className="h-4 w-4 text-purple-500" />
            {row.getValue("name")}
          </div>
        )
      },
    },
    {
      accessorKey: "startDate",
      header: "Start Date",
      cell: ({ row }) => {
        const date = row.getValue("startDate") as Date
        return (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{format(date, "MMM dd, yyyy")}</span>
          </div>
        )
      },
    },
    {
      accessorKey: "endDate",
      header: "End Date",
      cell: ({ row }) => {
        const date = row.getValue("endDate") as Date | null
        return (
          <div className="flex items-center gap-2">
            {date ? (
              <>
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{format(date, "MMM dd, yyyy")}</span>
              </>
            ) : (
              <span className="text-muted-foreground italic">Ongoing</span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "price",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="p-0 hover:bg-transparent"
          >
            Price
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const price = Number.parseFloat(row.getValue("price"))
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(price)
        return <span className="font-medium">{formatted}</span>
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string
        return (
          <Badge
            className={`flex items-center gap-1 ${
              status === "active"
                ? "bg-green-100 text-green-800 hover:bg-green-100"
                : status === "expired"
                  ? "bg-gray-100 text-gray-800 hover:bg-gray-100"
                  : "bg-red-100 text-red-800 hover:bg-red-100"
            }`}
          >
            {status === "active" ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : status === "expired" ? (
              <Clock className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        )
      },
      filterFn: (row, id, value) => {
        return value.includes(activeTab) ? true : activeTab === "all" || row.getValue(id) === value
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const plan = row.original
        return (
          <Button variant="ghost" size="sm" className="flex items-center gap-1" onClick={() => setSelectedPlan(plan)}>
            Details
            <ChevronRight className="h-4 w-4" />
          </Button>
        )
      },
    },
  ]

  const table = useReactTable({
    data: data?.plans || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  })

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px]">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (isError) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <UserCog className="h-5 w-5 text-purple-500" />
              Plan History
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center text-red-500">
            <p>Failed to load plan history. Please try again later.</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <UserCog className="h-5 w-5 text-purple-500" />
              Plan History
            </DialogTitle>
            <DialogDescription>View your subscription plan history and details.</DialogDescription>
          </DialogHeader>

          <AnimatePresence mode="wait">
            {selectedPlan ? (
              <motion.div
                key="plan-details"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-4">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPlan(null)} className="gap-2">
                    <ChevronRight className="h-4 w-4 rotate-180" />
                    Back to plans
                  </Button>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">{selectedPlan.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {format(selectedPlan.startDate, "MMM dd, yyyy")} -{" "}
                        {selectedPlan.endDate ? format(selectedPlan.endDate, "MMM dd, yyyy") : "Present"}
                      </p>
                    </div>
                    <Badge
                      className={`${
                        selectedPlan.status === "active"
                          ? "bg-green-100 text-green-800"
                          : selectedPlan.status === "expired"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {selectedPlan.status.charAt(0).toUpperCase() + selectedPlan.status.slice(1)}
                    </Badge>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium mb-2">Plan Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Price</p>
                        <p className="font-medium">
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                          }).format(selectedPlan.price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Billing Cycle</p>
                        <p className="font-medium">Monthly</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Start Date</p>
                        <p className="font-medium">{format(selectedPlan.startDate, "MMM dd, yyyy")}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">End Date</p>
                        <p className="font-medium">
                          {selectedPlan.endDate ? format(selectedPlan.endDate, "MMM dd, yyyy") : "Ongoing"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium mb-2">Features</h4>
                    {selectedPlan.features?.length ? (
                      <ul className="space-y-2">
                        {selectedPlan.features.map((feature, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">No features listed</p>
                    )}
                  </div>

                  {selectedPlan.status === "active" && (
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setSelectedPlan(null);
                          // Open change plan UI here
                        }}
                      >
                        Change Plan
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={() => setCancelConfirmOpen(true)}
                        disabled={isCanceling}
                      >
                        {isCanceling ? "Canceling..." : "Cancel Plan"}
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="plan-list"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="flex justify-between items-center mb-4">
                    <TabsList className="bg-muted/50">
                      <TabsTrigger value="all">All Plans</TabsTrigger>
                      <TabsTrigger value="active">Active</TabsTrigger>
                      <TabsTrigger value="expired">Expired</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="all" className="mt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Current Plan</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {currentPlanName}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {data?.currentPlan
                              ? `${new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                }).format(data.currentPlan.price)} / month`
                              : "Subscribe to a plan"}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Plan History</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{data?.plans.length || 0}</div>
                          <p className="text-xs text-muted-foreground mt-1">Total plans</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="flex justify-between gap-4 mb-4">
                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search plans..."
                          value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                          onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
                          className="pl-8"
                        />
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
                                No plan history found.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Showing {table.getFilteredRowModel().rows.length} of {data?.plans.length || 0} plans
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => table.nextPage()}
                          disabled={!table.getCanNextPage()}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* Cancel plan confirmation dialog */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Cancel Subscription
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your subscription? You&apos;ll lose access to premium features when your current billing cycle ends.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCanceling}>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                handleCancelPlan();
              }}
              disabled={isCanceling}
              className="bg-red-500 hover:bg-red-600"
            >
              {isCanceling ? "Canceling..." : "Cancel Subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
