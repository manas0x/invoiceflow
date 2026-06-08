# Mahaveer Khad Bhandar - Billing System

A modern, fast, and keyboard-first billing application built for **Mahaveer Khad Bhandar**.
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
- **Database**: Firebase Firestore (Real-time syncing).
- **Styling**: TailwindCSS (Modern UI).
- **Offline Support**: PWA capabilities (works with spotty internet).

## 📥 Setup & Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/your-repo/mahaveer-billing.git
    cd mahaveer-billing
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

## ⌨️ Keyboard Shortcuts Cheatsheet

| Key | Action |
| :--- | :--- |
| **F2** | Save Bill |
| **F4** | Focus Product Search |
| **Alt + N** | New Bill |
| **Alt + C** | Focus Customer |
| **Ctrl + Space** | Global Search |

---
*Built with ❤️ for Mahaveer Khad Bhandar*
