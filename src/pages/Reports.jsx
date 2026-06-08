import React, { useState, useEffect } from 'react'
import { BarChart3, Download, Calendar, Filter, ArrowUpRight, ArrowDownRight, Package, TrendingUp, Wallet, PieChart, CreditCard, Banknote, CheckCircle, Clock } from 'lucide-react'
import * as XLSX from 'xlsx'
import { firestoreService } from '../services/firestoreService'
import { useBusiness } from '../context/BusinessContext'

const Reports = () => {
    const { business } = useBusiness();
    const [invoices, setInvoices] = useState([])
    const [products, setProducts] = useState([])
    const [purchases, setPurchases] = useState([])
    const [payments, setPayments] = useState([])

    // Default dates: Today
    const [dateRange, setDateRange] = useState(() => {
        const today = new Date().toISOString().split('T')[0]
        return { start: today, end: today }
    })

    useEffect(() => {
        const unsubInv = firestoreService.subscribeInvoices(setInvoices)
        const unsubProd = firestoreService.subscribeProducts(setProducts)
        const unsubPur = firestoreService.subscribePurchases(setPurchases)
        const unsubPay = firestoreService.subscribeCustomerPayments(setPayments)
        return () => {
            unsubInv()
            unsubProd()
            unsubPur()
            unsubPay()
        }
    }, [])

    // Helper to normalize any date string to YYYY-MM-DD
    const standardizeDate = (dateStr, fallback) => {
        if (!dateStr && !fallback) return '';
        const raw = dateStr || fallback;
        if (!raw) return '';

        // If it's ISO (contains T), take the date part
        if (raw.includes('T')) return raw.split('T')[0];

        // If it's DD-MM-YYYY, convert to YYYY-MM-DD
        if (raw.includes('-') && raw.split('-')[0].length === 2) {
            const [d, m, y] = raw.split('-');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }

        return raw; // Already YYYY-MM-DD or other
    };

    // Filtered data based on selected date range
    const filteredInvoices = invoices.filter(inv => {
        const invDate = standardizeDate(inv.date, inv.createdAt);
        return invDate >= dateRange.start && invDate <= dateRange.end;
    });

    const filteredPurchases = purchases.filter(pur => {
        const purDate = standardizeDate(pur.date, pur.createdAt);
        return purDate >= dateRange.start && purDate <= dateRange.end;
    });

    // Totals — use totalAmount (same as Dashboard) for consistency
    const totalSales = filteredInvoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)
    const totalPurchase = filteredPurchases.reduce((acc, pur) => acc + (Number(pur.totalAmount) || 0), 0)

    // Cash vs Credit breakdown
    const cashSales = filteredInvoices
        .filter(inv => (inv.paymentMode || '').toLowerCase() !== 'credit')
        .reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)
    const creditSales = filteredInvoices
        .filter(inv => (inv.paymentMode || '').toLowerCase() === 'credit')
        .reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0)

    // Per-customer due map (same logic as Dashboard & Customers page)
    const customerDueMap = {}
    filteredInvoices.forEach(inv => {
        if ((inv.paymentMode || '').toLowerCase() !== 'credit') return
        const key = inv.customerPhone || (inv.customerName || '').trim().toLowerCase()
        if (!customerDueMap[key]) customerDueMap[key] = 0
        customerDueMap[key] += Number(inv.totalAmount) || 0
    })
    // Subtract ALL payments (not just filtered by date) to get real outstanding
    payments.forEach(p => {
        if (p.type === 'EXPENSE' || p.mode === 'Manual Charge') return
        const key = p.customerPhone || (p.customerName || '').trim().toLowerCase()
        if (!customerDueMap[key]) customerDueMap[key] = 0
        customerDueMap[key] -= Number(p.amount) || 0
    })
    const receivedCredit = creditSales - Math.max(0, Object.values(customerDueMap).filter(d => d > 0).reduce((a, b) => a + b, 0))
    const remainingCredit = Math.max(0, Object.values(customerDueMap).filter(d => d > 0).reduce((a, b) => a + b, 0))


    // GST Calculation (Prices are inclusive of GST)

    // Helper for new GST logic: 5% margin on cost
    const calculateInvoiceGstReturn = (items) => {
        return (items || []).reduce((sum, item) => {
            const product = products.find(p => p.id === item.id) || {}
            let bagPurchasePrice = 0;
            if (item.originalPrice !== undefined && item.originalPrice !== null) {
                bagPurchasePrice = Number(item.originalPrice);
            } else if (item.costPrice !== undefined && item.costPrice !== null) {
                bagPurchasePrice = Number(item.costPrice);
            } else if (product) {
                bagPurchasePrice = Number(product.purchasePrice || 0);
            }

            let unitCost = bagPurchasePrice;
            const isLoose = item.salesType === 'Loose' || (item.name || '').toLowerCase().includes('(loose)');
            if (isLoose) {
                let weight = Number(item.bagWeight) || Number(product.bagWeight) || 50;
                unitCost = bagPurchasePrice / weight;
            }

            const itemCost = unitCost * Number(item.quantity || 0);
            const taxableMargin = itemCost * 0.05;
            return sum + (taxableMargin * (Number(item.gst || 0) / 100));
        }, 0);
    };

    const gstCollected = filteredInvoices.reduce((acc, inv) => acc + calculateInvoiceGstReturn(inv.items), 0)

    // Profit Calculation (Sales - Cost of Goods Sold)
    const totalCostOfGoodsSold = filteredInvoices.reduce((acc, inv) => {
        const invCost = (inv.items || []).reduce((sum, item) => {
            const product = products.find(p => p.id === item.id) || {}
            // Calculate Cost of Goods Sold (COGS)
            // Use stored `originalPrice` (Purchase Price at time of sale) if available, else check `costPrice` (legacy), else current product price.
            // Note: `originalPrice` is the BAG PRICE (Purchase Price of stock unit).

            let bagPurchasePrice = 0;
            if (item.originalPrice !== undefined && item.originalPrice !== null) {
                bagPurchasePrice = Number(item.originalPrice);
            } else if (item.costPrice !== undefined && item.costPrice !== null) {
                bagPurchasePrice = Number(item.costPrice);
            } else if (product) {
                bagPurchasePrice = Number(product.purchasePrice || 0);
            }

            let unitCost = bagPurchasePrice;

            // Handle Loose Items Cost Calculation
            // Robust check for Loose items (Legacy support + New Logic)
            const isLoose = item.salesType === 'Loose' ||
                (item.name || '').toLowerCase().includes('(loose)');

            if (isLoose) {
                // Get bag weight from item (if stored) or current product config, default to 50
                let weight = Number(item.bagWeight);
                if (!weight && product) weight = Number(product.bagWeight);
                if (!weight) weight = 50;

                // Cost per KG = Bag Purchase Price / Bag Weight
                unitCost = bagPurchasePrice / weight;
            }

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
            "GST Return (5% Margin)": calculateInvoiceGstReturn(inv.items).toFixed(2),
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
            <div className="card mb-6 p-4 md:p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    {/* Date Range Row */}
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Calendar size={16} className="text-primary shrink-0 hidden sm:block" />
                        <div className="flex flex-1 items-center gap-2 min-w-0">
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                                min="2025-12-31"
                                className="flex-1 min-w-0 px-2 py-2 rounded-lg border text-sm font-bold"
                                style={{ background: 'var(--background)', color: 'var(--text-main)', borderColor: 'var(--border)' }}
                            />
                            <span className="text-muted font-bold text-xs shrink-0">to</span>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                                min="2025-12-31"
                                className="flex-1 min-w-0 px-2 py-2 rounded-lg border text-sm font-bold"
                                style={{ background: 'var(--background)', color: 'var(--text-main)', borderColor: 'var(--border)' }}
                            />
                        </div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted whitespace-nowrap hidden sm:block">
                            {filteredInvoices.length} Bills
                        </div>
                    </div>
                    <button onClick={exportSales} className="w-full md:w-auto bg-primary text-white font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all">
                        <Download size={18} /> Export Excel
                    </button>
                </div>
            </div>

            {/* Key Metrics Row 1: Sales summary */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? '12px' : '20px', marginBottom: '16px' }}>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Total {business.getTerm('orders')}</div>
                    <div style={{ fontSize: isMobile ? '16px' : '22px', fontWeight: 800, color: 'var(--primary)' }}>{business.currency}{totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <TrendingUp size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: 'var(--primary)' }} />
                </div>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Cash {business.getTerm('orders')}</div>
                    <div style={{ fontSize: isMobile ? '16px' : '22px', fontWeight: 800, color: '#10b981' }}>{business.currency}{cashSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <Banknote size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: '#10b981' }} />
                </div>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Credit {business.getTerm('orders')}</div>
                    <div style={{ fontSize: isMobile ? '16px' : '22px', fontWeight: 800, color: '#f59e0b' }}>{business.currency}{creditSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <CreditCard size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: '#f59e0b' }} />
                </div>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Total Bills</div>
                    <div style={{ fontSize: isMobile ? '16px' : '22px', fontWeight: 800, color: 'var(--secondary)' }}>{filteredInvoices.length}</div>
                </div>
            </div>

            {/* Key Metrics Row 2: Credit breakdown + P&L */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? '12px' : '20px', marginBottom: '24px' }}>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '20px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <div style={{ color: '#10b981', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>✓ Credit Received</div>
                    <div style={{ fontSize: isMobile ? '16px' : '22px', fontWeight: 800, color: '#10b981' }}>{business.currency}{Math.max(0, receivedCredit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <CheckCircle size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: '#10b981' }} />
                </div>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '20px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>⏳ Remaining Due</div>
                    <div style={{ fontSize: isMobile ? '16px' : '22px', fontWeight: 800, color: '#ef4444' }}>{business.currency}{remainingCredit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <Clock size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: '#ef4444' }} />
                </div>
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>GST Return (5%)</div>
                    <div style={{ fontSize: isMobile ? '16px' : '22px', fontWeight: 800, color: 'var(--primary-light)' }}>{business.currency}{gstCollected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <Wallet size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: 'var(--primary-light)' }} />
                </div>
                <div className="card shadow-sm p-4 md:p-5 border-l-4 border-primary" style={{ background: 'var(--surface)' }}>
                    <div className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Net Profit</div>
                    <div className="text-xl md:text-2xl font-black text-primary">{business.currency}{netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-muted mt-1">Purchase: {business.currency}{totalPurchase.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                {/* Top Products */}
                <div className="card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
                    <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                        <BarChart3 size={20} color="var(--primary)" /> Top {business.getTerm('products')}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {topProducts.length > 0 ? topProducts.map(([name, qty], i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)' }}>{name}</div>
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
                <div className="card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
                    <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                        <PieChart size={20} color="var(--primary)" /> Payment Split
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {Object.entries(paymentModeSplit).length > 0 ? Object.entries(paymentModeSplit).map(([mode, amount], i) => (
                            <div key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)' }}>{mode}</span>
                                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>{business.currency}{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: 'var(--background)', borderRadius: '4px', overflow: 'hidden' }}>
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
            <div className="card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                        <Package size={20} color="var(--primary)" /> {business.getTerm('inventory')} Valuation
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Latest snapshot</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px' }}>
                    <div style={{ padding: '20px', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Varieties</div>
                        <div style={{ fontSize: '20px', fontWeight: 800 }}>{products.length} {business.getTerm('products')}</div>
                    </div>
                    <div style={{ padding: '20px', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Current Value</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>
                            {business.currency}{products.reduce((acc, p) => acc + (Number(p.purchasePrice || 0) * Number(p.stock || 0)), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div style={{ padding: '20px', background: 'var(--accent)', borderRadius: '12px', border: '1px solid var(--primary-light)' }}>
                        <div style={{ color: 'var(--text-main)', fontSize: '13px', marginBottom: '8px', fontWeight: 600 }}>Business Status</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary)' }}>Stocks are Healthy</div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Reports
