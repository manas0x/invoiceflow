import React, { useState, useEffect } from 'react'

import { TrendingUp, TrendingDown, Package, AlertCircle, Clock, ShoppingBag, Printer, ArrowRight, Coins, Database, CheckCircle, Loader, FileStack } from 'lucide-react'
import { firestoreService } from '../services/firestoreService'
import { generateInvoicePDF } from '../utils/pdfGenerator'
import { showSuccess, showError } from '../utils/alert'

const Dashboard = ({ setActiveTab, setShowLowStock }) => {
    const [products, setProducts] = useState([])
    const [invoices, setInvoices] = useState([])
    const [customers, setCustomers] = useState([])
    const [payments, setPayments] = useState([])
    const [saleReturns, setSaleReturns] = useState([])
    const [stats, setStats] = useState({
        totalSales: 0,
        todaysSales: 0,
        todaysProfit: 0,
        totalCredit: 0,
        totalStockValue: 0,
        lowStockCount: 0,
        expiringSoonCount: 0,
        recentSales: []
    })


    useEffect(() => {
        const unsubProducts = firestoreService.subscribeProducts(setProducts)
        const unsubInvoices = firestoreService.subscribeInvoices(setInvoices)
        const unsubCustomers = firestoreService.subscribeCustomers(setCustomers)
        const unsubCustomerPayments = firestoreService.subscribeCustomerPayments(setPayments)
        const unsubReturns = firestoreService.subscribeSaleReturns(setSaleReturns)
        return () => {
            unsubProducts()
            unsubInvoices()
            unsubCustomers()
            unsubCustomerPayments()
            unsubReturns()
        }
    }, [])

    useEffect(() => {
        if (!products.length && !invoices.length) return

        const lowStock = products.filter(p => (Number(p.stock) || 0) <= (Number(p.minStock) || 0)).length

        const today = new Date()
        const todayStr = today.toISOString().split('T')[0]
        const nextMonth = new Date()
        nextMonth.setMonth(today.getMonth() + 1)

        const expiringSoon = products.filter(p => {
            if (!p.expDate) return false
            const expDate = new Date(p.expDate)
            return expDate > today && expDate <= nextMonth
        }).length

        const totalStockValue = products.reduce((acc, p) => acc + ((Number(p.purchasePrice) || 0) * (Number(p.stock) || 0)), 0)

        // Sales Calculations
        const totalSales = invoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)

        // Today's Metrics
        const todaysInvoices = invoices.filter(inv => (inv.date || '').split('T')[0] === todayStr)
        const todaysSales = todaysInvoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)

        // Profit Calculation (Replicated from Billing logic)
        const todaysProfit = todaysInvoices.reduce((totalProfit, inv) => {
            const itemsProfit = (inv.items || []).reduce((acc, item) => {
                const product = products.find(p => p.id === item.id)

                // Determine Cost Price
                let bagPurchasePrice = 0
                if (item.originalPrice !== undefined && item.originalPrice !== null) {
                    bagPurchasePrice = Number(item.originalPrice)
                } else if (item.costPrice !== undefined && item.costPrice !== null) {
                    bagPurchasePrice = Number(item.costPrice)
                } else if (product) {
                    bagPurchasePrice = Number(product.purchasePrice || 0)
                }

                let unitCost = Number(bagPurchasePrice)

                // Handle Loose Items Cost
                const isLoose = item.salesType === 'Loose' || (item.name || '').toLowerCase().includes('(loose)')
                if (isLoose) {
                    let weight = Number(item.bagWeight)
                    if (!weight && product) weight = Number(product.bagWeight)
                    if (!weight) weight = 50
                    unitCost = unitCost / weight
                }

                const itemProfit = (Number(item.price) - unitCost) * Number(item.quantity)
                return acc + itemProfit
            }, 0)
            return totalProfit + itemsProfit - (Number(inv.discount) || 0)
        }, 0)

        // Credit Calculations — Per-Customer Due Map
        // Build a map: key = phone || normalised name, value = due balance
        const customerDueMap = {}
        invoices.forEach(inv => {
            const isCredit = (inv.paymentMode || '').toLowerCase() === 'credit'
            if (!isCredit) return
            const key = inv.customerPhone || (inv.customerName || '').trim().toLowerCase()
            if (!customerDueMap[key]) customerDueMap[key] = 0
            customerDueMap[key] += Number(inv.totalAmount) || 0
        })
        payments.forEach(p => {
            // Skip manual charges (EXPENSE type) — they add to due, not reduce it
            if (p.type === 'EXPENSE' || p.mode === 'Manual Charge') return
            const key = p.customerPhone || (p.customerName || '').trim().toLowerCase()
            if (!customerDueMap[key]) customerDueMap[key] = 0
            customerDueMap[key] -= Number(p.amount) || 0
        })
        // Subtract sale returns — goods returned reduce the outstanding due
        saleReturns.forEach(r => {
            const key = r.customerPhone || (r.customerName || '').trim().toLowerCase()
            if (!customerDueMap[key]) customerDueMap[key] = 0
            customerDueMap[key] -= Number(r.totalRefund) || 0
        })
        // Sum only customers who still have a positive balance
        const totalCredit = Object.values(customerDueMap)
            .filter(due => due > 0)
            .reduce((acc, due) => acc + due, 0)


        // Sort for Recent Sales (Higher Bill Number First)
        const sortedInvoices = [...invoices].filter(i => i.id).sort((a, b) => {
            // ID Format: INV-0001. String comparison works for padded numbers.
            return b.id.localeCompare(a.id)
        })

        setStats({
            totalSales,
            todaysSales,
            todaysProfit,
            totalCredit,
            totalStockValue,
            lowStockCount: lowStock,
            expiringSoonCount: expiringSoon,
            recentSales: sortedInvoices.slice(0, 5)
        })
    }, [products, invoices, payments, saleReturns])

    const hydrateSaleCustomer = (sale) => {
        const name = (sale.customerName || '').trim().toLowerCase()
        const phone = (sale.customerPhone || '').replace(/\D/g, '')
        const customer = customers.find(record => {
            const recordName = (record.name || '').trim().toLowerCase()
            const recordPhone = (record.phone || '').replace(/\D/g, '')
            return (phone && recordPhone && phone === recordPhone) || (name && recordName && name === recordName)
        })
        return customer ? {
            ...sale,
            customerPhone: customer.phone || sale.customerPhone || '',
            customerAddress: customer.address || sale.customerAddress || ''
        } : sale
    }

    const cards = [
        {
            label: "Today's Sales",
            value: `Rs.${stats.todaysSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: TrendingUp,
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.1)',
            onClick: () => setActiveTab('invoices')
        },
        {
            label: "Today's Profit",
            value: `Rs.${stats.todaysProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: Coins,
            color: '#d97706',
            bg: 'rgba(217, 119, 6, 0.1)',
            onClick: () => setActiveTab('invoices')
        },
        {
            label: 'Total Due (Credit)',
            value: `Rs.${stats.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: TrendingDown,
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.1)',
            onClick: () => setActiveTab('customers')
        },
        {
            label: 'Low Stock Items',
            value: stats.lowStockCount,
            icon: AlertCircle,
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.1)',
            onClick: () => {
                setActiveTab('inventory');
                if (setShowLowStock) setShowLowStock(true);
            },
            pulse: stats.lowStockCount > 0
        },
        {
            label: 'Stock Value',
            value: `Rs.${stats.totalStockValue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            icon: Package,
            color: '#3b82f6',
            bg: 'rgba(59, 130, 246, 0.1)',
            onClick: () => setActiveTab('inventory')
        },
        {
            label: 'Sales (All Time)',
            value: `Rs.${stats.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            icon: Clock,
            color: '#6366f1',
            bg: 'rgba(99, 102, 241, 0.1)',
            onClick: () => setActiveTab('invoices')
        }
    ]

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <div className="dashboard-page space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {cards.map((card, i) => (
                    <div
                        key={i}
                        className={`card flex items-center gap-4 p-5 ${card.onClick ? 'cursor-pointer hover:shadow-md transition-all active:scale-95' : ''}`}
                        onClick={card.onClick}
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                        <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${card.pulse ? 'animate-pulse ring-2 ring-red-500' : ''}`}
                            style={{ background: card.bg, color: card.color }}
                        >
                            <card.icon size={24} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider mb-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{card.label}</p>
                            <h3 className="text-lg md:text-xl font-extrabold truncate" style={{ color: 'var(--text-main)' }}>{card.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 card p-0 overflow-hidden shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="p-4 md:p-5 flex justify-between items-center border-b" style={{ borderColor: 'var(--border)' }}>
                        <h3 className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>Recent Sales</h3>
                        <button onClick={() => setActiveTab('invoices')} className="text-xs font-bold flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: 'var(--primary)' }}>
                            View All <ArrowRight size={14} />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px] border-collapse">
                            <thead>
                                <tr className="text-left border-b" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Bill #</th>
                                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Customer</th>
                                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Amount</th>
                                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ divideColor: 'var(--border)' }}>
                                {stats.recentSales.length > 0 ? stats.recentSales.map((sale, i) => (
                                    <tr key={i} className="transition-colors hover:bg-black/5">
                                        <td className="px-5 py-4 font-bold" style={{ color: 'var(--text-secondary)' }}>#{sale.id?.slice(-4)}</td>
                                        <td className="px-5 py-4">
                                            <div className="font-bold" style={{ color: 'var(--text-main)' }}>{sale.customerName}</div>
                                            <div className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{sale.date}</div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="font-extrabold" style={{ color: 'var(--primary)' }}>Rs.{Number(sale.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <button
                                                onClick={() => generateInvoicePDF(hydrateSaleCustomer(sale))}
                                                className="p-2 rounded-lg transition-all hover:bg-primary/20"
                                                title="Print Invoice"
                                                style={{ background: 'var(--accent)', color: 'var(--text-main)' }}
                                            >
                                                <Printer size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="4" className="px-5 py-12 text-center font-medium italic" style={{ color: 'var(--text-muted)' }}>No sales recorded today.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="card shadow-sm p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        <h3 className="text-lg font-bold mb-5" style={{ color: 'var(--text-main)' }}>Stock Status</h3>
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>Low Stock Alert</span>
                                    <span className="text-sm font-extrabold" style={{ color: 'var(--danger)' }}>{stats.lowStockCount} Items</span>
                                </div>
                                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--background)' }}>
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min((stats.lowStockCount / 10) * 100, 100)}%`, background: 'var(--danger)' }}
                                    ></div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border shadow-inner" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                <h4 className="text-xs font-extrabold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Quick Navigation</h4>
                                <div className="flex flex-col gap-3">
                                    <button onClick={() => setActiveTab('billing')} className="w-full flex items-center gap-3 p-3 border rounded-lg text-sm font-bold transition-all shadow-sm group hover:border-primary/30"
                                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)' }}>
                                        <div className="p-1.5 rounded-md transition-colors group-hover:bg-green-100" style={{ background: 'var(--accent)' }}>
                                            <TrendingUp size={16} className="text-green-600" />
                                        </div>
                                        Present Sale (New Bill)
                                    </button>
                                    <button onClick={() => setActiveTab('purchases')} className="w-full flex items-center gap-3 p-3 border rounded-lg text-sm font-bold transition-all shadow-sm group hover:border-primary/30"
                                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)' }}>
                                        <div className="p-1.5 rounded-md transition-colors group-hover:bg-primary/20" style={{ background: 'var(--accent)' }}>
                                            <ShoppingBag size={16} style={{ color: 'var(--primary)' }} />
                                        </div>
                                        Add New Purchase
                                    </button>
                                    <button onClick={() => setActiveTab('inventory')} className="w-full flex items-center gap-3 p-3 border rounded-lg text-sm font-bold transition-all shadow-sm group hover:border-primary/30"
                                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)' }}>
                                        <div className="p-1.5 rounded-md transition-colors group-hover:bg-primary/20" style={{ background: 'var(--accent)' }}>
                                            <Package size={16} style={{ color: 'var(--primary)' }} />
                                        </div>
                                        View Inventory
                                    </button>
                                    <button onClick={() => setActiveTab('cumulative')} className="w-full flex items-center gap-3 p-3 border rounded-lg text-sm font-bold transition-all shadow-sm group hover:border-primary/30"
                                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)' }}>
                                        <div className="p-1.5 rounded-md transition-colors group-hover:bg-primary/20" style={{ background: 'var(--accent)' }}>
                                            <FileStack size={16} style={{ color: 'var(--primary)' }} />
                                        </div>
                                        Cumulative Analysis
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    )
}

export default Dashboard
