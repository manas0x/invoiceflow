# InvoiceFlow - Billing System

A modern, fast, and keyboard-first billing application built with **InvoiceFlow**.
Designed for speed, reliability, and offline-first capabilities using React & Firebase.

## 🚀 Key Features

### ⚡ Fast Billing (POS)
- **Keyboard Shortcuts**:
    - `F2`: Save Invoice (Instantly)
    - `F4`: Focus Product Search
    - `Alt + b`: New Bill (Reset)
    - `Alt + c`: Focus Customer Name
    - `Esc`: Cancel / Back
- **Smart Search**: Rapidly find products by name (English/Hindi) or code.
- **Stock Management**: Auto-deducts stock upon billing. Prevents selling out-of-stock items (configurable).

### 📱 Customer Engagement
- **WhatsApp Integration**: Share invoices directly to customer's WhatsApp with one click.
- **PDF Invoices**: Generate professional A4/Thermal invoices instantly.

### 📊 Management & Reports
- **Dashboard**: Real-time sales, profit, and low-stock alerts.
- **Inventory**: Track purchase prices, selling prices, and expiry dates.
- **Reports**: Analyze daily sales, GST collected, and top-selling products.
- **Data Backup**: One-click backup to Google Sheets for safety.

### 🛠 Technical Highlights
- **Framework**: React + Vite (Blazing fast performance).
- **Database**: Firebase Firestore, PostgreSQL, MySQL/MariaDB, or SQLite through the setup connector.
- **Styling**: TailwindCSS (Modern UI).
- **Offline Support**: PWA capabilities (works with spotty internet).

## 📥 Setup & Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/your-repo/invoiceflow.git
    cd invoiceflow
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file with your Firebase & Script credentials:
    ```env
    VITE_FIREBASE_API_KEY=...
    VITE_FIREBASE_AUTH_DOMAIN=...
    VITE_FIREBASE_PROJECT_ID=...
    VITE_GOOGLE_SHEET_SCRIPT_URL=...
    ```

4.  **Run Locally**
    ```bash
    npm run dev
    ```
    This starts both the Vite app and the local SQL connector on port `8787`. The first page is the InvoiceFlow installer.

    For a client-only session without the connector:
    ```bash
    npm run dev:client
    ```

    SQL setup requests use `/api/setup/test-connection` and `/api/setup/import`; Vite proxies those paths to the connector server.

    After setup, InvoiceFlow downloads a clean deployment ZIP containing `dist`, the connector server, package manifests, `.env`, and the completed installation lock. It excludes source files, test files, editor settings, logs, and `node_modules`. On another server, extract it, run `npm install --omit=dev`, then start it with `node server/index.js`.

## ⌨️ Keyboard Shortcuts Cheatsheet

| Key | Action |
| :--- | :--- |
| **F2** | Save Bill |
| **F4** | Focus Product Search |
| **Alt + N** | New Bill |
| **Alt + C** | Focus Customer |
| **Ctrl + Space** | Global Search |

---
*Built with ❤️ for InvoiceFlow*
