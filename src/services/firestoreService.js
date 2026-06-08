import { getAppConfig } from '../config/appConfig';
import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    doc,
    query,
    where,
    onSnapshot,
    setDoc,
    increment,
    writeBatch,
    runTransaction,
    deleteDoc,
    orderBy,
    limit,
    getDoc
} from "firebase/firestore";
import { db } from "../firebase";

const PRODUCTS_COLLECTION = "products";
const PURCHASES_COLLECTION = "purchases";
const INVOICES_COLLECTION = "invoices";
const CUSTOMERS_COLLECTION = "customers";
const SUPPLIERS_COLLECTION = "suppliers";
const SUPPLIER_PAYMENTS_COLLECTION = "supplier_payments";
const CUSTOMER_PAYMENTS_COLLECTION = "customer_payments";
const NOTIFICATIONS_COLLECTION = "notifications";
const USERS_COLLECTION = "users";
const SETTINGS_COLLECTION = "settings";
const SALE_RETURNS_COLLECTION = "sale_returns";
const PURCHASE_RETURNS_COLLECTION = "purchase_returns";

export const firestoreService = {
    // Products
    async getProducts() {
        const querySnapshot = await getDocs(collection(db, PRODUCTS_COLLECTION));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    subscribeProducts(callback) {
        return onSnapshot(collection(db, PRODUCTS_COLLECTION), (snapshot) => {
            const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(products);
        });
    },

    async addProduct(product) {
        const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), {
            ...product,
            createdAt: new Date().toISOString(),
            stock: Number(product.stock),
            purchasePrice: Number(product.purchasePrice),
            minStock: Number(product.minStock)
        });
        return docRef.id;
    },

    async updateProduct(id, updates) {
        const docRef = doc(db, PRODUCTS_COLLECTION, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },

    async deleteProduct(id) {
        await deleteDoc(doc(db, PRODUCTS_COLLECTION, id));
    },

    async getCustomers() {
        const querySnapshot = await getDocs(collection(db, CUSTOMERS_COLLECTION));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },


    // Customers
    async addCustomer(customerData) {
        const id = customerData.phone || customerData.name.trim().replace(/\s+/g, '_').toLowerCase();
        const docRef = doc(db, CUSTOMERS_COLLECTION, id);
        await setDoc(docRef, {
            ...customerData,
            createdAt: new Date().toISOString()
        });

        return id;
    },

    async updateCustomer(id, updates) {
        const docRef = doc(db, CUSTOMERS_COLLECTION, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },

    async deleteCustomer(id) {
        await deleteDoc(doc(db, CUSTOMERS_COLLECTION, id));
    },

    subscribeCustomers(callback) {
        return onSnapshot(collection(db, CUSTOMERS_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // Customer Payments
    async addCustomerPayment(paymentData) {
        const docRef = await addDoc(collection(db, CUSTOMER_PAYMENTS_COLLECTION), {
            ...paymentData,
            createdAt: new Date().toISOString()
        });

        return docRef.id;
    },

    async deleteCustomerPayment(id) {
        await deleteDoc(doc(db, CUSTOMER_PAYMENTS_COLLECTION, id));
    },

    async updateCustomerPayment(id, updates) {
        const docRef = doc(db, CUSTOMER_PAYMENTS_COLLECTION, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },

    subscribeCustomerPayments(callback) {
        const q = query(collection(db, CUSTOMER_PAYMENTS_COLLECTION), orderBy("date", "desc"));
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // Migration / Maintenance
    async updateLinkedRecordsName(oldName, newName, oldPhone, newPhone) {
        if (!oldName || oldName === newName) return;

        console.log(`Migrating records from "${oldName}" to "${newName}"...`);

        // 1. Update Invoices
        const invoicesRef = collection(db, INVOICES_COLLECTION);
        const qInv = query(invoicesRef, where("customerName", "==", oldName));
        const invSnaps = await getDocs(qInv);

        const updatePromises = invSnaps.docs.map(doc =>
            updateDoc(doc.ref, {
                customerName: newName,
                customerPhone: newPhone || doc.data().customerPhone
            })
        );

        // 2. Update Payments
        const paymentsRef = collection(db, CUSTOMER_PAYMENTS_COLLECTION);
        const qPay = query(paymentsRef, where("customerName", "==", oldName));
        const paySnaps = await getDocs(qPay);

        const payPromises = paySnaps.docs.map(doc =>
            updateDoc(doc.ref, {
                customerName: newName,
                customerPhone: newPhone || doc.data().customerPhone
            })
        );

        await Promise.all([...updatePromises, ...payPromises]);
        console.log(`Migrated ${updatePromises.length} invoices and ${payPromises.length} payments.`);
    },

    // Purchases
    async addPurchase(purchaseData) {
        const batch = writeBatch(db);

        // 1. Add Purchase Record
        const purchaseRef = doc(collection(db, PURCHASES_COLLECTION));
        batch.set(purchaseRef, {
            ...purchaseData,
            createdAt: new Date().toISOString()
        });

        // 2. Update Product Stocks / Add New Products
        purchaseData.items.forEach(item => {
            const productRef = item.id ? doc(db, PRODUCTS_COLLECTION, item.id) : doc(collection(db, PRODUCTS_COLLECTION));

            if (item.id) {
                // Existing Product: Update stock, price and GST
                batch.update(productRef, {
                    stock: increment(Number(item.quantity)),
                    purchasePrice: Number(item.purchasePrice),
                    gst: Number(item.gst || 5),
                    updatedAt: new Date().toISOString()
                });
            } else {
                // New Product: Create document
                batch.set(productRef, {
                    name: item.name,
                    category: item.category || 'General',
                    unit: item.unit || 'Bag',
                    gst: Number(item.gst || 5),
                    purchasePrice: Number(item.purchasePrice),
                    stock: Number(item.quantity),
                    minStock: 10,
                    createdAt: new Date().toISOString()
                });
            }
        });

        // 3. Save/Update Supplier Info
        if (purchaseData.supplierName) {
            const supplierRef = doc(db, SUPPLIERS_COLLECTION, purchaseData.supplierName.trim().replace(/\s+/g, '_').toLowerCase());
            batch.set(supplierRef, {
                name: purchaseData.supplierName,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        await batch.commit();

        return purchaseRef.id;
    },

    async updatePurchase(purchaseId, updatedData) {
        await runTransaction(db, async (transaction) => {
            const purchaseRef = doc(db, PURCHASES_COLLECTION, purchaseId);
            const purchaseDoc = await transaction.get(purchaseRef);

            if (!purchaseDoc.exists()) throw new Error("Purchase does not exist!");

            const oldData = purchaseDoc.data();

            // 1. Revert Old Stock (Decrease)
            for (const item of oldData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    transaction.update(productRef, {
                        stock: increment(-Number(item.quantity))
                    });
                }
            }

            // 2. Apply New Stock (Increase)
            for (const item of updatedData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    transaction.update(productRef, {
                        stock: increment(Number(item.quantity)),
                        purchasePrice: Number(item.purchasePrice),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            // 3. Update Purchase Record
            transaction.update(purchaseRef, {
                ...updatedData,
                updatedAt: new Date().toISOString()
            });

            // 4. Update Supplier info if changed
            if (updatedData.supplierName) {
                const supplierRef = doc(db, SUPPLIERS_COLLECTION, updatedData.supplierName.trim().replace(/\s+/g, '_').toLowerCase());
                transaction.set(supplierRef, {
                    name: updatedData.supplierName,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
        });
    },

    async deletePurchase(purchaseId) {
        await runTransaction(db, async (transaction) => {
            const purchaseRef = doc(db, PURCHASES_COLLECTION, purchaseId);
            const purchaseDoc = await transaction.get(purchaseRef);

            if (!purchaseDoc.exists()) {
                throw new Error("Purchase does not exist!");
            }

            const purchaseData = purchaseDoc.data();

            // Revert Stock (Decrease it, because we are undoing a purchase)
            // Note: If stock falls below 0, it might be weird, but we allow it as correction
            for (const item of purchaseData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    transaction.update(productRef, {
                        stock: increment(-Number(item.quantity)),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            transaction.delete(purchaseRef);
        });
    },

    async getPurchases() {
        const querySnapshot = await getDocs(collection(db, PURCHASES_COLLECTION));
        return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
    },

    // Invoices (Sales)
    async addInvoice(invoiceData) {
        const invoiceId = await runTransaction(db, async (transaction) => {
            // 1. Get current counter
            const counterRef = doc(db, "metadata", "counters");
            const counterDoc = await transaction.get(counterRef);

            let nextId = 1;
            if (counterDoc.exists()) {
                nextId = (counterDoc.data().invoiceCount || 0) + 1;
            }

            const formattedId = `INV-${String(nextId).padStart(4, '0')}`;

            // 2. Add Invoice Record
            const invoiceRef = doc(db, INVOICES_COLLECTION, formattedId);
            transaction.set(invoiceRef, {
                ...invoiceData,
                id: formattedId,
                createdAt: new Date().toISOString()
            });

            // 3. Update Product Stocks
            invoiceData.items.forEach(item => {
                const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                let qty = Number(item.quantity);
                if (item.salesType === 'Loose') {
                    qty = qty / (Number(item.bagWeight) || 50);
                }

                transaction.update(productRef, {
                    stock: increment(-qty),
                    updatedAt: new Date().toISOString()
                });
            });

            // 4. Update Counter
            transaction.set(counterRef, { invoiceCount: nextId }, { merge: true });

            // 5. Add Internal Notification for the new bill
            const notifRef = doc(collection(db, NOTIFICATIONS_COLLECTION));
            transaction.set(notifRef, {
                type: 'NEW_BILL',
                title: 'New Bill Generated',
                message: `Invoice ${formattedId} for ${invoiceData.customerName} (${getAppConfig().currency} ${invoiceData.totalAmount})`,
                read: false,
                createdAt: new Date().toISOString(),
                link: 'billing'
            });

            // 5. Manage Customer (Check if exists by phone first, then name)
            const customersRef = collection(db, CUSTOMERS_COLLECTION);
            let existingCustSnap = null;

            if (invoiceData.customerPhone) {
                const qPhone = query(customersRef, where("phone", "==", invoiceData.customerPhone));
                const snap = await getDocs(qPhone);
                if (!snap.empty) existingCustSnap = snap.docs[0];
            }

            if (!existingCustSnap) {
                const qName = query(customersRef, where("name", "==", invoiceData.customerName));
                const snap = await getDocs(qName);
                if (!snap.empty) existingCustSnap = snap.docs[0];
            }

            if (existingCustSnap) {
                // Update Existing
                transaction.update(doc(db, CUSTOMERS_COLLECTION, existingCustSnap.id), {
                    name: invoiceData.customerName,
                    phone: invoiceData.customerPhone || existingCustSnap.data().phone || '',
                    address: invoiceData.customerAddress || existingCustSnap.data().address || '',
                    lastVisit: new Date().toISOString()
                });
            } else {
                // Create New
                const customerId = invoiceData.customerPhone || invoiceData.customerName.trim().replace(/\s+/g, '_').toLowerCase();
                transaction.set(doc(db, CUSTOMERS_COLLECTION, customerId), {
                    name: invoiceData.customerName,
                    phone: invoiceData.customerPhone || '',
                    address: invoiceData.customerAddress || '',
                    lastVisit: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                });
            }

            return formattedId;
        });

        return invoiceId;
    },

    async updateInvoice(docId, updatedData) {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, INVOICES_COLLECTION, docId);
            const invoiceDoc = await transaction.get(invoiceRef);

            if (!invoiceDoc.exists()) throw new Error("Invoice does not exist!");

            const oldData = invoiceDoc.data();

            // 1. Revert Old Stock (Increase)
            for (const item of oldData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    let qty = Number(item.quantity);
                    if (item.salesType === 'Loose') {
                        qty = qty / (Number(item.bagWeight) || 50);
                    }
                    transaction.update(productRef, {
                        stock: increment(qty)
                    });
                }
            }

            // 2. Apply New Stock (Decrease)
            for (const item of updatedData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    let qty = Number(item.quantity);
                    if (item.salesType === 'Loose') {
                        qty = qty / (Number(item.bagWeight) || 50);
                    }
                    transaction.update(productRef, {
                        stock: increment(-qty)
                    });
                }
            }

            // 3. Update Invoice
            transaction.update(invoiceRef, {
                ...updatedData,
                updatedAt: new Date().toISOString()
            });
        });
    },

    async deleteInvoice(invoiceId) {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, INVOICES_COLLECTION, invoiceId);
            const invoiceDoc = await transaction.get(invoiceRef);

            if (!invoiceDoc.exists()) {
                throw new Error("Invoice does not exist!");
            }

            const invoiceData = invoiceDoc.data();

            // Revert Stock (Increase it, because we are undoing a sale)
            for (const item of invoiceData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    let qty = Number(item.quantity);
                    if (item.salesType === 'Loose') {
                        qty = qty / (Number(item.bagWeight) || 50);
                    }
                    transaction.update(productRef, {
                        stock: increment(qty),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            transaction.delete(invoiceRef);
        });
    },

    subscribeInvoices(callback) {
        return onSnapshot(collection(db, INVOICES_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
            callback(data);
        });
    },

    subscribeRecentInvoices(callback, limitCount = 50) {
        const q = query(
            collection(db, INVOICES_COLLECTION),
            orderBy("createdAt", "desc"),
            limit(limitCount)
        );
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
            callback(data);
        });
    },

    async getInvoices() {
        const querySnapshot = await getDocs(collection(db, INVOICES_COLLECTION));
        return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
    },

    async getInvoice(id) {
        const docRef = doc(db, INVOICES_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { ...docSnap.data(), id: docSnap.data().id || docSnap.id, docId: docSnap.id };
        } else {
            return null;
        }
    },

    subscribePurchases(callback) {
        return onSnapshot(collection(db, PURCHASES_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
            callback(data);
        });
    },

    // Suppliers
    async addSupplier(supplierData) {
        const id = supplierData.name.trim().replace(/\s+/g, '_').toLowerCase();
        const docRef = doc(db, SUPPLIERS_COLLECTION, id);
        await setDoc(docRef, {
            ...supplierData,
            createdAt: new Date().toISOString()
        });

        return id;
    },

    async updateSupplier(id, updates) {
        const docRef = doc(db, SUPPLIERS_COLLECTION, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },

    async deleteSupplier(id) {
        await deleteDoc(doc(db, SUPPLIERS_COLLECTION, id));
    },

    subscribeSuppliers(callback) {
        return onSnapshot(collection(db, SUPPLIERS_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    async getSuppliers() {
        const querySnapshot = await getDocs(collection(db, SUPPLIERS_COLLECTION));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Supplier Payments
    async addSupplierPayment(paymentData) {
        const docRef = await addDoc(collection(db, SUPPLIER_PAYMENTS_COLLECTION), {
            ...paymentData,
            createdAt: new Date().toISOString()
        });

        return docRef.id;
    },

    async deleteSupplierPayment(id) {
        await deleteDoc(doc(db, SUPPLIER_PAYMENTS_COLLECTION, id));
    },

    subscribeSupplierPayments(callback) {
        const q = query(collection(db, SUPPLIER_PAYMENTS_COLLECTION), orderBy("date", "desc"));
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // Notifications
    async addNotification(notification) {
        await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
            ...notification,
            createdAt: new Date().toISOString(),
            read: false
        });
    },

    subscribeNotifications(callback) {
        const q = query(collection(db, NOTIFICATIONS_COLLECTION), orderBy("createdAt", "desc"));
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    async markNotificationAsRead(id) {
        const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);
        await updateDoc(docRef, { read: true });
    },

    async clearAllNotifications() {
        const querySnapshot = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
        const batch = writeBatch(db);
        querySnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    },

    // Users
    async getUsers() {
        const snap = await getDocs(collection(db, USERS_COLLECTION));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async addUser(data) {
        const id = data.id || data.username.trim().toLowerCase();
        await setDoc(doc(db, USERS_COLLECTION, id), {
            ...data,
            createdAt: new Date().toISOString()
        }, { merge: true });
        return id;
    },

    async deleteUser(id) {
        await deleteDoc(doc(db, USERS_COLLECTION, id));
    },

    // Notifications
    subscribeNotifications(callback) {
        const q = query(collection(db, NOTIFICATIONS_COLLECTION), orderBy('createdAt', 'desc'), limit(50));
        return onSnapshot(q, (snapshot) => {
            const notifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            callback(notifications);
        });
    },

    async markNotificationAsRead(id) {
        const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);
        await updateDoc(docRef, { read: true, updatedAt: new Date().toISOString() });
    },

    async clearAllNotifications() {
        const snap = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    },

    async sendNewBillEmail(invoice) {
        try {
            const settings = await this.getAppSettings('email_notifications');
            if (!settings || !settings.enabled || !settings.recipientEmail) return;

            const apiKey = settings.brevoApiKey || import.meta.env.VITE_BREVO_API_KEY;

            console.log(`Email Service: Attempting to send alert for ${invoice.id} to ${settings.recipientEmail}...`);

            const htmlContent = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #2563eb;">New Bill Generated</h2>
                    <p>A new bill has been generated at <strong>${getAppConfig().appName}</strong>.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 5px 0;"><strong>Invoice ID:</strong></td><td>${invoice.id}</td></tr>
                        <tr><td style="padding: 5px 0;"><strong>Date:</strong></td><td>${new Date(invoice.date).toLocaleDateString('en-IN')}</td></tr>
                        <tr><td style="padding: 5px 0;"><strong>Customer:</strong></td><td>${invoice.customerName}</td></tr>
                        <tr><td style="padding: 5px 0;"><strong>Total Amount:</strong></td><td style="color: #059669; font-weight: bold;">${getAppConfig().currency} ${Number(invoice.totalAmount).toFixed(2)}</td></tr>
                    </table>
                    <div style="margin-top: 25px; text-align: center;">
                        <a href="${window.location.origin}/public/invoices/${invoice.id}" 
                           style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                           View Digital Invoice
                        </a>
                    </div>
                    <p style="margin-top: 20px; font-size: 12px; color: #666; text-align: center;">Or access the full details via your Admin Dashboard.</p>
                </div>
            `;

            if (apiKey) {
                const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'api-key': apiKey,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: {
                            name: import.meta.env.VITE_BREVO_SENDER_NAME || `${getAppConfig().appName} Billing Software`,
                            email: import.meta.env.VITE_BREVO_SENDER_EMAIL || 'bill@bhojanpatri.in'
                        },
                        to: [{ email: settings.recipientEmail }],
                        subject: `New Bill Generated: ${invoice.id} (${getAppConfig().currency} ${Number(invoice.totalAmount).toFixed(2)})`,
                        htmlContent: htmlContent
                    })
                });

                if (response.ok) {
                    console.log("Brevo API: Email notification sent successfully.");
                    return;
                } else {
                    const errData = await response.json();
                    console.error("Brevo API Error:", errData);
                }
            }

            // Fallback for manual relay logging
            console.log("Email Notification Payload (Fallback):", {
                to: settings.recipientEmail,
                invoiceId: invoice.id,
                smtp: {
                    host: settings.smtpHost || import.meta.env.VITE_EMAIL_HOST,
                    user: settings.smtpUser || import.meta.env.VITE_EMAIL_USER
                }
            });
        } catch (err) {
            console.error("Email Notification Failed:", err);
        }
    },

    // Returns (Sales & Purchases)
    async addSaleReturn(returnData) {
        return await runTransaction(db, async (transaction) => {
            // 1. Create Sale Return Record
            const returnRef = doc(collection(db, SALE_RETURNS_COLLECTION));
            transaction.set(returnRef, {
                ...returnData,
                createdAt: new Date().toISOString()
            });

            // 2. Adjust Product Stocks (Increase)
            for (const item of returnData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    let qty = Number(item.quantity);
                    if (item.salesType === 'Loose') {
                        qty = qty / (Number(item.bagWeight) || 50);
                    }
                    transaction.update(productRef, {
                        stock: increment(qty),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            // 3. Create Linked Customer Payment (Credit)
            const paymentRef = doc(collection(db, CUSTOMER_PAYMENTS_COLLECTION));
            transaction.set(paymentRef, {
                customerId: returnData.customerId,
                customerName: returnData.customerName,
                customerPhone: returnData.customerPhone || '',
                date: returnData.date,
                amount: returnData.totalRefund,
                method: 'Return Credit',
                note: `Return for Bill: ${returnData.invoiceId}`,
                isReturn: true,
                returnId: returnRef.id,
                createdAt: new Date().toISOString()
            });

            return returnRef.id;
        });
    },

    async addPurchaseReturn(returnData) {
        return await runTransaction(db, async (transaction) => {
            // 1. Create Purchase Return Record
            const returnRef = doc(collection(db, PURCHASE_RETURNS_COLLECTION));
            transaction.set(returnRef, {
                ...returnData,
                createdAt: new Date().toISOString()
            });

            // 2. Adjust Product Stocks (Decrease)
            for (const item of returnData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    transaction.update(productRef, {
                        stock: increment(-Number(item.quantity)),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            // 3. Create Linked Supplier Payment (Credit)
            const paymentRef = doc(collection(db, SUPPLIER_PAYMENTS_COLLECTION));
            transaction.set(paymentRef, {
                supplierName: returnData.supplierName,
                date: returnData.date,
                amount: returnData.totalRefund,
                method: 'Return Credit',
                note: `Return for Purchase: ${returnData.purchaseId}`,
                isReturn: true,
                returnId: returnRef.id,
                createdAt: new Date().toISOString()
            });

            return returnRef.id;
        });
    },

    // Customer ID Synchronization
    async syncCustomerIds(onProgress) {
        console.log("Starting Customer ID Synchronization...");
        const querySnapshot = await getDocs(collection(db, CUSTOMERS_COLLECTION));
        const allCustomers = querySnapshot.docs;
        let migratedCount = 0;

        for (let i = 0; i < allCustomers.length; i++) {
            const docSnap = allCustomers[i];
            const data = docSnap.data();
            const currentId = docSnap.id;

            // Calculate target ID using the same logic as addCustomer
            const targetId = data.phone || data.name.trim().replace(/\s+/g, '_').toLowerCase();

            if (onProgress) {
                onProgress(`Checking ${i + 1}/${allCustomers.length}: ${data.name}`);
            }

            if (currentId !== targetId) {
                console.log(`Migrating Customer: ${currentId} -> ${targetId}`);

                // 1. Copy Customer to new ID
                const newDocRef = doc(db, CUSTOMERS_COLLECTION, targetId);
                await setDoc(newDocRef, {
                    ...data,
                    id: targetId // Internal id consistency
                });

                // 2. Update all Payments linked to this ID
                const paymentsRef = collection(db, CUSTOMER_PAYMENTS_COLLECTION);
                const qPay = query(paymentsRef, where("customerId", "==", currentId));
                const paySnaps = await getDocs(qPay);

                for (const pDoc of paySnaps.docs) {
                    await updateDoc(pDoc.ref, { customerId: targetId });
                }

                // 3. Delete old Customer profile
                await deleteDoc(docSnap.ref);
                migratedCount++;
            }
        }

        return migratedCount;
    },

    // Bill Resequencing (Fill Gaps) - Safe 2-Phase Batch Approach
    async resequenceInvoices(onProgress) {
        console.log("Resequence: Fetching all invoices...");
        const querySnapshot = await getDocs(collection(db, INVOICES_COLLECTION));
        const allInvoices = querySnapshot.docs.map(d => ({ _srcDocId: d.id, ...d.data() }));
        console.log(`Resequence: Found ${allInvoices.length} invoices. Sorting by date...`);

        // 1. Sort by createdAt (full ISO) then date, oldest first
        allInvoices.sort((a, b) => {
            const dateA = a.createdAt || a.date || '';
            const dateB = b.createdAt || b.date || '';
            return dateA.localeCompare(dateB);
        });

        const total = allInvoices.length;
        const originalIds = new Set(querySnapshot.docs.map(d => d.id));
        let migratedCount = 0;

        // Helper: commit current batch and reset
        let batch = writeBatch(db);
        let opCount = 0;
        const flushBatch = async (label = '') => {
            if (opCount > 0) {
                console.log(`Resequence: Committing ${opCount} ops (${label})...`);
                await batch.commit();
                batch = writeBatch(db);
                opCount = 0;
            }
        };

        // Build the set of final IDs so we know which originals to delete
        const finalIds = new Set();

        // ── PHASE 1: Write final INV-XXXX docs directly from in-memory data ──
        // No reads needed — we have everything already. No collisions because
        // we batch-set ALL new IDs first, then delete originals in Phase 2.
        console.log("Resequence Phase 1/2: Writing final INV-XXXX docs from memory...");
        if (onProgress) onProgress(`Phase 1/2: Writing ${total} invoices to new sequence...`);

        for (let i = 0; i < total; i++) {
            const data = allInvoices[i];
            const finalId = `INV-${String(i + 1).padStart(4, '0')}`;
            finalIds.add(finalId);

            // Strip internal tracking fields before writing
            const { _srcDocId, docId: _d, id: _id, ...cleanData } = data;

            const finalRef = doc(db, INVOICES_COLLECTION, finalId);
            batch.set(finalRef, { ...cleanData, id: finalId, docId: finalId });
            opCount++;
            migratedCount++;

            if (opCount >= 400) await flushBatch(`Phase 1 chunk at ${i + 1}`);
        }
        await flushBatch('Phase 1 final');

        // ── PHASE 2: Delete all original IDs not in the new sequence ──────────
        console.log("Resequence Phase 2/2: Deleting old/orphaned doc IDs...");
        if (onProgress) onProgress(`Phase 2/2: Cleaning up old records...`);

        for (const oldId of originalIds) {
            if (!finalIds.has(oldId)) {
                console.log(`Resequence: Queueing delete for ${oldId}`);
                batch.delete(doc(db, INVOICES_COLLECTION, oldId));
                opCount++;
                if (opCount >= 400) await flushBatch('Phase 2 chunk');
            }
        }
        await flushBatch('Phase 2 final');

        // Update global counter
        const counterRef = doc(db, "metadata", "counters");
        await setDoc(counterRef, { invoiceCount: total }, { merge: true });

        console.log(`Resequence: ✅ Done. ${migratedCount} invoices resequenced.`);
        return migratedCount;
    },



    // Migration Utilities
    async migrateInvoiceIds(onProgress) {
        console.log("Starting Doc ID to Invoice ID Migration...");
        const querySnapshot = await getDocs(collection(db, INVOICES_COLLECTION));
        const allInvoices = querySnapshot.docs;
        let migratedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < allInvoices.length; i++) {
            const docSnap = allInvoices[i];
            const data = docSnap.data();
            const currentDocId = docSnap.id;
            const targetId = data.id; // Internal INV-XXXX ID

            if (onProgress) {
                onProgress(`Checking ${i + 1}/${allInvoices.length}: ${currentDocId}`);
            }

            if (targetId && currentDocId !== targetId) {
                console.log(`Migrating ${currentDocId} -> ${targetId}`);

                // Copy to new ID
                const newDocRef = doc(db, INVOICES_COLLECTION, targetId);
                await setDoc(newDocRef, {
                    ...data,
                    docId: targetId // Update internal docId reference if it exists
                });

                // Delete old ID
                await deleteDoc(docSnap.ref);
                migratedCount++;
            } else {
                skippedCount++;
            }
        }

        console.log(`Migration Complete: ${migratedCount} migrated, ${skippedCount} already correct.`);
        return { migratedCount, skippedCount };
    },

    async getInvoiceCount() {
        const counterRef = doc(db, "metadata", "counters");
        const docSnap = await getDoc(counterRef);
        return docSnap.exists() ? (docSnap.data().invoiceCount || 0) : 0;
    },

    async updateInvoiceCount(newCount) {
        const counterRef = doc(db, "metadata", "counters");
        await setDoc(counterRef, { 
            invoiceCount: Number(newCount),
            lastUpdated: new Date().toISOString()
        }, { merge: true });
    },


    async getUserByEmail(email) {
        // 1. Try searching 'email' field
        let q = query(collection(db, USERS_COLLECTION), where("email", "==", email));
        let querySnapshot = await getDocs(q);

        // 2. Fallback: Try searching 'username' field (for legacy or specific setups)
        if (querySnapshot.empty) {
            q = query(collection(db, USERS_COLLECTION), where("username", "==", email));
            querySnapshot = await getDocs(q);
        }

        if (querySnapshot.empty) return null;
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    },

    async exportAllDataJSON() {
        const collectionList = [
            { name: 'invoices', id: INVOICES_COLLECTION },
            { name: 'products', id: PRODUCTS_COLLECTION },
            { name: 'customers', id: CUSTOMERS_COLLECTION },
            { name: 'suppliers', id: SUPPLIERS_COLLECTION },
            { name: 'purchases', id: PURCHASES_COLLECTION },
            { name: 'customer_payments', id: CUSTOMER_PAYMENTS_COLLECTION },
            { name: 'supplier_payments', id: SUPPLIER_PAYMENTS_COLLECTION }
        ];

        const backup = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            data: {}
        };

        for (const col of collectionList) {
            try {
                console.log(`Export: Gathering ${col.name}...`);
                const snap = await getDocs(collection(db, col.id));
                backup.data[col.name] = snap.docs.map(d => ({ ...d.data(), docId: d.id }));
            } catch (err) {
                console.error(`Export: Failed to gather ${col.name}:`, err.message);
                throw err; // Re-throw to be caught by the caller
            }
        }

        return backup;
    },

    // App Preferences / Metadata
    async getAppSettings(id) {
        const docRef = doc(db, SETTINGS_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    },

    async updateAppSettings(id, data) {
        try {
            console.log(`Firestore: Updating settings for ${id}...`);
            const docRef = doc(db, SETTINGS_COLLECTION, id);
            await setDoc(docRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
            console.log(`Firestore: Settings for ${id} updated successfully.`);
        } catch (err) {
            console.error(`Firestore: Failed to update settings for ${id}:`, err.message);
            throw err;
        }
    },

    async repairOrphanedInvoices(oldName, targetName) {
        if (!oldName || !targetName || oldName === targetName) return 0;
        console.log(`Manually repairing history: "${oldName}" -> "${targetName}"`);

        // Use existing helper
        await this.updateLinkedRecordsName(oldName, targetName);
        return true;
    },

    async deduplicateCustomers(onProgress) {
        const snap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
        const customers = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        const seen = new Map(); // key: phone or normalized name, value: original customer ID
        const duplicates = [];

        for (const c of customers) {
            const nameKey = (c.name || '').trim().toLowerCase();
            const phoneKey = (c.phone || '').trim();
            const key = phoneKey || nameKey;

            if (seen.has(key)) {
                duplicates.push({ duplicate: c, original: customers.find(o => o.id === seen.get(key)) });
            } else {
                seen.set(key, c.id);
            }
        }

        if (duplicates.length === 0) return 0;

        let count = 0;
        for (const item of duplicates) {
            const dup = item.duplicate;
            const original = item.original;

            // 1. Migrate History before deleting duplicate
            if (original && original.name && dup.name && original.name !== dup.name) {
                await this.updateLinkedRecordsName(dup.name, original.name, dup.phone, original.phone);
            } else if (original && original.name && dup.name && original.name === dup.name) {
                // Same name but different IDs? Ensure linked by name still works or IDs are updated.
                // Our current updateLinkedRecordsName matches by name.
                // If names are same, no migration needed UNLESS we start matching by ID.
            }

            // 2. Delete the duplicate profile
            await deleteDoc(doc(db, CUSTOMERS_COLLECTION, dup.id));

            count++;
            if (onProgress) onProgress(count, duplicates.length);
        }

        return count;
    },

    async importAllDataJSON(backup, onProgress) {
        if (!backup || !backup.data) throw new Error("Invalid backup data structure.");

        const collections = [
            { name: 'invoices', id: INVOICES_COLLECTION },
            { name: 'products', id: PRODUCTS_COLLECTION },
            { name: 'customers', id: CUSTOMERS_COLLECTION },
            { name: 'suppliers', id: SUPPLIERS_COLLECTION },
            { name: 'purchases', id: PURCHASES_COLLECTION },
            { name: 'customer_payments', id: CUSTOMER_PAYMENTS_COLLECTION },
            { name: 'supplier_payments', id: SUPPLIER_PAYMENTS_COLLECTION }
        ];

        let totalDocs = 0;
        collections.forEach(col => {
            if (backup.data[col.name]) totalDocs += backup.data[col.name].length;
        });

        let currentCount = 0;

        for (const col of collections) {
            const docs = backup.data[col.name];
            if (!docs || !Array.isArray(docs)) continue;

            // Firestore batches are limited to 500 operations
            for (let i = 0; i < docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = docs.slice(i, i + 500);

                chunk.forEach(data => {
                    const docId = data.docId || data.id;
                    if (!docId) return;

                    const cleanedData = { ...data };
                    delete cleanedData.docId;

                    const docRef = doc(db, col.id, docId);
                    batch.set(docRef, cleanedData);
                    currentCount++;
                    if (onProgress) onProgress(currentCount, totalDocs);
                });

                await batch.commit();
            }
        }

        // Update Metadata Counters (Invoice Count)
        const invoices = backup.data.invoices || [];
        if (invoices.length > 0) {
            const maxId = invoices.reduce((max, inv) => {
                const match = (inv.id || '').match(/INV-(\d+)/);
                if (match) {
                    const num = parseInt(match[1]);
                    return Math.max(max, num);
                }
                return max;
            }, 0);

            if (maxId > 0) {
                const counterRef = doc(db, "metadata", "counters");
                await setDoc(counterRef, { invoiceCount: maxId }, { merge: true });
            }
        }

        return currentCount;
    },

    async cleanWipeSoftware(onProgress) {
        const collections = [
            { name: 'invoices', id: INVOICES_COLLECTION },
            { name: 'products', id: PRODUCTS_COLLECTION },
            { name: 'customers', id: CUSTOMERS_COLLECTION },
            { name: 'suppliers', id: SUPPLIERS_COLLECTION },
            { name: 'purchases', id: PURCHASES_COLLECTION },
            { name: 'customer_payments', id: CUSTOMER_PAYMENTS_COLLECTION },
            { name: 'supplier_payments', id: SUPPLIER_PAYMENTS_COLLECTION },
            { name: 'notifications', id: NOTIFICATIONS_COLLECTION },
            { name: 'users', id: USERS_COLLECTION }
        ];

        let totalDeleted = 0;

        for (const col of collections) {
            const snap = await getDocs(collection(db, col.id));
            if (snap.empty) continue;

            // Delete in batches of 500
            const docs = snap.docs;
            for (let i = 0; i < docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = docs.slice(i, i + 500);

                chunk.forEach(d => {
                    const data = d.data();
                    // Don't delete Admin users
                    if (col.id === USERS_COLLECTION && data.role === 'admin') {
                        return;
                    }
                    batch.delete(d.ref);
                    totalDeleted++;
                    if (onProgress) onProgress(totalDeleted);
                });

                await batch.commit();
            }
        }

        // Reset Metadata Counters
        const counterRef = doc(db, "metadata", "counters");
        await setDoc(counterRef, { invoiceCount: 0 }, { merge: true });

        return totalDeleted;
    },

    // ── RETURNS ────────────────────────────────────────────────────────────────

    // Subscribe to sale returns history (real-time)
    subscribeSaleReturns(callback) {
        const q = query(
            collection(db, SALE_RETURNS_COLLECTION),
            orderBy('createdAt', 'desc'),
            limit(100)
        );
        return onSnapshot(q, (snap) => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    },

    // Subscribe to purchase returns history (real-time)
    subscribePurchaseReturns(callback) {
        const q = query(
            collection(db, PURCHASE_RETURNS_COLLECTION),
            orderBy('createdAt', 'desc'),
            limit(100)
        );
        return onSnapshot(q, (snap) => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    },

    // Record a Sale Return and add stock back for returned items
    async addSaleReturn(returnData) {
        const batch = writeBatch(db);

        // 1. Save the return record
        const returnRef = doc(collection(db, SALE_RETURNS_COLLECTION));
        batch.set(returnRef, {
            ...returnData,
            type: 'SALE_RETURN',
            createdAt: new Date().toISOString()
        });

        // 2. Increment stock for each returned item
        for (const item of returnData.items) {
            if (!item.id) continue;
            const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
            batch.update(productRef, {
                stock: increment(Number(item.quantity) || 0)
            });
        }

        await batch.commit();
        return returnRef.id;
    },

    // Record a Purchase Return and reduce stock for returned items
    async addPurchaseReturn(returnData) {
        const batch = writeBatch(db);

        // 1. Save the return record
        const returnRef = doc(collection(db, PURCHASE_RETURNS_COLLECTION));
        batch.set(returnRef, {
            ...returnData,
            type: 'PURCHASE_RETURN',
            createdAt: new Date().toISOString()
        });

        // 2. Decrement stock for each returned item (sending back to supplier)
        for (const item of returnData.items) {
            if (!item.id) continue;
            const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
            batch.update(productRef, {
                stock: increment(-(Number(item.quantity) || 0))
            });
        }

        await batch.commit();
        return returnRef.id;
    },

    // Delete a Sale Return and roll back stock (items go back OUT of stock)
    async deleteSaleReturn(returnId, items = []) {
        const batch = writeBatch(db);

        // 1. Delete the return document
        batch.delete(doc(db, SALE_RETURNS_COLLECTION, returnId));

        // 2. Reverse the stock increment (sale return added stock → remove it back)
        for (const item of items) {
            if (!item.id) continue;
            const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
            batch.update(productRef, {
                stock: increment(-(Number(item.quantity) || 0))
            });
        }

        await batch.commit();
    },

    // Delete a Purchase Return and roll back stock (items come back IN to stock)
    async deletePurchaseReturn(returnId, items = []) {
        const batch = writeBatch(db);

        // 1. Delete the return document
        batch.delete(doc(db, PURCHASE_RETURNS_COLLECTION, returnId));

        // 2. Reverse the stock decrement (purchase return removed stock → add it back)
        for (const item of items) {
            if (!item.id) continue;
            const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
            batch.update(productRef, {
                stock: increment(Number(item.quantity) || 0)
            });
        }

        await batch.commit();
    }
};
