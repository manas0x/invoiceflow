import React, { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Package, AlertCircle, Clock, ShoppingBag, Printer, ArrowRight } from 'lucide-react'
import { firestoreService } from '../services/firestoreService'
import { generateInvoicePDF } from '../utils/pdfGenerator'

const Dashboard = ({ setActiveTab }) => {
    const [products, setProducts] = useState([])
    const [invoices, setInvoices] = useState([])
    const [stats, setStats] = useState({
        totalSales: 0,
        totalStockValue: 0,
        lowStockCount: 0,
        expiringSoonCount: 0,
        recentSales: []
    })

    useEffect(() => {
        const unsubProducts = firestoreService.subscribeProducts(setProducts)
        const unsubInvoices = firestoreService.subscribeInvoices(setInvoices)
        return () => {
            unsubProducts()
            unsubInvoices()
        }
    }, [])

    useEffect(() => {
        const lowStock = products.filter(p => (Number(p.stock) || 0) <= (Number(p.minStock) || 0)).length

        const today = new Date()
        const nextMonth = new Date()
        nextMonth.setMonth(today.getMonth() + 1)

        const expiringSoon = products.filter(p => {
            if (!p.expDate) return false
            const expDate = new Date(p.expDate)
            return expDate > today && expDate <= nextMonth
        }).length

        const totalStockValue = products.reduce((acc, p) => acc + ((Number(p.purchasePrice) || 0) * (Number(p.stock) || 0)), 0)
        const totalSales = invoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)

        setStats({
            totalSales,
            totalStockValue,
            lowStockCount: lowStock,
            expiringSoonCount: expiringSoon,
            recentSales: invoices.slice(-5).reverse()
        })
    }, [products, invoices])

    const cards = [
        { label: 'Total Sales', value: `₹${stats.totalSales.toLocaleString()}`, icon: TrendingUp, color: '#10b981', bg: '#ecfdf5' },
        { label: 'Stock Value', value: `₹${stats.totalStockValue.toLocaleString()}`, icon: Package, color: '#3b82f6', bg: '#eff6ff' },
        { label: 'Low Stock Items', value: stats.lowStockCount, icon: AlertCircle, color: '#f59e0b', bg: '#fffbeb' },
        { label: 'Expiring Soon', value: stats.expiringSoonCount, icon: Clock, color: '#ef4444', bg: '#fef2f2' },
    ]

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <div className="dashboard-page space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {cards.map((card, i) => (
                    <div key={i} className="card flex items-center gap-4 p-5">
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: card.bg, color: card.color }}
                        >
                            <card.icon size={24} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase tracking-wider mb-0.5 truncate">{card.label}</p>
                            <h3 className="text-lg md:text-xl font-extrabold text-gray-900 truncate">{card.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 card p-0 overflow-hidden shadow-sm">
                    <div className="p-4 md:p-5 flex justify-between items-center border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800">Recent Sales</h3>
                        <button onClick={() => setActiveTab('invoices')} className="text-primary hover:text-primary-dark font-bold text-sm flex items-center gap-1 transition-colors">
                            View All <ArrowRight size={14} />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px] border-collapse">
                            <thead>
                                <tr className="text-left bg-gray-50/50 border-b border-gray-100">
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Bill #</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {stats.recentSales.length > 0 ? stats.recentSales.map((sale, i) => (
                                    <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="px-5 py-4 font-bold text-gray-700">#{sale.id?.slice(-4)}</td>
                                        <td className="px-5 py-4">
                                            <div className="font-bold text-gray-900">{sale.customerName}</div>
                                            <div className="text-[10px] text-gray-400 font-medium">{sale.date}</div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="font-extrabold text-primary">₹{Number(sale.totalAmount).toLocaleString()}</span>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <button
                                                onClick={() => generateInvoicePDF(sale)}
                                                className="p-2 bg-accent text-primary-dark hover:bg-primary-light/20 rounded-lg transition-all"
                                                title="Print Invoice"
                                            >
                                                <Printer size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="4" className="px-5 py-12 text-center text-gray-400 font-medium italic">No sales recorded today.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="card shadow-sm p-5">
                        <h3 className="text-lg font-bold text-gray-800 mb-5">Stock Status</h3>
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-bold text-gray-600">Low Stock Alert</span>
                                    <span className="text-sm font-extrabold text-red-500">{stats.lowStockCount} Items</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-red-500 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min((stats.lowStockCount / 10) * 100, 100)}%` }}
                                    ></div>
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 shadow-inner">
                                <h4 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-4">Quick Navigation</h4>
                                <div className="flex flex-col gap-3">
                                    <button onClick={() => setActiveTab('billing')} className="w-full flex items-center gap-3 p-3 bg-white hover:bg-primary/5 border border-gray-200 hover:border-primary/30 rounded-lg text-sm font-bold text-gray-700 transition-all shadow-sm group">
                                        <div className="p-1.5 bg-green-50 rounded-md group-hover:bg-green-100 transition-colors">
                                            <TrendingUp size={16} className="text-green-600" />
                                        </div>
                                        Present Sale (New Bill)
                                    </button>
                                    <button onClick={() => setActiveTab('purchases')} className="w-full flex items-center gap-3 p-3 bg-white hover:bg-primary/5 border border-gray-200 hover:border-primary/30 rounded-lg text-sm font-bold text-gray-700 transition-all shadow-sm group">
                                        <div className="p-1.5 bg-primary/10 rounded-md group-hover:bg-primary/20 transition-colors">
                                            <ShoppingBag size={16} className="text-primary" />
                                        </div>
                                        Add New Purchase
                                    </button>
                                    <button onClick={() => setActiveTab('inventory')} className="w-full flex items-center gap-3 p-3 bg-white hover:bg-primary/5 border border-gray-200 hover:border-primary/30 rounded-lg text-sm font-bold text-gray-700 transition-all shadow-sm group">
                                        <div className="p-1.5 bg-primary/10 rounded-md group-hover:bg-primary/20 transition-colors">
                                            <Package size={16} className="text-primary" />
                                        </div>
                                        View Inventory
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
