# InvoiceFlow - Small Business Inventory & Billing System

**InvoiceFlow** is a comprehensive, open-source web application designed to help small businesses manage their inventory, billing, suppliers, and customers efficiently. It features a modern, responsive UI and integrates with **Firebase** for real-time data and **Google Sheets** for automated backups.

> **Project built and maintained by [Manas Arora](https://www.linkedin.com/in/aroramanas01/)**

## 🌐 Live Demo

Check out the live application: **[https://invoiceflowbilling.web.app](https://invoiceflowbilling.web.app)**

### Test Credentials
| Role | Username | Password |
|------|----------|----------|
| **Admin** | `admin` | `123456` |
| **Staff** | `staff` | `123456` |

---

## 🚀 Key Features

*   **Smart Billing**: Generate professional PDF invoices instantly.
*   **Inventory Management**: Track stock levels, purchase prices, and supplier details.
*   **Transactions**: Record purchases and sales with automatic stock adjustments.
*   **Dashboard**: Real-time insights into sales, top products, and low stock alerts.
*   **Cloud Sync**: Secure data storage with Firebase.
*   **Sheet Backups**: Auto-sync transactions to a Google Sheet for easy accounting.
*   **Role-Based Access**: Separate interfaces for **Admins** and **Shop Staff**.

### 📊 Automated Backups (Google Sheets)

InvoiceFlow ensures your data is never lost by syncing essentially every transaction to **Google Sheets** in real-time. This serves as a powerful secondary database that is easy to access and analyze.

*   **Real-time Sync**: Every time a bill is generated or stock is purchased, the data is pushed to a connected Google Sheet instantly.
*   **Dual Storage**: Data lives in Firestore (for the app) AND Google Sheets (for you).
*   **Easy Accounting**: Use the generated Google Sheet to run your own custom formulas, pivot tables, or share with your accountant without giving them app access.
*   **Zero Maintenance**: Once configured, the sync happens automatically in the background.

---

## ⌨️ Keyboard Shortcuts

Navigate the application quickly with these shortcuts:

| Shortcut | Description |
|----------|-------------|
| **`Alt + B`** | Go to **Billing** |
| **`Alt + D`** | Go to **Dashboard** |
| **`Alt + I`** | Go to **Inventory** |
| **`Alt + P`** | Go to **Purchases** |
| **`Alt + S`** | Go to **Suppliers** |
| **`Alt + C`** | Go to **Customers** |
| **`Alt + R`** | Go to **Reports** |
| **`Ctrl + Space`** | **Focus Search Bar** (in Billing/Inventory) |
| **`Ctrl + P`** | Quick Action: **New Purchase Entry** |

---

## 🛠️ Technology Stack

*   **Frontend**: React.js, Vite, TailwindCSS
*   **Backend**: Firebase (Firestore, Auth)
*   **Integrations**: Google Apps Script (Sheet Sync)
*   **Tools**: jsPDF (Invoicing), XLSX (Excel Export), Lucide React (Icons)

---

## ⚙️ Setup Instructions

Follow these steps to set up the project locally.

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/invoiceflow.git
cd invoiceflow
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and add your Firebase and Google Script credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Optional: For Google Sheet Backups
VITE_GOOGLE_SHEET_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

### 3. Google Sheets Integration (Apps Script)
To enable automatic backups to Google Sheets:
1.  Create a new **Google Sheet**.
2.  Go to **Extensions > Apps Script**.
3.  Paste the following code into `Code.gs`:

```javascript
const SHEET_NAMES = {
  PURCHASE: "Purchases",
  SALE: "Sales", 
  CUSTOMER: "Customers",
  SUPPLIER: "Suppliers",
  PRODUCT: "Inventory"
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheetName = SHEET_NAMES[data.type] || "Logs";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);

    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      // Add Headers based on type
      if (data.type === 'SALE' || data.type === 'PURCHASE') {
        sheet.appendRow(["Date", "ID", "Party Name", "Phone", "Items", "Total", "Ref No"]);
      } else if (data.type === 'PRODUCT') {
        sheet.appendRow(["Name", "Category", "Stock", "Price", "Supplier"]);
      }
    }

    // Append Data
    if (data.type === 'SALE' || data.type === 'PURCHASE') {
      sheet.appendRow([
        data.date, 
        data.id, 
        data.partyName, 
        data.phone, 
        data.items, 
        data.total, 
        data.referenceNo
      ]);
    } else {
       // Generic fallback
       sheet.appendRow([new Date(), JSON.stringify(data)]);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
```
4.  **Deploy** as a Web App:
    *   Select **Execute as: Me**.
    *   Select **Who has access: Anyone**.
5.  Copy the **Deployment URL** and paste it into your `.env` file under `VITE_GOOGLE_SHEET_SCRIPT_URL`.

### 4. Run the App
```bash
npm run dev
```

---

## 👨‍💻 Developer

**Manas Arora**
*   **LinkedIn**: [aroramanas01](https://www.linkedin.com/in/aroramanas01/)
*   **GitHub**: [manas0x](https://github.com/manas0x)

---

## 📄 License

This project is open-source and available for personal and commercial use.
