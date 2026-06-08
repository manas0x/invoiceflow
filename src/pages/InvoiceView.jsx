import React, { useEffect, useState } from 'react';
import { firestoreService } from '../services/firestoreService';
import { Printer, Download, ArrowLeft } from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { generateInvoicePDF, generateThermalInvoicePDF } from '../utils/pdfGenerator';

const InvoiceView = () => {
    const business = useBusiness();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        let invoiceId = params.get('id');

        // Support Clean URL /invoices/:id or /public/invoices/:id
        if (!invoiceId) {
            const path = window.location.pathname;
            if (path.includes('/invoices/') || path.includes('/invoice/')) {
                invoiceId = path.split('/').pop();
            }
        }

        if (!invoiceId) {
            setError("No Invoice ID specified.");
            setLoading(false);
            return;
        }

        const fetchInvoice = async () => {
            try {
                // Fetch specific invoice by ID
                const found = await firestoreService.getInvoice(invoiceId);

                if (found) {
                    setInvoice(found);
                } else {
                    setError("Invoice not found.");
                }
            } catch (err) {
                console.error("Error fetching invoice:", err);
                if (err.code === 'permission-denied' || err.message.includes('permission')) {
                    setError("Access Denied: Public access to invoices is not enabled in Database Rules.");
                } else {
                    setError("Could not load invoice. Please check your internet connection.");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchInvoice();
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="animate-spin text-primary">Loading...</div>
        </div>
    );

    if (error || !invoice) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 text-center">
            <div className="text-red-500 font-bold mb-2">Error</div>
            <p className="text-gray-600">{error || "Invoice not found"}</p>
            <button
                onClick={() => window.location.href = '/'}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-lg font-bold shadow-sm"
            >
                Go Home
            </button>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-100 py-8 px-4 flex justify-center">
            <div className="bg-white shadow-xl w-full max-w-[400px] p-0 overflow-hidden rounded-none sm:rounded-xl relative">

                {/* Actions Header */}
                <div className="bg-primary p-4 flex justify-between items-center text-white sticky top-0 z-10 no-print">
                    <button onClick={() => window.history.back()} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="font-bold text-lg">Invoice Receipt</h1>
                    <div className="flex gap-2">
                        <button onClick={() => generateThermalInvoicePDF(invoice)} className="hover:bg-white/10 p-2 rounded-full transition-colors" title="Thermal Print">
                            <Printer size={20} />
                        </button>
                        <button onClick={() => generateInvoicePDF(invoice)} className="hover:bg-white/10 p-2 rounded-full transition-colors" title="A4 PDF">
                            <Download size={20} />
                        </button>
                    </div>
                </div>

                {/* Thermal-like View */}
                <div className="p-6 text-center text-gray-900 font-mono text-sm leading-relaxed" style={{ fontFamily: '"Courier New", Courier, monospace' }}>

                    <div className="font-bold text-xl mb-1 text-primary-dark">{business.appName.toUpperCase()}</div>


                    <p className="text-xs text-gray-500 mb-1">{business.storeType}</p>
                    <p className="text-xs text-gray-500 mb-1">{business.address}</p>
                    <p className="text-xs text-gray-500 mb-4">Ph: {business.contact}</p>

                    <div className="border-b border-dashed border-gray-300 my-4"></div>

                    <div className="flex justify-between text-xs mb-2">
                        <span className="text-gray-500">Invoice No:</span>
                        <span className="font-bold">{invoice.id}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-4">
                        <span className="text-gray-500">Date:</span>
                        <span className="font-bold">{new Date(invoice.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className="text-left mb-6 bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Billed To:</p>
                        <p className="font-bold text-sm uppercase">{invoice.customerName || 'Walk-in Customer'}</p>
                        {invoice.customerPhone && <p className="text-xs text-gray-600 mt-1">Ph: {invoice.customerPhone}</p>}
                    </div>

                    <div className="border-b border-gray-900 border-[1.5px] mb-2"></div>

                    {/* Items Header */}
                    <div className="flex font-bold text-xs mb-2 border-b border-dashed border-gray-300 pb-2">
                        <span className="w-1/2 text-left">Item</span>
                        <span className="w-1/6 text-center">Qty</span>
                        <span className="w-1/3 text-right">Amt</span>
                    </div>

                    {/* Items List */}
                    <div className="space-y-3 mb-4">
                        {invoice.items.map((item, i) => (
                            <div key={i} className="flex text-xs items-start">
                                <span className="w-1/2 text-left pr-2 break-words">{item.name}</span>
                                <span className="w-1/6 text-center">{item.quantity}</span>
                                <span className="w-1/3 text-right font-bold">{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="border-b border-gray-900 border-[1.5px] my-4"></div>

                    {/* Totals */}
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-600">Subtotal</span>
                            <span>{(invoice.totalAmount + (invoice.discount || 0)).toFixed(2)}</span>
                        </div>
                        {invoice.discount > 0 && (
                            <div className="flex justify-between text-red-500">
                                <span>Discount</span>
                                <span>- {invoice.discount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t border-dashed border-gray-300">
                            <span>Grand Total</span>
                            <span>{business.currency} {invoice.totalAmount.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="border-b border-gray-900 border-[1.5px] my-6"></div>

                    <p className="text-xs italic text-gray-500 mb-2">Thank you for your business!</p>
                    <p className="text-xs font-bold text-primary">VISIT AGAIN</p>

                </div>

                {/* Branding Footer */}
                <div className="bg-gray-50 p-3 text-center text-[10px] text-gray-400 no-print">
                    Powered by {business.appName} App
                </div>
            </div>
        </div>
    );
};

export default InvoiceView;
