import React, { useState, useEffect } from 'react';
import { firestoreService } from '../services/firestoreService';
import { Search, FileText, User } from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';

const DebugInvoices = () => {
    const business = useBusiness();
    const [invoices, setInvoices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const unsub = firestoreService.subscribeInvoices(setInvoices);
        return () => unsub();
    }, []);

    const filtered = invoices.filter(inv => 
        (inv.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.id || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="text-primary" /> Invoice Data Auditor
                </h1>
                <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-xs font-bold ring-1 ring-yellow-200">
                    <User size={14} /> DEBUG MODE
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-4 bg-emerald-50 border-emerald-100 rounded-2xl">
                    <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-1">Live Invoice Count</p>
                    <h3 className="text-2xl font-black text-emerald-700">{invoices.length} Bills</h3>
                </div>
                <div className="card p-4 bg-blue-50 border-blue-100 rounded-2xl">
                    <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-1">Sum of All Sales</p>
                    <h3 className="text-2xl font-black text-blue-700">{business.currency}{invoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0).toLocaleString()}</h3>
                </div>
                <div className="card p-4 bg-orange-50 border-orange-100 rounded-2xl">
                    <p className="text-[10px] font-black uppercase text-orange-600 tracking-widest mb-1">Credit Sales Total</p>
                    <h3 className="text-2xl font-black text-orange-700">{business.currency}{invoices.filter(i => (i.paymentMode || '').toLowerCase() === 'credit').reduce((acc, i) => acc + (Number(i.totalAmount) || 0), 0).toLocaleString()}</h3>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                    <input 
                        type="text"
                        placeholder="Search by name or Invoice ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border focus:ring-2 focus:ring-primary/20 outline-none"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                    />
                </div>
                <div className="md:w-64">
                    <input 
                        type="number"
                        placeholder="Find exact amount (e.g. 5050)..."
                        className="w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-primary/20 outline-none font-bold"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val) setSearchTerm(val);
                        }}
                    />
                </div>
            </div>

            <div className="rounded-2xl border overflow-hidden shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <table className="w-full text-sm text-left">
                    <thead className="bg-black/5 border-b" style={{ borderColor: 'var(--border)' }}>
                        <tr className="text-xs font-bold uppercase tracking-wider text-muted">
                            <th className="px-6 py-4">Invoice ID</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Customer</th>
                            <th className="px-6 py-4">Mode</th>
                            <th className="px-6 py-4 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {filtered.map(inv => (
                            <tr key={inv.docId || inv.id} className="hover:bg-black/5 transition-colors">
                                <td className="px-6 py-4 font-mono font-bold text-primary">{inv.id}</td>
                                <td className="px-6 py-4 text-muted text-xs">{inv.date}</td>
                                <td className="px-6 py-4">
                                    <div className="font-bold">{inv.customerName}</div>
                                    <div className="text-[10px] text-muted">{inv.customerPhone}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${inv.paymentMode === 'Credit' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                        {inv.paymentMode}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right font-black">{business.currency}{Number(inv.totalAmount).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && (
                    <div className="p-10 text-center text-muted italic">No invoices found matching your search.</div>
                )}
            </div>
        </div>
    );
};

export default DebugInvoices;
