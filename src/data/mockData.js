export const initializeData = () => {
    const products = localStorage.getItem('mb_products');
    if (!products) {
        const defaultProducts = [
            { id: '1', name: 'Urea', category: 'General', brand: 'IFFCO', batch: 'UF445', mfgDate: '2023-11-01', expDate: '2025-11-01', unit: 'Bag', hsn: '3102', gst: 5, purchasePrice: 242, sellingPrice: 266.5, stock: 150, minStock: 20 },
            { id: '2', name: 'DAP', category: 'General', brand: 'IFFCO', batch: 'DP990', mfgDate: '2023-12-15', expDate: '2025-12-15', unit: 'Bag', hsn: '3105', gst: 5, purchasePrice: 1250, sellingPrice: 1350, stock: 85, minStock: 15 },
            { id: '3', name: 'Monocrotophos', category: 'Other', brand: 'Syngenta', batch: 'MC123', mfgDate: '2024-01-10', expDate: '2025-01-10', unit: 'Litre', hsn: '3808', gst: 18, purchasePrice: 450, sellingPrice: 580, stock: 5, minStock: 10 },
            { id: '4', name: 'Chlorpyrifos', category: 'Other', brand: 'Bayer', batch: 'CP887', mfgDate: '2024-02-20', expDate: '2024-06-20', unit: 'Litre', hsn: '3808', gst: 18, purchasePrice: 620, sellingPrice: 750, stock: 12, minStock: 5 },
        ];
        localStorage.setItem('mb_products', JSON.stringify(defaultProducts));
    }

    const customers = localStorage.getItem('mb_customers');
    if (!customers) {
        const defaultCustomers = [
            { id: '1', name: 'Ramesh Kumar', phone: '9876543210', address: 'Sonipat, Haryana', gst: '' },
            { id: '2', name: 'Suresh Singh', phone: '9988776655', address: 'Rohtak, Haryana', gst: '06AAAAA0000A1Z5' },
        ];
        localStorage.setItem('mb_customers', JSON.stringify(defaultCustomers));
    }

    const invoices = localStorage.getItem('mb_invoices');
    if (!invoices) {
        localStorage.setItem('mb_invoices', JSON.stringify([]));
    }

    const purchases = localStorage.getItem('mb_purchases');
    if (!purchases) {
        localStorage.setItem('mb_purchases', JSON.stringify([]));
    }
};
