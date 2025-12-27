import React, { useState, useEffect } from 'react'
import { BarChart3, Download, Calendar, Filter, ArrowUpRight, ArrowDownRight, Package, TrendingUp, Wallet, PieChart } from 'lucide-react'
import * as XLSX from 'xlsx'
import { firestoreService } from '../services/firestoreService'

const Reports = () => {
    const [invoices, setInvoices] = useState([])
    const [products, setProducts] = useState([])
    const [purchases, setPurchases] = useState([])

    // Default dates: Start of current month to Today
    const [dateRange, setDateRange] = useState(() => {
        const now = new Date()
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const end = now.toISOString().split('T')[0]
        return { start, end }
    })

    useEffect(() => {
        const unsubInv = firestoreService.subscribeInvoices(setInvoices)
        const unsubProd = firestoreService.subscribeProducts(setProducts)
        const unsubPur = firestoreService.subscribePurchases(setPurchases)
        return () => {
            unsubInv()
            unsubProd()
            unsubPur()
        }
    }, [])

    // Filtered data based on selected date range
    const filteredInvoices = invoices.filter(inv => {
        const invDate = inv.date
        return invDate >= dateRange.start && invDate <= dateRange.end
    })

    const filteredPurchases = purchases.filter(pur => {
        const purDate = pur.date
        return purDate >= dateRange.start && purDate <= dateRange.end
    })

    // Totals logic
    const totalSales = filteredInvoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)
    const totalPurchase = filteredPurchases.reduce((acc, pur) => acc + (Number(pur.totalAmount) || 0), 0)

    // GST Calculation (Prices are inclusive of GST)

    const gstCollected = filteredInvoices.reduce((acc, inv) => {
        const invGst = (inv.items || []).reduce((sum, item) => {
            const itemTotal = item.price * item.quantity
            const gstContent = itemTotal - (itemTotal / (1 + (item.gst / 100)))
            return sum + gstContent
        }, 0)
        return acc + invGst
    }, 0)

    // Profit Calculation (Sales - Cost of Goods Sold)
    const totalCostOfGoodsSold = filteredInvoices.reduce((acc, inv) => {
        const invCost = (inv.items || []).reduce((sum, item) => {
            // Find original product to get purchase price (COGS)
            const product = products.find(p => p.id === item.id) || {}
            // Fallback to current purchase price if not stored in invoice item (simplified)
            const unitCost = Number(product.purchasePrice || 0)
            return sum + (unitCost * Number(item.quantity || 0))
        }, 0)
        return acc + invCost
    }, 0)

    const netProfit = totalSales - totalCostOfGoodsSold

    // Payment Mode Split
    const paymentModeSplit = filteredInvoices.reduce((acc, inv) => {
        const mode = inv.paymentMode || 'Cash'
        if (!acc[mode]) acc[mode] = 0
        acc[mode] += Number(inv.totalAmount)
        return acc
    }, {})

    // Top Selling Products logic
    const productStats = {}
    filteredInvoices.forEach(inv => {
        (inv.items || []).forEach(item => {
            if (!productStats[item.name]) productStats[item.name] = 0
            productStats[item.name] += Number(item.quantity)
        })
    })
    const topProducts = Object.entries(productStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)

    const exportSales = () => {
        const data = filteredInvoices.map(inv => ({
            "Invoice ID": inv.id,
            "Date": inv.date,
            "Customer": inv.customerName,
            "Items Count": (inv.items || []).length,
            "Total Amount (Incl)": inv.totalAmount,
            "Discount": inv.discount,
            "Final Payable": inv.totalAmount - (inv.discount || 0),
            "Payment Mode": inv.paymentMode
        }))
        const ws = XLSX.utils.json_to_sheet(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Sales Report")
        const fileName = `Sales_Report_${dateRange.start}_to_${dateRange.end}.xlsx`
        XLSX.writeFile(wb, fileName)
    }

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <div className="reports">
            {/* Filter Bar */}
            <div className="card mb-4" style={{ borderTop: '4px solid var(--primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={18} color="var(--primary)" />
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                                style={{ width: '150px' }}
                            />
                        </div>
                        <span>to</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                                style={{ width: '150px' }}
                            />
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            Showing {filteredInvoices.length} invoices
                        </div>
                    </div>
                    <button onClick={exportSales} style={{ width: isMobile ? '100%' : 'auto', background: 'var(--primary)', color: 'white', fontWeight: 700, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '8px' }}>
                        <Download size={20} /> Export Excel
                    </button>
                </div>
            </div>

            {/* Key Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? '12px' : '20px', marginBottom: '24px' }}>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '24px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Sales (Incl.)</div>
                    <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 800, color: 'var(--primary)' }}>₹{totalSales.toLocaleString()}</div>
                    <TrendingUp size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: 'var(--primary)' }} />
                </div>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '24px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>GST Collected</div>
                    <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 800, color: '#3b82f6' }}>₹{gstCollected.toLocaleString()}</div>
                    <Wallet size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: '#3b82f6' }} />
                </div>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '24px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Purchase</div>
                    <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 800, color: '#ef4444' }}>₹{totalPurchase.toLocaleString()}</div>
                    <Package size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: '#ef4444' }} />
                </div>

                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '24px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Net Profit</div>
                    <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 800 }}>₹{netProfit.toLocaleString()}</div>
                    <TrendingUp size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.2, color: 'white' }} />
                </div>

                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '24px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Invoices</div>
                    <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 800, color: '#8b5cf6' }}>{filteredInvoices.length}</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                {/* Top Products */}
                <div className="card">
                    <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                        <BarChart3 size={20} color="var(--primary)" /> Top Products
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {topProducts.length > 0 ? topProducts.map(([name, qty], i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '14px' }}>{qty} Units</span>
                                </div>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No sales data</div>
                        )}
                    </div>
                </div>

                {/* Payment Mode Analysis */}
                <div className="card">
                    <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                        <PieChart size={20} color="var(--primary)" /> Payment Split
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {Object.entries(paymentModeSplit).length > 0 ? Object.entries(paymentModeSplit).map(([mode, amount], i) => (
                            <div key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{mode}</span>
                                    <span style={{ fontWeight: 700, fontSize: '14px' }}>₹{amount.toLocaleString()}</span>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${(amount / (totalSales || 1)) * 100}%`, height: '100%', background: mode === 'Cash' ? 'var(--primary)' : '#3b82f6' }}></div>
                                </div>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No data available</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Inventory Valuation Section */}
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                        <Package size={20} color="var(--primary)" /> Inventory Valuation
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Latest snapshot</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px' }}>
                    <div style={{ padding: '20px', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Varieties</div>
                        <div style={{ fontSize: '20px', fontWeight: 800 }}>{products.length} Items</div>
                    </div>
                    <div style={{ padding: '20px', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Current Value</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>
                            ₹{products.reduce((acc, p) => acc + (Number(p.purchasePrice || 0) * Number(p.stock || 0)), 0).toLocaleString()}
                        </div>
                    </div>
                    <div style={{ padding: '20px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7' }}>
                        <div style={{ color: '#166534', fontSize: '13px', marginBottom: '8px', fontWeight: 600 }}>Business Status</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#15803d' }}>Stocks are Healthy</div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Reports
