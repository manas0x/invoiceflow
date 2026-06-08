import React, { useState, useEffect, useMemo } from 'react'
import {
    BarChart3,
    Download,
    Calendar,
    Search,
    Package,
    TrendingUp,
    ArrowUpRight,
    Filter,
    Layers,
    FileStack,
    Receipt,
    ShoppingCart,
    FileDown
} from 'lucide-react'
import { firestoreService } from '../services/firestoreService'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useBusiness } from '../context/BusinessContext'

const Cumulative = () => {
    const business = useBusiness()
    const [invoices, setInvoices] = useState([])
    const [purchases, setPurchases] = useState([])
    const [products, setProducts] = useState([])
    const [searchTerm, setSearchTerm] = useState('')
    const [activeView, setActiveView] = useState('sales') // 'sales' or 'purchase'

    // Default: Last 7 days
    const [dateRange, setDateRange] = useState(() => {
        const today = new Date().toISOString().split('T')[0]
        const lastWeek = new Date()
        lastWeek.setDate(lastWeek.getDate() - 7)
        return {
            start: lastWeek.toISOString().split('T')[0],
            end: today
        }
    })

    useEffect(() => {
        const unsubInvoices = firestoreService.subscribeInvoices(setInvoices)
        const unsubPurchases = firestoreService.subscribePurchases(setPurchases)
        const unsubProducts = firestoreService.subscribeProducts(setProducts)
        return () => {
            unsubInvoices()
            unsubPurchases()
            unsubProducts()
        }
    }, [])

    const standardizeDate = (dateStr, fallback) => {
        if (!dateStr && !fallback) return '';
        const raw = dateStr || fallback;
        if (!raw) return '';
        if (raw.includes('T')) return raw.split('T')[0];
        if (raw.includes('-') && raw.split('-')[0].length === 2) {
            const [d, m, y] = raw.split('-');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return raw;
    }

    // Processed Data
    const aggregatedData = useMemo(() => {
        const productMap = {}
        const dataSet = activeView === 'sales' ? invoices : purchases

        const filtered = dataSet.filter(record => {
            const recordDate = standardizeDate(record.date, record.createdAt)
            return recordDate >= dateRange.start && recordDate <= dateRange.end
        })

        filtered.forEach(record => {
            const recordDate = standardizeDate(record.date, record.createdAt);
            (record.items || []).forEach(item => {
                const pId = item.id || item.name;
                if (!productMap[pId]) {
                    const productInfo = products.find(p => p.id === item.id) || {}
                    productMap[pId] = {
                        id: item.id,
                        name: item.name,
                        category: productInfo.category || (activeView === 'sales' ? 'General' : 'Stock'),
                        unit: productInfo.unit || 'Unit',
                        totalQty: 0,
                        totalValue: 0,
                        lastTransaction: recordDate,
                        transactionCount: 0
                    }
                }

                productMap[pId].totalQty += Number(item.quantity || 0)
                // For sales, we use item.price. For purchases, we use item.purchasePrice or item.price
                const price = activeView === 'sales' ? (item.price || 0) : (item.purchasePrice || item.price || 0)
                productMap[pId].totalValue += (Number(price) * Number(item.quantity || 0))
                productMap[pId].transactionCount += 1

                if (recordDate > productMap[pId].lastTransaction) {
                    productMap[pId].lastTransaction = recordDate
                }
            })
        })

        return Object.values(productMap).sort((a, b) => b.totalQty - a.totalQty)
    }, [invoices, purchases, products, dateRange, activeView])

    const filteredTableData = aggregatedData.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const stats = useMemo(() => {
        const dataSet = activeView === 'sales' ? invoices : purchases
        const filtered = dataSet.filter(record => {
            const recordDate = standardizeDate(record.date, record.createdAt)
            return recordDate >= dateRange.start && recordDate <= dateRange.end
        })

        if (aggregatedData.length === 0) return { totalValue: 0, topProduct: 'N/A', count: 0 }
        const total = aggregatedData.reduce((sum, p) => sum + p.totalValue, 0)
        const top = aggregatedData[0]?.name || 'N/A'
        return { totalValue: total, topProduct: top, count: filtered.length }
    }, [aggregatedData, invoices, purchases, dateRange, activeView])

    const exportToPDF = () => {
        const doc = new jsPDF()
        const title = activeView === 'sales' ? "Cumulative Sales Report" : "Cumulative Purchase Report"
        const fileName = `Cumulative_${activeView === 'sales' ? 'Sales' : 'Purchase'}_${dateRange.start}_to_${dateRange.end}.pdf`

        // Header
        doc.setFontSize(22)
        doc.setTextColor(16, 116, 73) // Emerald Primary
        doc.text(business.appName.toUpperCase(), 105, 15, { align: 'center' })
        
        doc.setFontSize(14)
        doc.setTextColor(100)
        doc.text(title, 105, 25, { align: 'center' })
        
        doc.setFontSize(10)
        doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, 105, 32, { align: 'center' })

        // Stats boxes (conceptual)
        doc.setDrawColor(200)
        doc.line(15, 38, 195, 38)
        
        doc.setFont('helvetica', 'bold')
        doc.text(`Unique Items:`, 20, 45)
        doc.setFont('helvetica', 'normal')
        doc.text(`${aggregatedData.length}`, 45, 45)
        
        doc.setFont('helvetica', 'bold')
        doc.text(`Top Item:`, 110, 45)
        doc.setFont('helvetica', 'normal')
        doc.text(`${stats.topProduct}`, 135, 45)

        doc.setFont('helvetica', 'bold')
        doc.text(`Total ${activeView === 'sales' ? 'Bills' : 'Entries'}:`, 110, 52)
        doc.setFont('helvetica', 'normal')
        doc.text(`${stats.count}`, 135, 52)

        // Table
        const tableRows = filteredTableData.map(p => [
            p.name,
            p.category,
            `${p.totalQty} ${p.unit}`,
            p.lastTransaction
        ])

        autoTable(doc, {
            startY: 60,
            head: [['Product Name', 'Category', 'Quantity', 'Last Transaction']],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [16, 116, 73], fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 3 },
            alternateRowStyles: { fillColor: [240, 250, 240] }
        })

        doc.setFontSize(10)
        doc.setTextColor(150)
        const pageCount = doc.internal.getNumberOfPages()
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i)
            doc.text(`Generated on: ${new Date().toLocaleString()} - Page ${i} of ${pageCount}`, 15, 285)
        }

        doc.save(fileName)
    }

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <div className="space-y-6">
            {/* View Switcher Tabs */}
            <div className="flex p-1 bg-gray-100 rounded-xl w-full sm:w-fit" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
                <button
                    onClick={() => setActiveView('sales')}
                    className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'sales' ? 'bg-primary text-white shadow-md' : 'text-muted hover:text-primary'}`}
                >
                    <TrendingUp size={16} />
                    Cumulative {business.getTerm('orders')}
                </button>
                <button
                    onClick={() => setActiveView('purchase')}
                    className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'purchase' ? 'bg-primary text-white shadow-md' : 'text-muted hover:text-primary'}`}
                >
                    <ShoppingCart size={16} />
                    Cumulative Purchases
                </button>
            </div>

            {/* Header Controls */}
            <div className="card shadow-sm border p-4 md:p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border bg-background w-full sm:w-auto" style={{ borderColor: 'var(--border)' }}>
                            <Calendar size={16} className="text-primary hidden sm:block" />
                            <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
                                <input
                                    type="date"
                                    className="bg-transparent border-none text-xs font-bold focus:outline-none min-w-[110px]"
                                    style={{ color: 'var(--text-main)' }}
                                    value={dateRange.start}
                                    onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                />
                                <span className="text-[10px] font-black text-muted uppercase px-1">to</span>
                                <input
                                    type="date"
                                    className="bg-transparent border-none text-xs font-bold focus:outline-none min-w-[110px]"
                                    style={{ color: 'var(--text-main)' }}
                                    value={dateRange.end}
                                    onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="relative group w-full md:w-64">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder={`Search ${activeView === 'sales' ? 'sales' : 'purchases'}...`}
                                className="pl-10 pr-4 py-2 rounded-xl border bg-background text-sm font-medium w-full focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        onClick={exportToPDF}
                        className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        <FileDown size={18} /> Export PDF
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">

                <div className="card p-3 md:p-5 shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                            <Receipt size={16} />
                        </div>
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Total {activeView === 'sales' ? 'Bills' : 'Entries'}</span>
                    </div>
                    <div className="text-base md:text-2xl font-black" style={{ color: 'var(--text-main)' }}>
                        {stats.count} {activeView === 'sales' ? business.getTerm('orders') : 'Records'}
                    </div>
                </div>

                <div className="card p-3 md:p-5 shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                            <Package size={16} />
                        </div>
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Top {activeView === 'sales' ? 'Moving' : 'Purchased'}</span>
                    </div>
                    <div className="text-xs md:text-xl font-bold truncate" style={{ color: 'var(--text-main)' }}>
                        {stats.topProduct}
                    </div>
                </div>

                <div className="card p-3 md:p-5 shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                            <Layers size={16} />
                        </div>
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Unique Items</span>
                    </div>
                    <div className="text-base md:text-2xl font-black truncate" style={{ color: 'var(--text-main)' }}>
                        {aggregatedData.length} Items
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="card p-0 overflow-hidden shadow-sm border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                    <FileStack size={18} className="text-primary" />
                    <h3 className="font-bold uppercase text-sm tracking-tight" style={{ color: 'var(--text-main)' }}>
                        Product-wise Cumulative {activeView === 'sales' ? 'Sales' : 'Purchases'}
                    </h3>
                </div>

                {isMobile ? (
                    <div className="p-4 flex flex-col gap-4">
                        {filteredTableData.length > 0 ? filteredTableData.map((p, idx) => (
                            <div key={idx} className="mobile-card">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="min-w-0">
                                        <div className="font-black text-base truncate" style={{ color: 'var(--text-main)' }}>{p.name}</div>
                                    </div>
                                    <span className="tag">{p.category}</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 py-3 border-y" style={{ borderColor: 'var(--border)' }}>
                                    <div>
                                        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Quantity</p>
                                        <div className="font-black text-lg" style={{ color: 'var(--text-main)' }}>{p.totalQty} <span className="text-xs font-bold text-muted">{p.unit}</span></div>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center mt-3">
                                    <div className="text-[10px] font-black bg-accent px-2 py-1 rounded-md text-primary">{p.transactionCount} {activeView === 'sales' ? 'BILLS' : 'ENTRIES'}</div>
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-muted uppercase">
                                        <Calendar size={10} /> {p.lastTransaction}
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-10 text-muted italic text-sm">No data found.</div>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">Product</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">Category</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted text-right">{activeView === 'sales' ? 'Sold' : 'Purchased'} Qty</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted text-center">Last {activeView === 'sales' ? 'Transaction' : 'Entry'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ divideColor: 'var(--border)' }}>
                                {filteredTableData.length > 0 ? filteredTableData.map((p, idx) => (
                                    <tr key={idx} className="hover:bg-primary/5 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="font-bold group-hover:text-primary transition-colors" style={{ color: 'var(--text-main)' }}>{p.name}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="tag">{p.category}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="font-black text-lg" style={{ color: 'var(--text-main)' }}>{p.totalQty}</div>
                                            <div className="text-[10px] font-bold text-muted uppercase">{p.unit}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border shadow-sm">
                                                <Calendar size={12} className="text-muted" />
                                                <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{p.lastTransaction}</span>
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <div className="p-4 rounded-full bg-background border border-border shadow-inner">
                                                    <Search size={32} className="text-muted opacity-20" />
                                                </div>
                                                <p className="text-sm font-bold text-muted italic">No data found for the selected period.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Note */}
            <div className="p-4 rounded-2xl flex gap-3 items-start border" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                <ArrowUpRight size={20} className="text-emerald-500 mt-1 shrink-0" />
                <div>
                    <h4 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Inventory Analytics</h4>
                    <p className="text-xs mt-1 leading-relaxed opacity-80" style={{ color: 'var(--text-secondary)' }}>
                        This cumulative report helps you track product movement over time. {activeView === 'sales' ? 'Use this to identify top-selling products and verify stock outflow.' : 'Use this to audit your purchase history and identify your main inventory investments.'}
                    </p>
                </div>
            </div>
        </div>
    )
}

export default Cumulative
