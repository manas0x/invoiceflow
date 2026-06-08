import React, { useState, useEffect } from 'react'
import {
    Download,
    Calendar,
    FileText,
    ArrowUpRight,
    ArrowDownRight,
    TrendingUp,
    ShoppingCart,
    Package,
    Calculator,
    Filter
} from 'lucide-react'
import { firestoreService } from '../services/firestoreService'
import * as XLSX from 'xlsx'
import { useBusiness } from '../context/BusinessContext'

const GstReports = () => {
    const business = useBusiness()
    const [invoices, setInvoices] = useState([])
    const [purchases, setPurchases] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    })
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        const unsubInv = firestoreService.subscribeInvoices(setInvoices)
        const unsubPur = firestoreService.subscribePurchases(setPurchases)
        const unsubProd = firestoreService.subscribeProducts(setProducts)
        setLoading(false)

        return () => {
            window.removeEventListener('resize', handleResize)
            unsubInv()
            unsubPur()
            unsubProd()
        }
    }, [])

    const filteredInvoices = invoices.filter(inv => inv.date >= dateRange.start && inv.date <= dateRange.end)
    const filteredPurchases = purchases.filter(pur => pur.date >= dateRange.start && pur.date <= dateRange.end)

    // Helper for Sales GST logic: 5% margin on cost
    const calculateItemGstReturn = (item) => {
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
        const gstRate = Number(item.gst || product.gst || 5);
        const gstAmount = taxableMargin * (gstRate / 100);

        return {
            taxableValue: itemCost,
            margin: taxableMargin,
            gstRate: gstRate,
            gstAmount: gstAmount
        };
    };

    // Calculate Sales GST Summary
    const salesGstSummary = filteredInvoices.reduce((acc, inv) => {
        (inv.items || []).forEach(item => {
            const res = calculateItemGstReturn(item);
            const slab = `${res.gstRate}%`;
            if (!acc.slabs[slab]) acc.slabs[slab] = { taxable: 0, margin: 0, gst: 0 };
            acc.slabs[slab].taxable += res.taxableValue;
            acc.slabs[slab].margin += res.margin;
            acc.slabs[slab].gst += res.gstAmount;
            acc.totalGst += res.gstAmount;
            acc.totalTaxable += res.taxableValue;
        });
        return acc;
    }, { slabs: {}, totalGst: 0, totalTaxable: 0 });

    // Calculate Purchase GST Summary (ITC)
    const purchaseGstSummary = filteredPurchases.reduce((acc, pur) => {
        (pur.items || []).forEach(item => {
            const gstRate = Number(item.gst || 5);
            const rateExcl = Number(item.rateExcl || 0);
            const qty = Number(item.quantity || 0);
            const taxableValue = rateExcl * qty;
            const itcAmount = taxableValue * (gstRate / 100);

            const slab = `${gstRate}%`;
            if (!acc.slabs[slab]) acc.slabs[slab] = { taxable: 0, itc: 0 };
            acc.slabs[slab].taxable += taxableValue;
            acc.slabs[slab].itc += itcAmount;
            acc.totalItc += itcAmount;
            acc.totalTaxable += taxableValue;
        });
        return acc;
    }, { slabs: {}, totalItc: 0, totalTaxable: 0 });

    const exportToExcel = () => {
        // Create multiple sheets
        const wb = XLSX.utils.book_new();

        // Sheet 1: Sales GST (5% Margin)
        const salesData = [];
        filteredInvoices.forEach(inv => {
            (inv.items || []).forEach(item => {
                const res = calculateItemGstReturn(item);
                salesData.push({
                    "Date": inv.date,
                    "Invoice ID": inv.id,
                    "Customer": inv.customerName,
                    "Product": item.name,
                    "GST Slab": `${res.gstRate}%`,
                    "Purchase Cost": res.taxableValue.toFixed(2),
                    "Taxable Margin (5%)": res.margin.toFixed(2),
                    "GST Payable": res.gstAmount.toFixed(2)
                });
            });
        });
        const wsSales = XLSX.utils.json_to_sheet(salesData);
        XLSX.utils.book_append_sheet(wb, wsSales, "Sales GST Return");

        // Sheet 2: Purchase GST (ITC)
        const purchaseData = [];
        filteredPurchases.forEach(pur => {
            const supplier = suppliers.find(s => s.name === pur.supplierName) || {};
            (pur.items || []).forEach(item => {
                const gstRate = Number(item.gst || 5);
                const taxableValue = Number(item.rateExcl || 0) * Number(item.quantity || 0);
                const itcAmount = taxableValue * (gstRate / 100);
                purchaseData.push({
                    "Date": pur.date,
                    "Purchase ID": pur.id,
                    "Supplier": pur.supplierName,
                    "Supplier GSTIN": supplier.gstin || 'N/A',
                    "Invoice No": pur.invoiceNo,
                    "Product": item.name,
                    "GST Slab": `${gstRate}%`,
                    "Taxable Value": taxableValue.toFixed(2),
                    "Input Tax Credit": itcAmount.toFixed(2)
                });
            });
        });
        const wsPurchases = XLSX.utils.json_to_sheet(purchaseData);
        XLSX.utils.book_append_sheet(wb, wsPurchases, "Purchase GST ITC");

        // Sheet 3: Summary
        const summaryData = [
            { "Metric": "Total Sales (Cost Based)", "Value": salesGstSummary.totalTaxable.toFixed(2) },
            { "Metric": "Total GST Return (Sales Margin)", "Value": salesGstSummary.totalGst.toFixed(2) },
            { "Metric": "Total Purchase (Taxable)", "Value": purchaseGstSummary.totalTaxable.toFixed(2) },
            { "Metric": "Total ITC (Purchases)", "Value": purchaseGstSummary.totalItc.toFixed(2) },
            { "Metric": "Net Taxable Difference", "Value": (salesGstSummary.totalGst - purchaseGstSummary.totalItc).toFixed(2) }
        ];
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "GST Summary");

        const fileName = `GST_Report_${dateRange.start}_to_${dateRange.end}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
    )

    return (
        <div className="gst-reports space-y-6">
            {/* Header & Controls */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                {/* Date Range — responsive row */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Calendar size={16} className="text-primary shrink-0 hidden sm:block" />
                    <div className="flex flex-1 items-center gap-2 min-w-0 p-1.5 rounded-xl border" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                        <div className="flex flex-1 items-center gap-1.5 px-2 py-1 rounded-lg border min-w-0" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <Calendar size={14} className="text-primary shrink-0 sm:hidden" />
                            <input
                                type="date"
                                className="flex-1 min-w-0 text-sm font-bold bg-transparent outline-none"
                                style={{ color: 'var(--text-main)' }}
                                value={dateRange.start}
                                onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                            />
                        </div>
                        <span className="text-xs font-bold shrink-0" style={{ color: 'var(--text-muted)' }}>to</span>
                        <div className="flex flex-1 items-center gap-1.5 px-2 py-1 rounded-lg border min-w-0" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <Calendar size={14} className="text-primary shrink-0 sm:hidden" />
                            <input
                                type="date"
                                className="flex-1 min-w-0 text-sm font-bold bg-transparent outline-none"
                                style={{ color: 'var(--text-main)' }}
                                value={dateRange.end}
                                onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                            />
                        </div>
                    </div>
                </div>
                <button
                    onClick={exportToExcel}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                >
                    <Download size={18} /> Export GST Report
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card border-l-4 border-blue-500 p-5 shadow-sm relative overflow-hidden" style={{ background: 'var(--surface)' }}>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                        <TrendingUp size={14} className="text-blue-500" /> Sales GST Return (5% Margin)
                    </div>
                    <div className="text-3xl font-black text-blue-600 tracking-tight">{business.currency}{salesGstSummary.totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>Calculated on Taxable Margin of {business.currency}{salesGstSummary.totalTaxable.toLocaleString()}</p>
                    <ArrowUpRight size={40} className="absolute -right-2 -bottom-2 text-blue-500 opacity-10" />
                </div>

                <div className="card border-l-4 border-emerald-500 p-5 shadow-sm relative overflow-hidden" style={{ background: 'var(--surface)' }}>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                        <ShoppingCart size={14} className="text-emerald-500" /> Input Tax Credit (ITC)
                    </div>
                    <div className="text-3xl font-black text-emerald-600 tracking-tight">{business.currency}{purchaseGstSummary.totalItc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>Total Tax Paid to Suppliers on {business.currency}{purchaseGstSummary.totalTaxable.toLocaleString()}</p>
                    <ArrowDownRight size={40} className="absolute -right-2 -bottom-2 text-emerald-500 opacity-10" />
                </div>

                <div className="card border-l-4 border-purple-500 p-5 shadow-sm relative overflow-hidden" style={{ background: 'var(--surface)' }}>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                        <Calculator size={14} className="text-purple-500" /> Net Liability / Refund
                    </div>
                    <div className={`text-3xl font-black tracking-tight ${salesGstSummary.totalGst >= purchaseGstSummary.totalItc ? 'text-red-500' : 'text-emerald-500'}`}>
                        {business.currency}{Math.abs(salesGstSummary.totalGst - purchaseGstSummary.totalItc).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-sm ml-1 font-bold uppercase">{salesGstSummary.totalGst >= purchaseGstSummary.totalItc ? 'Payable' : 'Credit'}</span>
                    </div>
                    <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>Sales Margin GST - Purchase ITC</p>
                    <FileText size={40} className="absolute -right-2 -bottom-2 text-purple-500 opacity-10" />
                </div>
            </div>

            {/* Slab Summaries */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-0 shadow-sm overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                        <TrendingUp size={18} className="text-blue-500" />
                        <h3 className="font-black tracking-tight uppercase text-sm" style={{ color: 'var(--text-main)' }}>Sales GST Slab Summary</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="font-bold uppercase text-[10px]" style={{ background: 'var(--background)', color: 'var(--text-muted)' }}>
                                    <th className="px-4 py-3">Slab</th>
                                    <th className="px-4 py-3 text-right">Cost Value</th>
                                    <th className="px-4 py-3 text-right">5% Margin</th>
                                    <th className="px-4 py-3 text-right text-blue-600">GST Return</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y font-medium" style={{ divideColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                                {Object.entries(salesGstSummary.slabs).sort().map(([slab, data]) => (
                                    <tr key={slab} className="hover:bg-black/5">
                                        <td className="px-4 py-3 font-black" style={{ color: 'var(--text-main)' }}>{slab}</td>
                                        <td className="px-4 py-3 text-right">{business.currency}{data.taxable.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right">{business.currency}{data.margin.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-black text-blue-600">{business.currency}{data.gst.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card p-0 shadow-sm overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                        <ShoppingCart size={18} className="text-emerald-500" />
                        <h3 className="font-black tracking-tight uppercase text-sm" style={{ color: 'var(--text-main)' }}>Purchase ITC Slab Summary</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="font-bold uppercase text-[10px]" style={{ background: 'var(--background)', color: 'var(--text-muted)' }}>
                                    <th className="px-4 py-3">Slab</th>
                                    <th className="px-4 py-3 text-right">Taxable Value</th>
                                    <th className="px-4 py-3 text-right text-emerald-600">ITC Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y font-medium" style={{ divideColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                                {Object.entries(purchaseGstSummary.slabs).sort().map(([slab, data]) => (
                                    <tr key={slab} className="hover:bg-black/5">
                                        <td className="px-4 py-3 font-black" style={{ color: 'var(--text-main)' }}>{slab}</td>
                                        <td className="px-4 py-3 text-right">{business.currency}{data.taxable.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-black text-emerald-600">{business.currency}{data.itc.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Note */}
            <div className="p-4 rounded-2xl flex gap-3 items-start border" style={{ background: 'rgba(59, 130, 246, 0.05)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                <FileText size={20} className="text-blue-500 mt-1 shrink-0" />
                <div>
                    <h4 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>GST Compliance Note</h4>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        Sales GST is calculated based on the <b>fixed 5% profit margin logic</b> (Taxable Margin = Purchase Cost × 5%).
                        Purchase GST reflects the actual Input Tax Credit (ITC) paid to suppliers as recorded in the Purchase Entry section.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default GstReports
