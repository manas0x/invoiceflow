
export const backupToSheet = async (data, type = 'PURCHASE') => {
    try {
        const SCRIPT_URL = import.meta.env.VITE_GOOGLE_SHEET_SCRIPT_URL;

        if (!SCRIPT_URL) {
            console.warn("Google Sheet Script URL is not set. Backup skipped.");
            return;
        }

        // Format data for the sheet
        let itemsSummary = '';
        if (data.items && Array.isArray(data.items)) {
            itemsSummary = data.items.map(item =>
                `${item.name} (${item.quantity || 0} x ₹${item.purchasePrice || item.price || 0})`
            ).join(', ');
        }

        const payload = {
            type: type,
            date: data.date || data.createdAt || new Date().toISOString().split('T')[0],
            id: data.id || 'N/A',
            partyName: data.supplierName || data.customerName || data.name || 'Unknown',
            phone: data.phone || '',
            address: data.address || '',
            referenceNo: data.invoiceNo || '',
            total: data.totalAmount || data.total || 0,
            items: itemsSummary,
            rawItems: data.items || null
        };

        // Send to Google Apps Script
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });



    } catch (error) {
        console.error("Failed to backup to Google Sheet", error);
    }
};
// Helper for delay to avoid rate limits
const delay = ms => new Promise(res => setTimeout(res, ms));

export const syncAllDataToSheet = async (onProgress, onError) => {
    try {
        const { firestoreService } = await import('./firestoreService');

        // 1. Fetch Customers
        onProgress("Fetching Customers...");
        const customers = await firestoreService.getCustomers();
        for (const [i, c] of customers.entries()) {
            onProgress(`Backing up Customer ${i + 1}/${customers.length}`);
            await backupToSheet(c, 'CUSTOMER');
            await delay(100);
        }

        // 2. Fetch Suppliers
        onProgress("Fetching Suppliers...");
        const suppliers = await firestoreService.getSuppliers();
        for (const [i, s] of suppliers.entries()) {
            onProgress(`Backing up Supplier ${i + 1}/${suppliers.length}`);
            await backupToSheet(s, 'SUPPLIER');
            await delay(100);
        }

        // 3. Fetch Products (Inventory)
        onProgress("Fetching Inventory...");
        const products = await firestoreService.getProducts();
        for (const [i, p] of products.entries()) {
            onProgress(`Backing up Product ${i + 1}/${products.length}`);
            // Use 'INVENTORY' type for current stock
            // We need to shape it like the payload expectation
            const payload = { ...p, supplierName: p.category, totalAmount: p.purchasePrice, items: [] };
            await backupToSheet(payload, 'PRODUCT');
            await delay(100);
        }

        // 4. Fetch Purchases
        onProgress("Fetching Purchases...");
        const purchases = await firestoreService.getPurchases();
        for (const [i, p] of purchases.entries()) {
            onProgress(`Backing up Purchase ${i + 1}/${purchases.length}`);
            await backupToSheet(p, 'PURCHASE');
            await delay(100);
        }

        // 5. Fetch Sales (Invoices)
        onProgress("Fetching Sales...");
        const invoices = await firestoreService.getInvoices();
        for (const [i, inv] of invoices.entries()) {
            onProgress(`Backing up Invoice ${i + 1}/${invoices.length}`);
            await backupToSheet(inv, 'SALE');
            await delay(100);
        }

        onProgress("Backup Complete!");

    } catch (e) {
        console.error(e);
        onError(e.message);
    }
};
