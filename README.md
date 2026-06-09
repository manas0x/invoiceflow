# InvoiceFlow – Billing & Inventory Management System

* **Name**: Manas Arora
* **GitHub**: [github.com/manas0x](https://github.com/manas0x)
* **Project Repository**: [InvoiceFlow](https://github.com/manas0x/invoiceflow)
* **Date**: June 9, 2026

---

## 2. Project Overview

### Problem Statement
Small businesses often manage invoices and inventory manually using spreadsheets or paper records. This can lead to inventory mismatches, billing errors, and inefficient record management. Existing digital solutions are often too complex, lack offline-first support, or require expensive hardware.

### Solution
InvoiceFlow is a web-based billing and inventory management system that allows businesses to:
* Create and manage professional invoices instantly.
* Track inventory levels with automatic stock deductions.
* Maintain comprehensive customer records and credit histories.
* Monitor business transactions via a real-time analytics dashboard.
* Adapt to different business modes (Retail, Pharmacy, Restaurant).

---

## 3. Key Features

### Invoice Management
* **Fast Billing**: Keyboard-first interface (`F2` to save, `F4` to search) to process queues instantly.
* **History & Returns**: View invoice history, manage partial/full refunds, and handle sales returns.
* **Customer Billing**: Track total credit dues per customer and process manual payments.

### Inventory Tracking
* **Comprehensive Products**: Add products with purchase/selling prices, batch numbers, and expiry dates.
* **Real-time Stock**: Automatically update stock during billing and alert when items hit minimum thresholds.
* **Dynamic Modifiers**: Support for loose items, weight-based calculations, and dynamic GST application.

### Customer Management
* **Records**: Store customer names, phone numbers, and WhatsApp integration for 1-click invoice sharing.
* **Purchase History**: Track past interactions, pending credits, and loyalty points.

### Reporting
* **Business Insights**: Real-time dashboard showing today's sales, profit margins, and total inventory value.
* **Alerts**: Visual progress bars for low-stock and soon-to-expire items.

---

## 4. System Architecture

```text
Browser / PWA Client
        │
Frontend (React + Vite)
        │
Firebase SDK (Client-side APIs)
        │
Backend Infrastructure
  │             │
Firestore DB   Auth & Storage
```

### Frontend
Responsible for:
* **User Interface**: Delivering a fast, glassmorphism-styled UI via TailwindCSS.
* **Form Validation**: Client-side checks for pricing, stock availability, and valid inputs.
* **State Management**: Managing complex shopping carts, customer selection, and discount applications in real-time.

### Backend (Firebase BaaS)
Responsible for:
* **Business Logic Enforcement**: Securing data access using Firestore Security Rules.
* **Authentication**: Managing Google OAuth 2.0 for features like automated Drive backups.
* **Real-time Sync**: Pushing live updates to all connected terminals (e.g., KDS or Storefront).

### Database (Firestore NoSQL)
Responsible for:
* Storing dynamic `products` and tracking `stock`.
* Managing `customers` and tracking credit limits.
* Archiving immutable `invoices` and transaction logs.

---

## 5. Architecture Decisions ⭐

### Why Use Firebase (BaaS) Instead of a Custom REST API?
**Benefits:**
* **Real-time Synchronization**: Instant updates across multiple devices (e.g., an order placed on the storefront appears instantly on the admin dashboard).
* **Offline-First Capabilities**: Firestore SDK caches data locally, allowing the POS to function seamlessly during internet outages and syncing automatically upon reconnection.
* **Rapid Iteration**: Eliminates the need to manage backend servers, scaling effortlessly with business growth.

### Why Separate the Public Storefront and Admin POS?
**Benefits:**
* **Security & Access Control**: The public storefront (`/?tab=shop`) is unauthenticated for customers, while the POS (`/?tab=billing`) requires staff access.
* **Performance**: Customers only load lightweight catalog data, while the POS loads heavy administrative interfaces.
* **UX Optimization**: The storefront is touch-optimized for mobile, while the POS is keyboard-optimized for rapid desk use.

### Why Store Inventory and Invoice Data Separately?
**Benefits:**
* **Immutability**: Invoices store a static snapshot of the item's price and name at the time of sale. If a product's price changes later in the `inventory`, past invoices remain perfectly accurate.
* **Easier Reporting**: Querying the `invoices` collection is heavily optimized for daily/monthly aggregation.
* **Reduced Data Redundancy**: Keeps the inventory collection lightweight for fast searching during checkout.

### Why Use Database Storage Instead of Local Storage?
**Benefits:**
* **Persistent Data**: LocalStorage can be cleared by browsers or system cleaners, risking catastrophic data loss.
* **Multi-user Support**: Enables a shop to run multiple billing terminals concurrently without conflicting invoice numbers or overlapping stock counts.
* **Cloud Backups**: Enables automated integration with Google Drive to backup JSON snapshots of the entire database.

---

## 6. Workflow Explanation

### Invoice Creation Workflow

```text
User Adds Items & Clicks Save (F2)
              ↓
Frontend Validation
(Checks stock availability & required fields)
              ↓
Firestore Batch Transaction
(Atomic Database Request)
              ↓
Inventory Updated
(Stock decremented in `products`)
              ↓
Invoice Generated
(Saved to `invoices` with timestamp)
              ↓
PDF Rendered & UI Reset
(A4/Thermal PDF created via pdfmake)
```

**Step-by-Step:**
1. **Validation**: The React frontend ensures the cart isn't empty and the customer hasn't exceeded credit limits.
2. **Atomic Transaction**: Firebase `runTransaction` ensures that if two cashiers sell the last item simultaneously, one will safely fail instead of causing negative stock.
3. **Database Update**: The item's stock is decremented.
4. **Archiving**: The final bill is saved.
5. **Output**: The frontend clears the screen for the next customer and generates a printable PDF.

---

## 7. Challenges & Solutions

### Challenge: Maintaining inventory consistency after invoice creation during concurrent checkouts.
**Solution:**
Implemented Firestore's atomic `runTransaction` and `increment()` methods. Instead of the frontend reading stock, subtracting it, and writing it back (which causes race conditions), the database is instructed to safely decrement stock atomically, guaranteeing consistency even across 5 simultaneous billing terminals.

### Challenge: Handling Spotty Internet Connections.
**Solution:**
Leveraged Firestore's local persistence. The POS writes the invoice locally first. The cashier can immediately serve the next customer, while the Firebase SDK silently synchronizes the data to the cloud whenever the internet connection stabilizes.

---

## 8. Future Improvements
* **AI-powered Sales Predictions**: Suggesting stock reorders based on seasonal trends.
* **GST Automation**: Automated filing exports for GSTR-1/3B.
* **Multi-user Role Management**: Granular permissions for Cashiers vs. Managers.
* **Hardware Integration**: Direct USB integration for barcode scanners and ESC/POS thermal printers.

---

## 9. GitHub & Demo

* **GitHub Repository**: [https://github.com/manas0x/invoiceflow](https://github.com/manas0x/invoiceflow)

*(Built with React, Vite, and TailwindCSS)*
