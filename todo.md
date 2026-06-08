# Adaptive Business Management Platform - Todo List

## Phase 1: Core Architecture & Setup
- [x] Create Terminology Utility (`src/utils/terminology.js`)
- [x] Refactor App Configuration to support business context (`src/config/appConfig.js`)
- [x] Refactor Installation Wizard (`src/pages/InstallPage.jsx`)
    - [x] Add missing business details (GST, Currency, Timezone)
    - [x] Implement strict business-type specific module suggestions
    - [x] Ensure theme selection is globally applied immediately
- [x] Centralize Business Context State (Sync Firestore settings with local app state)

## Phase 2: Dynamic UI & Terminology
- [x] Update Navigation in `App.jsx` to use context-aware labels (via `appConfig.getTerm`)
- [x] Filter Sidebar Menu strictly by `businessMode` and `activeIntegrations`
- [x] Implement industry-specific dashboards (`src/pages/Dashboard.jsx`)
- [x] Adaptive Dynamic Categories (Auto-suggest based on business type in `Inventory.jsx`)

## Phase 3: Module & Route Protection
- [x] Implement Route Guarding based on feature flags (`activeIntegrations`)
- [x] Secure `/shop` route and disable if QR ordering is not active
- [x] Refine Role-Based Access Control (RBAC) across all pages

## Phase 4: Storefront Adaptation
- [x] Customize `/shop` (Storefront) experience for different business types
- [x] Ensure "No Login" flow for QR ordering in Restaurant mode
- [x] Implement module protection logic on storefront APIs/Views

## Phase 5: Polish & Consistency
- [x] Ensure 100% theme consistency across all pages (Billing, Dashboard, Shop, etc.)
- [x] Add industry-specific terminology to Reports (`src/pages/Reports.jsx`)
- [x] Final validation of the "WordPress-like" installation flow

## Phase 6: Advanced Adaptation & Deep RBAC
- [x] Granular RBAC (Manager, Cashier, Waiter, Kitchen roles)
- [x] Industry-specific Inventory Fields (Barcode for Retail, Batch/Expiry for Pharmacy)
- [x] Barcode Scanning & Batch Search in Billing
- [x] Swiggy/Zomato Mock Integration logic
- [x] Prescription Support (File Upload in Billing/Shop) for Pharmacy

## Phase 0: Foundation (Highest Priority)

### Business Context Engine
- [x] Create a centralized Business Context System
- [x] Store business type globally
- [x] Store active modules globally
- [x] Store theme globally
- [x] Store terminology globally
- [x] Create context hooks for all pages (Refactor to use Context API instead of just `appConfig` import where appropriate)

### Installation Completion Logic
- [x] Block application access until installation is completed
- [x] Redirect all routes to installation wizard if setup is incomplete
- [x] Save installation configuration permanently

### Global Configuration Structure
- [x] Create unified configuration model

---

## Phase 1: Dynamic Application Generator

### Context-Aware Navigation
- [x] Build navigation from business context
- [x] Remove hardcoded sidebar items
- [x] Generate menus dynamically

### Context-Aware Routing
- [x] Dynamically register routes
- [x] Hide inaccessible routes
- [x] Protect disabled modules

---

## Phase 2: Terminology Engine

### Dynamic Labels
- [x] Create terminology dictionary
- [x] Replace hardcoded labels
- [x] Apply terminology globally

---

## Phase 3: Dashboard Generator
- [x] Restaurant Dashboard (Live Orders, Revenue)
- [x] Retail Dashboard (Sales, Inventory Alerts)
- [x] Medical Dashboard (Expiring Medicines, Low Stock)

---

## Phase 4: Category Intelligence
- [x] Auto-generate default categories
- [x] Allow customization
- [x] Allow category templates

---

## Phase 5: Storefront Engine
- [x] Public Storefront (`/shop`)
- [x] No login required for QR ordering
- [x] Dynamic business adaptation
- [x] Module Protection (Disable if integration inactive)

---

## Phase 6: Feature Flag System
- [x] Module Manager (Integration toggle)
- [x] Disabled modules disappear from UI
- [x] Disabled routes become inaccessible

---

## Phase 7: Theme Engine
- [x] Global Theme Control
- [x] Installation theme becomes system theme
- [x] Dashboard, Billing, Storefront, KDS follow theme
- [x] Theme updates apply instantly

---

## Phase 8: RBAC Security
- [x] Admin/Manager/Cashier/Waiter/Kitchen roles
- [x] Frontend protection
- [x] Route protection

---

## Phase 9: PetPooja-Level Restaurant Experience
- [x] Live Orders / KDS
- [x] Table Management
- [x] Online Delivery Integrations (Mocks)
- [x] Kitchen Workflow Tracking (Pending -> Preparing -> Ready)

---

## Phase 10: Future Platform Vision
- [x] Support Restaurant, Grocery, Pharmacy, Retail
- [x] One Codebase, Single Unified Platform
- [x] Electronics, Fashion, Service ERP templates (Next)
