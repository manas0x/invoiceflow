import React, { useState, useEffect, useRef } from 'react';
import { firestoreService } from '../services/firestoreService';
import { Search, RotateCcw, Package, User, ShoppingBag, FileText, CheckCircle2, AlertCircle, ArrowLeft, History, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import { showSuccess, showError, showConfirm } from '../utils/alert';
import { useBusiness } from '../context/BusinessContext';

const Returns = () => {
    const business = useBusiness();
    const [activeTab, setActiveTab] = useState('sale');
    const [searchId, setSearchId] = useState('');
    const [sourceRecord, setSourceRecord] = useState(null);
    const [returnItems, setReturnItems] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [allInvoices, setAllInvoices] = useState([]);
    const [allPurchases, setAllPurchases] = useState([]);
    const [filterDate, setFilterDate] = useState('');
    const [saleReturns, setSaleReturns] = useState([]);
    const [purchaseReturns, setPurchaseReturns] = useState([]);
    const [showHistory, setShowHistory] = useState(true);
    const [browseSearch, setBrowseSearch] = useState('');
    const processingRef = useRef(false); // guard against double-submit


    useEffect(() => {
        const unsubInv = firestoreService.subscribeInvoices(setAllInvoices);
        const unsubPur = firestoreService.subscribePurchases(setAllPurchases);
        const unsubSaleRet = firestoreService.subscribeSaleReturns(setSaleReturns);
        const unsubPurRet = firestoreService.subscribePurchaseReturns(setPurchaseReturns);
        return () => {
            unsubInv();
            unsubPur();
            unsubSaleRet();
            unsubPurRet();
        };
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        const id = searchId.trim().toUpperCase();
        if (!id) return;

        let record = null;
        if (activeTab === 'sale') {
            record = allInvoices.find(inv =>
                inv.id === id || (inv.id && inv.id.endsWith(id))
            );
        } else {
            record = allPurchases.find(p =>
                p.id === id || (p.id && p.id.endsWith(id))
            );
        }

        if (record) {
            setSourceRecord(record);
            setReturnItems({});
            showSuccess(`Found ${activeTab === 'sale' ? 'Bill' : 'Purchase'}: ${record.id}`);
        } else {
            showError(`${activeTab === 'sale' ? 'Bill' : 'Purchase'} not found!`);
            setSourceRecord(null);
        }
    };

    const toggleItemQuantity = (itemId, maxQty, delta) => {
        setReturnItems(prev => {
            const current = prev[itemId] || 0;
            const next = Math.max(0, Math.min(maxQty, current + delta));
            if (next === 0) {
                const updated = { ...prev };
                delete updated[itemId];
                return updated;
            }
            return { ...prev, [itemId]: next };
        });
    };

    // Build a map of already-returned qty per (invoiceId → itemId → qty)
    const getAlreadyReturnedQty = (recordId, itemId) => {
        const history = activeTab === 'sale' ? saleReturns : purchaseReturns;
        return history
            .filter(r => (r.invoiceId || r.purchaseId) === recordId)
            .reduce((total, r) => {
                const found = (r.items || []).find(i => i.id === itemId);
                return total + (found ? Number(found.quantity) : 0);
            }, 0);
    };

    // Max returnable qty for an item in the currently selected record
    const maxReturnableQty = (item) => {
        if (!sourceRecord) return item.quantity;
        const alreadyReturned = getAlreadyReturnedQty(sourceRecord.id, item.id);
        return Math.max(0, Number(item.quantity) - alreadyReturned);
    };

    const calculateRefund = () => {
        if (!sourceRecord) return 0;
        return sourceRecord.items.reduce((total, item) => {
            const qty = returnItems[item.id] || 0;
            return total + (qty * (item.price || item.purchasePrice || 0));
        }, 0);
    };

    const handleSubmit = async () => {
        if (processingRef.current) return; // already running — block second click
        if (Object.keys(returnItems).length === 0) return showError("Select at least one item to return");
        const totalRefund = calculateRefund();
        if (!await showConfirm(`Process return of ${business.currency}${totalRefund.toLocaleString()}?`, `Stock will be adjusted automatically.`)) return;
        if (processingRef.current) return; // check again after async confirm

        processingRef.current = true;
        setIsProcessing(true);
        try {
            const returnData = {
                date: new Date().toISOString().split('T')[0],
                items: sourceRecord.items
                    .filter(item => returnItems[item.id] > 0)
                    .map(item => ({ ...item, quantity: returnItems[item.id] })),
                totalRefund
            };

            if (activeTab === 'sale') {
                await firestoreService.addSaleReturn({
                    ...returnData,
                    invoiceId: sourceRecord.id,
                    customerId: sourceRecord.customerId || sourceRecord.customerPhone || (sourceRecord.customerName || '').toLowerCase(),
                    customerName: sourceRecord.customerName,
                    customerPhone: sourceRecord.customerPhone || ''
                });
                showSuccess("Sale Return Processed! Stock updated.");
            } else {
                await firestoreService.addPurchaseReturn({
                    ...returnData,
                    purchaseId: sourceRecord.id,
                    supplierName: sourceRecord.supplierName
                });
                showSuccess("Purchase Return Processed! Stock updated.");
            }

            setSourceRecord(null);
            setSearchId('');
            setReturnItems({});
        } catch (err) {
            console.error("Return Failed:", err);
            showError("Failed: " + err.message);
        } finally {
            processingRef.current = false;
            setIsProcessing(false);
        }
    };

    const activeReturns = activeTab === 'sale' ? saleReturns : purchaseReturns;

    const handleDeleteReturn = async (ret) => {
        if (!await showConfirm(
            `Delete this return record?`,
            `Stock will be rolled back: ${(ret.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ')}`
        )) return;
        try {
            if (activeTab === 'sale') {
                await firestoreService.deleteSaleReturn(ret.id, ret.items || []);
            } else {
                await firestoreService.deletePurchaseReturn(ret.id, ret.items || []);
            }
            showSuccess('Return deleted & stock rolled back.');
        } catch (err) {
            showError('Failed to delete: ' + err.message);
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-main)' }}>
                        <RotateCcw className="text-primary" /> Returns Management
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Handle returns with automatic stock adjustment.</p>
                </div>
                <div className="flex bg-black/5 p-1 rounded-xl border border-border self-start sm:self-auto">
                    <button
                        onClick={() => { setActiveTab('sale'); setSourceRecord(null); setSearchId(''); }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'sale' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                    >Sale Return</button>
                    <button
                        onClick={() => { setActiveTab('purchase'); setSourceRecord(null); setSearchId(''); }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'purchase' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                    >Purchase Return</button>
                </div>
            </div>

            {!sourceRecord ? (
                <div className="card p-6 md:p-10 flex flex-col items-center justify-center text-center animate-in fade-in duration-500" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        {activeTab === 'sale' ? <ShoppingBag size={32} className="text-primary" /> : <Package size={32} className="text-primary" />}
                    </div>
                    <h3 className="text-xl font-bold">Find Original {activeTab === 'sale' ? 'Bill' : 'Purchase'}</h3>
                    <p className="text-gray-500 text-sm max-w-sm mt-2 mb-6">Enter the ID or pick from the list below.</p>

                    <form onSubmit={handleSearch} className="w-full max-w-md relative mb-8">
                        <input
                            type="text"
                            placeholder={`Enter ${activeTab === 'sale' ? 'INV-XXXX' : 'Purchase ID'}...`}
                            value={searchId}
                            onChange={(e) => setSearchId(e.target.value)}
                            className="w-full p-4 pl-12 rounded-2xl border focus:ring-4 focus:ring-primary/10 outline-none transition-all font-bold text-lg"
                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-white px-5 py-2 rounded-xl font-bold hover:opacity-90">Search</button>
                    </form>

                    <div className="w-full max-w-2xl">
                        {/* Browse header: search + date filter */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                            <h4 className="text-sm font-black uppercase tracking-widest text-gray-400">Browse {activeTab === 'sale' ? 'Bills' : 'Purchases'}</h4>
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Inline text search — overrides date filter */}
                                <div className="relative">
                                    <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search ID / name..."
                                        value={browseSearch}
                                        onChange={e => setBrowseSearch(e.target.value)}
                                        className="pl-6 pr-2 py-1.5 text-xs font-bold rounded-lg border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all w-36"
                                        style={{ background: 'var(--surface)', color: 'var(--text-main)' }}
                                    />
                                    {browseSearch && (
                                        <button onClick={() => setBrowseSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                                {/* Date filter — dimmed when text search is active */}
                                <div className={`flex items-center gap-1.5 transition-opacity ${browseSearch ? 'opacity-30 pointer-events-none' : ''}`}>
                                    <span className="text-xs font-bold text-gray-400">Date:</span>
                                    <input
                                        type="date"
                                        value={filterDate}
                                        onChange={(e) => setFilterDate(e.target.value)}
                                        className="px-2 py-1.5 text-xs font-bold rounded-lg border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        style={{ background: 'var(--surface)', color: 'var(--text-main)' }}
                                    />
                                    {filterDate && (
                                        <button onClick={() => setFilterDate('')} className="text-[10px] bg-gray-100 px-2 py-1 rounded-md font-bold text-gray-500 hover:bg-gray-200 uppercase">Clear</button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 max-h-[350px] overflow-y-auto pr-1">
                            {(activeTab === 'sale' ? allInvoices : allPurchases)
                                .filter(record => {
                                    if (browseSearch.trim()) {
                                        // Text search: ignore date filter, match ID or customer/supplier name
                                        const q = browseSearch.trim().toLowerCase();
                                        return (
                                            (record.id || '').toLowerCase().includes(q) ||
                                            (record.customerName || record.supplierName || '').toLowerCase().includes(q)
                                        );
                                    }
                                    // Fall back to date filter
                                    return !filterDate || record.date === filterDate;
                                })
                                .sort((a, b) => new Date(b.date) - new Date(a.date))
                                .slice(0, (browseSearch.trim() || filterDate) ? 50 : 8)
                                .map(record => {
                                    // Check if all items of this record are fully returned
                                    const history = activeTab === 'sale' ? saleReturns : purchaseReturns;
                                    const isFullyReturned = (record.items || []).every(item => {
                                        const alreadyReturned = history
                                            .filter(r => (r.invoiceId || r.purchaseId) === record.id)
                                            .reduce((t, r) => {
                                                const f = (r.items || []).find(i => i.id === item.id);
                                                return t + (f ? Number(f.quantity) : 0);
                                            }, 0);
                                        return alreadyReturned >= Number(item.quantity);
                                    });
                                    return (
                                        <button
                                            key={record.id}
                                            onClick={() => { setSourceRecord(record); setReturnItems({}); }}
                                            className={`w-full p-4 border rounded-xl text-left flex items-center justify-between group transition-all ${isFullyReturned
                                                ? 'bg-black/5 border-border opacity-60 cursor-default'
                                                : 'bg-background border-border hover:border-primary hover:bg-primary/5'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${isFullyReturned ? 'bg-gray-200 text-gray-400' : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white'
                                                    }`}>
                                                    <FileText size={16} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                                        {record.id}
                                                        {isFullyReturned && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 uppercase tracking-widest">Returned</span>}
                                                    </p>
                                                    <p className="text-xs text-gray-500 truncate">{record.customerName || record.supplierName} · {record.date}</p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0 ml-2">
                                                <p className="text-sm font-black text-primary">{business.currency}{Number(record.totalAmount).toLocaleString()}</p>
                                                <p className="text-[10px] font-bold text-gray-400 group-hover:text-primary uppercase">{isFullyReturned ? 'No Items Left' : 'Select →'}</p>
                                            </div>
                                        </button>
                                    );
                                })
                            }
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-5 duration-300">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="card p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <div className="flex justify-between items-start mb-6">
                                <button onClick={() => setSourceRecord(null)} className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                                    <ArrowLeft size={16} /> Back to Search
                                </button>
                                <div className="text-right">
                                    <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Original Date</div>
                                    <div className="font-bold">{sourceRecord.date}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 bg-primary/10 rounded-xl">
                                    <User className="text-primary" size={24} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{activeTab === 'sale' ? 'Customer' : 'Supplier'}</div>
                                    <div className="text-lg font-bold truncate">{sourceRecord.customerName || sourceRecord.supplierName}</div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Original Total</div>
                                    <div className="text-lg font-bold">{business.currency}{Number(sourceRecord.totalAmount).toLocaleString()}</div>
                                </div>
                            </div>

                            <h4 className="font-bold flex items-center gap-2 mb-4">
                                <FileText size={18} className="text-primary" /> Select Items to Return
                            </h4>
                            <div className="space-y-3">
                                {sourceRecord.items.map((item, idx) => {
                                    const maxQty = maxReturnableQty(item);
                                    const alreadyRet = Number(item.quantity) - maxQty;
                                    const fullyReturned = maxQty === 0;
                                    return (
                                        <div key={item.id || idx} className={`p-4 rounded-xl border transition-all flex items-center gap-4 ${fullyReturned
                                            ? 'border-amber-400/30 bg-amber-500/5 opacity-60'
                                            : returnItems[item.id] > 0
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                : 'border-border bg-black/5 hover:bg-black/10'
                                            }`}>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm truncate flex items-center gap-2">
                                                    {item.name}
                                                    {fullyReturned && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 uppercase">Returned</span>}
                                                </p>
                                                <p className="text-[10px] text-gray-500 uppercase font-black">
                                                    {business.currency}{Number(item.price || item.purchasePrice).toLocaleString()} × {item.quantity} {item.unit || 'unit'}
                                                    {alreadyRet > 0 && <span className="text-amber-500 ml-1">· {alreadyRet} already returned</span>}
                                                </p>
                                            </div>
                                            {fullyReturned ? (
                                                <div className="text-[10px] font-black text-amber-500 shrink-0">All Returned</div>
                                            ) : (
                                                <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-border shrink-0">
                                                    <button onClick={() => toggleItemQuantity(item.id, maxQty, -1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 font-bold">−</button>
                                                    <div className="w-10 text-center font-black text-lg text-primary">{returnItems[item.id] || 0}</div>
                                                    <button onClick={() => toggleItemQuantity(item.id, maxQty, 1)} className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold ${(returnItems[item.id] || 0) >= maxQty ? 'text-gray-300 pointer-events-none' : 'hover:bg-gray-100'}`}>+</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="card p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <h4 className="font-bold flex items-center gap-2 mb-6">
                                <CheckCircle2 size={18} className="text-emerald-500" /> Return Summary
                            </h4>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between"><span className="text-gray-500">Items</span><span className="font-bold">{Object.keys(returnItems).length}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Total Qty</span><span className="font-bold">{Object.values(returnItems).reduce((a, b) => a + b, 0)}</span></div>
                            </div>
                            <div className="border-t border-dashed my-4" style={{ borderColor: 'var(--border)' }} />
                            <div className="p-4 bg-emerald-500/10 rounded-2xl text-emerald-600">
                                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 mb-1">{activeTab === 'sale' ? 'Refund Amount' : 'Deduction Amount'}</div>
                                <div className="text-4xl font-black">{business.currency}{calculateRefund().toLocaleString()}</div>
                            </div>
                            <div className="mt-4 p-3 bg-amber-50 rounded-xl flex gap-3 text-amber-700">
                                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                <p className="text-[11px] leading-relaxed">Stock will be adjusted automatically on confirmation.</p>
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={isProcessing || Object.keys(returnItems).length === 0}
                                className="mt-4 w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:opacity-90 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                            >
                                {isProcessing ? 'Processing...' : 'Record Return'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Return History ──────────────────────────────────────────────── */}
            <div className="card overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <button
                    onClick={() => setShowHistory(h => !h)}
                    className="w-full flex items-center justify-between p-4 font-bold text-sm"
                    style={{ color: 'var(--text-main)' }}
                >
                    <span className="flex items-center gap-2">
                        <History size={18} className="text-primary" />
                        {activeTab === 'sale' ? 'Sale' : 'Purchase'} Return History
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black">{activeReturns.length}</span>
                    </span>
                    {showHistory ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
                </button>

                {showHistory && (
                    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                        {activeReturns.length === 0 ? (
                            <div className="p-10 text-center text-muted italic text-sm">No return history yet.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="text-[10px] font-black uppercase tracking-widest text-muted border-b" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">{activeTab === 'sale' ? 'Invoice' : 'Purchase'} ID</th>
                                            <th className="px-4 py-3">{activeTab === 'sale' ? 'Customer' : 'Supplier'}</th>
                                            <th className="px-4 py-3">Items</th>
                                            <th className="px-4 py-3 text-right text-emerald-600">Refund</th>
                                            <th className="px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                        {activeReturns.map(ret => (
                                            <tr key={ret.id} className="hover:bg-black/5 transition-colors group">
                                                <td className="px-4 py-3 text-xs text-muted">{ret.date}</td>
                                                <td className="px-4 py-3 font-mono font-bold text-primary text-xs">{ret.invoiceId || ret.purchaseId || '—'}</td>
                                                <td className="px-4 py-3 font-semibold">{ret.customerName || ret.supplierName}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {(ret.items || []).map((item, i) => (
                                                            <span key={i} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">
                                                                {item.name} ×{item.quantity}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-black text-emerald-600">{business.currency}{Number(ret.totalRefund).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => handleDeleteReturn(ret)}
                                                        title="Delete & Rollback Stock"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Returns;
