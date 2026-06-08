import React, { useState, useEffect } from 'react'
import { pluginLoader } from './pluginLoader'
import { DiscountPlugin } from './plugins/discount.plugin'
import { PaymentPlugin } from './plugins/payment.plugin'
import { InventoryPlugin } from './plugins/inventory.plugin'
import { GoogleDrivePlugin } from './plugins/google_drive.plugin'
import { LoyaltyPlugin } from './plugins/loyalty.plugin'
import {
  LayoutDashboard,
  Receipt,
  Package,
  ShoppingCart,
  Users,
  BarChart3,
  Plus,
  Menu,
  ChefHat,
  X,
  LogOut,
  User,

  Truck,
  Bell,
  Check,
  Trash2,
  FileText,
  RotateCcw,
  AlertTriangle,
  Smartphone
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { auth, db } from './firebase'
import { signOut } from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { firestoreService } from './services/firestoreService'
import { showConfirm, showError, showSuccess } from './utils/alert'

// Register Plugins immediately for all sessions
pluginLoader.register('discount-engine', DiscountPlugin);
pluginLoader.register('payment-gateway', PaymentPlugin);
pluginLoader.register('inventory-sync', InventoryPlugin);
pluginLoader.register('google-drive', GoogleDrivePlugin);
pluginLoader.register('loyalty-program', LoyaltyPlugin);

// Removed unused auth/firestore imports for session check

import { useBusiness } from './context/BusinessContext'
import ThemeToggle from './components/ThemeToggle'
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const LiveOrders = React.lazy(() => import('./pages/LiveOrders'))
const Inventory = React.lazy(() => import('./pages/Inventory'))
const Billing = React.lazy(() => import('./pages/Billing'))
const Purchases = React.lazy(() => import('./pages/Purchases'))
const Customers = React.lazy(() => import('./pages/Customers'))
const Suppliers = React.lazy(() => import('./pages/Suppliers'))
const Reports = React.lazy(() => import('./pages/Reports'))
const InvoiceView = React.lazy(() => import('./pages/InvoiceView'))
// Login is small and critical, keep it eager or lazy is fine, keeping lazy for consistency
const Login = React.lazy(() => import('./pages/Login'))
const AdminSettings = React.lazy(() => import('./pages/AdminSettings'))
const GstReports = React.lazy(() => import('./pages/GstReports'))
const Cumulative = React.lazy(() => import('./pages/Cumulative'))
const DebugInvoices = React.lazy(() => import('./pages/DebugInvoices'))
const Returns = React.lazy(() => import('./pages/Returns'))
const InstallPage = React.lazy(() => import('./pages/InstallPage'))
const ShopPage = React.lazy(() => import('./pages/ShopPage'))

function App() {
  const business = useBusiness()
  const [isSetupComplete, setIsSetupComplete] = useState(localStorage.getItem('invoiceflow_setup') === 'true')
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  // Initialize activeTab from URL or default to 'billing'
  const [activeTab, setActiveTab] = useState(() => {
    const isFileScheme = window.location.protocol === 'file:';
    if (isFileScheme) {
      return 'billing';
    }
    const path = window.location.pathname;
    // Support new /public/invoices/ and legacy /invoices/ or /invoice/
    if (path.startsWith('/public/invoices/') || path.startsWith('/invoices/') || path.startsWith('/invoice/')) {
      return 'invoice';
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'billing';
  })
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  const [showLowStock, setShowLowStock] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [lowStockItems, setLowStockItems] = useState([])
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState("Notification" in window ? window.Notification.permission : 'default')
  const previousNotifLength = React.useRef(0)
  const isFirstLoad = React.useRef(true)

  // Theme State
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('theme') || 'emerald')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme)
    localStorage.setItem('theme', currentTheme)
  }, [currentTheme])

  const baseMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager'] },
    { id: 'live_orders', label: business.getTerm('orders'), icon: ChefHat, roles: ['admin', 'manager', 'waiter', 'kitchen'], businessTypes: ['restaurant'] },
    { id: 'billing', label: business.getTerm('billing'), icon: Plus, roles: ['admin', 'manager', 'cashier', 'waiter'] },
    { id: 'invoices', label: 'All Invoices', icon: Receipt, roles: ['admin', 'manager', 'cashier'] },
    { id: 'inventory', label: business.getTerm('inventory'), icon: Package, roles: ['admin', 'manager'] },
    { id: 'purchases', label: 'Purchase Entry', icon: ShoppingCart, roles: ['admin', 'manager'], businessTypes: ['retail', 'pharmacy', 'grocery', 'other'] },
    { id: 'suppliers', label: 'Suppliers', icon: Truck, roles: ['admin', 'manager'], businessTypes: ['retail', 'pharmacy', 'grocery', 'other'] },
    { id: 'customers', label: 'Customers', icon: Users, roles: ['admin', 'manager', 'cashier'] },
    { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'manager'] },
    { id: 'cumulative', label: 'Cumulative', icon: BarChart3, roles: ['admin'] },
    { id: 'gst-reports', label: 'GST Reports', icon: FileText, roles: ['admin'], businessTypes: ['retail', 'pharmacy', 'grocery', 'other'] },
    { id: 'returns', label: 'Returns', icon: RotateCcw, roles: ['admin', 'manager'], businessTypes: ['retail', 'pharmacy', 'grocery', 'other'] },
    { id: 'settings', label: 'Settings', icon: LayoutDashboard, roles: ['admin'] },
  ]

  const menuItems = baseMenuItems.filter(item => {
    if (role && !item.roles.includes(role)) return false;
    if (item.businessTypes && !item.businessTypes.includes(business.businessMode)) return false;
    return true;
  });

  if (business.integrations?.includes('self_ordering')) {
    menuItems.splice(2, 0, { id: 'storefront', label: 'Storefront / QR', icon: Smartphone, roles: ['admin'], isExternal: true, path: '/?tab=shop' });
  }

  if (business.integrations?.includes('kds')) {
    // KDS is often relevant for restaurants, but could be others. 
    // If not already in menuItems, add it or adjust logic.
    if (!menuItems.find(i => i.id === 'live_orders')) {
        menuItems.splice(1, 0, { id: 'live_orders', label: business.getTerm('kitchen'), icon: ChefHat, roles: ['admin', 'staff'] });
    }
  }

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await window.Notification.requestPermission();
      setPermissionStatus(permission);
    }
  }

  // Check Session on Mount
  useEffect(() => {
    const checkSession = () => {
      try {
        const storedUser = localStorage.getItem('invoiceflow_user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          // Check if session is valid (e.g. 2 days expiry)
          const now = new Date().getTime();
          const loginTime = parsedUser.loginTime || 0;
          const twoDays = 2 * 24 * 60 * 60 * 1000;

          if (now - loginTime < twoDays) {
            setUser(parsedUser);
            setRole(parsedUser.role);

            // If URL has no tab and is not an invoice view, enforce role-based default
            const params = new URLSearchParams(window.location.search);
            const path = window.location.pathname;
            const isInvoicePath = path.startsWith('/public/invoices/') || path.startsWith('/invoices/') || path.startsWith('/invoice/');

            if (!params.get('tab') && !isInvoicePath) {
              setActiveTab(parsedUser.role === 'admin' ? 'dashboard' : 'billing');
            }
          } else {
            localStorage.removeItem('invoiceflow_user');
          }
        }
      } catch (e) {
        console.error("Session parse error:", e);
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  // Low Stock Tracker (Admin Only)
  useEffect(() => {
    if (role === 'admin') {
      const unsub = firestoreService.subscribeProducts((products) => {
        const low = products.filter(p => Number(p.stock) < Number(p.minStock || 10));
        setLowStockItems(low);
      });
      return () => unsub();
    }
  }, [role]);

  // Plugin Initialization
  useEffect(() => {
    if (role) {
      pluginLoader.getAllPlugins().forEach(plugin => {
        if (plugin.enabled && plugin.hooks?.init) {
          // Pass the user context if it exists
          const context = {
            user: user,
            googleAccessToken: user?.googleAccessToken
          };

          plugin.hooks.init(plugin.settings, (newSettings) => {
            plugin.settings = newSettings;
            pluginLoader.saveStates();
          }, context);
        }
      });
    }
  }, [role, user]);

  useEffect(() => {
    let unsub = null;

    if (role === 'admin') {
      // 1. Check Permission on Mount (Web)
      if ("Notification" in window) {
        setPermissionStatus(window.Notification.permission);
      }

      // 2. Subscribe to Firestore Notifications (Realtime)
      unsub = firestoreService.subscribeNotifications((data) => {
        setNotifications(data);

        // Check for NEW notifications
        if (!isFirstLoad.current && data.length > 0) {
          const latest = data[0];
          if (!latest.read && data.length > previousNotifLength.current) {

            // Web Notification (Manual / Local Only)
            if ("Notification" in window && window.Notification.permission === "granted") {
              try {
                new window.Notification(latest.title, {
                  body: latest.message,
                  icon: '/icon-192x192.png'
                });
              } catch (e) {
                console.error("Web Notification Error:", e);
              }
            }

            // Sound Alert
            try {
              const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
              audio.volume = 1.0;
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                playPromise.catch(error => {
                  // Autoplay prevented
                });
              }
            } catch (e) {
              console.error("Audio Setup Error:", e);
            }

            // In-App Toast
            showSuccess(`🔔 ${latest.title}: ${latest.message}`);
          }
        }
        previousNotifLength.current = data.length;
        isFirstLoad.current = false;
      });
    }

    return () => {
      if (unsub) {
        unsub();
      }
    };
  }, [role]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const totalNotifCount = unreadCount + lowStockItems.length;

  const handleMarkRead = async (e, id) => {
    e.stopPropagation();
    await firestoreService.markNotificationAsRead(id);
  }

  const handleClearNotifs = async () => {
    await firestoreService.clearAllNotifications();
  }

  // Handle Browser Back Button
  useEffect(() => {
    const handlePopState = (event) => {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab')
      if (tabParam) {
        setActiveTab(tabParam)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      if (mobile) {
        setIsSidebarOpen(false)
      } else {
        setIsSidebarOpen(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Ignore if user is typing in an input (except for specific overrides like Ctrl+Space)
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

      // Ctrl + Space: Focus Search
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        // Determine active tab and focus corresponding search
        if (activeTab === 'billing') {
          document.getElementById('billing-search')?.focus();
        } else if (activeTab === 'purchases') {
          document.getElementById('purchase-search')?.focus();
        } else if (activeTab === 'inventory') {
          document.getElementById('inventory-search')?.focus();
        }
        return;
      }

      // Ctrl + P: Go to Purchases (User specific request override)
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (role === 'admin') {
          handleTabChange('purchases');
          showSuccess('Shortcut: Go to Purchases');
        }
        return;
      }

      if (isInput) return; // Don't trigger other shortcuts while typing

      // Navigation Shortcuts (Alt + Key)
      if (e.altKey) {
        let targetTab = '';
        switch (e.key.toLowerCase()) {
          case 'd': targetTab = 'dashboard'; break;
          case 'b': targetTab = 'billing'; break;
          case 'i': targetTab = 'inventory'; break;
          case 'p': targetTab = 'purchases'; break;
          case 's': targetTab = 'suppliers'; break;
          case 'c': targetTab = 'customers'; break;
          case 'r': targetTab = 'reports'; break;
        }

        if (targetTab) {
          e.preventDefault();
          // check role
          const menuItem = menuItems.find(i => i.id === targetTab);
          if (menuItem && menuItem.roles.includes(role)) {
            handleTabChange(targetTab);
          }
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeTab, role]);

  const filteredMenuItems = menuItems.filter(item => item.roles.includes(role))

  const handleLogout = () => {
    signOut(auth).catch(err => console.error("Sign out error:", err));
    localStorage.removeItem('invoiceflow_user')
    localStorage.removeItem('google_access_token')
    setUser(null)
    setRole(null)
    const isFileScheme = window.location.protocol === 'file:';
    if (!isFileScheme) {
      window.history.pushState({}, '', '/')
    }
  }

  const handleTabChange = (itemId) => {
    setActiveTab(itemId)
    setShowLowStock(false) // Clear filter when changing tabs

    const isFileScheme = window.location.protocol === 'file:';
    if (!isFileScheme) {
      try {
        const newUrl = new URL(window.location)
        newUrl.searchParams.set('tab', itemId)
        window.history.pushState({}, '', newUrl)
      } catch (e) {
        console.warn("Failed to update history state:", e)
      }
    }
    if (isMobile) setIsSidebarOpen(false)
  }



  const renderContent = () => {
    const integrations = business.integrations || []
    
    // Redirect logic for specific roles
    if (role === 'kitchen' && activeTab !== 'live_orders') {
        return <LiveOrders />
    }
    if (role === 'cashier' && !['billing', 'invoices', 'customers'].includes(activeTab)) {
        return <Billing setActiveTab={setActiveTab} />
    }

    switch (activeTab) {
      case 'dashboard': 
        if (['admin', 'manager'].includes(role)) return <Dashboard setActiveTab={setActiveTab} setShowLowStock={setShowLowStock} />
        return <Billing setActiveTab={setActiveTab} />
      case 'live_orders': 
        if (business.businessMode === 'restaurant' || integrations.includes('kds')) return <LiveOrders />
        return <Dashboard setActiveTab={setActiveTab} />
      case 'billing': return <Billing setActiveTab={setActiveTab} />
      case 'invoices': return <Billing initialHistory={true} setActiveTab={setActiveTab} />
      case 'inventory': 
        if (['admin', 'manager'].includes(role)) return <Inventory isStaff={role !== 'admin'} showLowStock={showLowStock} setShowLowStock={setShowLowStock} />
        return <Billing setActiveTab={setActiveTab} />
      case 'purchases': 
        if (['admin', 'manager'].includes(role) && (integrations.includes('inventory') || business.businessMode !== 'restaurant')) return <Purchases />
        return <Dashboard setActiveTab={setActiveTab} />
      case 'suppliers': 
        if (['admin', 'manager'].includes(role) && (integrations.includes('inventory') || business.businessMode !== 'restaurant')) return <Suppliers />
        return <Dashboard setActiveTab={setActiveTab} />
      case 'customers': return <Customers isStaff={role === 'cashier' || role === 'waiter'} />
      case 'reports': 
        if (['admin', 'manager'].includes(role)) return <Reports />
        return <Billing setActiveTab={setActiveTab} />
      case 'cumulative': 
        if (role === 'admin') return <Cumulative />
        return <Dashboard setActiveTab={setActiveTab} />
      case 'gst-reports': 
        if (role === 'admin') return <GstReports />
        return <Dashboard setActiveTab={setActiveTab} />
      case 'returns': 
        if (['admin', 'manager'].includes(role)) return <Returns />
        return <Dashboard setActiveTab={setActiveTab} />
      case 'settings': 
        if (role === 'admin') return <AdminSettings setActiveTab={setActiveTab} />
        return <Dashboard setActiveTab={setActiveTab} />
      case 'audit': 
        if (role === 'admin') return <DebugInvoices />
        return <Dashboard setActiveTab={setActiveTab} />
      case 'invoice': return <InvoiceView />
      default: 
        if (['admin', 'manager'].includes(role)) return <Dashboard setActiveTab={setActiveTab} />
        return <Billing setActiveTab={setActiveTab} />
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
      </div>
    )
  }

  if (!isSetupComplete && activeTab !== 'invoice') {
    return (
      <React.Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
        <InstallPage onComplete={() => setIsSetupComplete(true)} />
      </React.Suspense>
    )
  }

  if (!user && activeTab !== 'invoice' && activeTab !== 'shop') {
    return (
      <React.Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
        <Login onLogin={(u) => { setUser(u); setRole(u.role); setActiveTab(u.role === 'admin' ? 'dashboard' : 'billing'); }} />
      </React.Suspense>
    )
  }

  // Determine content for public/unauthenticated access or authenticated access
  const isPublicRoute = activeTab === 'invoice' || activeTab === 'shop';
  
  const shopEnabled = business.integrations?.includes('self_ordering');

  const content = isPublicRoute
    ? <React.Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
      {activeTab === 'invoice' ? <InvoiceView /> : (
          shopEnabled ? <ShopPage /> : <div className="flex h-screen items-center justify-center flex-col gap-4 text-center p-6">
              <AlertTriangle size={48} className="text-amber-500" />
              <h1 className="text-2xl font-bold">Feature Disabled</h1>
              <p className="text-gray-500 max-w-sm">This storefront has been disabled by the administrator or is not part of this business setup.</p>
              <button onClick={() => window.location.href = '/'} className="px-6 py-2 bg-primary text-white rounded-xl font-bold">Back to POS</button>
          </div>
      )}
    </React.Suspense>
    : (
      <div className="app-container">
        {/* Mobile Overlay */}
        {isMobile && isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 45 /* Just below sidebar */
            }}
          />
        )}

        {/* Sidebar */}
        <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', padding: '0 8px' }}>
              <div style={{
                background: 'white',
                minWidth: '40px',
                height: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Package size={24} color="var(--primary-dark)" />
              </div>
              {(isSidebarOpen || isMobile) && (
                <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>{business.appName}</h2>

                </div>
              )}
            </div>

            {/* Nav Menu */}
            <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredMenuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => item.isExternal ? window.open(item.path, '_blank') : handleTabChange(item.id)}
                  className={`sidebar-nav-btn ${(!item.isExternal && activeTab === item.id) ? 'active' : ''}`}
                >
                  <item.icon size={20} style={{ minWidth: '20px' }} />
                  {(isSidebarOpen || isMobile) && <span>{item.label}</span>}
                  {activeTab === item.id && (
                    <motion.div
                      layoutId="active-indicator"
                      style={{
                        position: 'absolute',
                        left: '-16px',
                        width: '4px',
                        height: '24px',
                        background: 'var(--accent)',
                        borderRadius: '0 4px 4px 0'
                      }}
                    />
                  )}
                </button>
              ))}
            </nav>

            {/* Footer / User Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>

              {/* User Profile Box */}
              <div style={{
                padding: '12px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '8px',
                overflow: 'hidden'
              }}>
                <div style={{ background: 'var(--primary)', padding: '6px', borderRadius: '50%', minWidth: '28px' }}>
                  <User size={16} />
                </div>
                {(isSidebarOpen || isMobile) && (
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>{role === 'admin' ? 'Administrator' : 'Shop Staff'}</p>
                    <p style={{ fontSize: '11px', margin: 0, opacity: 0.6 }}>{user.username}</p>
                  </div>
                )}
              </div>




              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="btn-logout mb-2"
              >
                <LogOut size={20} style={{ minWidth: '20px' }} />
                {(isSidebarOpen || isMobile) && <span>Logout</span>}
              </button>

              {/* Theme Toggle */}
              <div className="px-2 pb-2">
                <ThemeToggle
                  currentTheme={currentTheme}
                  onThemeChange={setCurrentTheme}
                  isCollapsed={!isSidebarOpen && !isMobile}
                />
              </div>

              {/* Developer Credit */}
              {(isSidebarOpen || isMobile) && (
                <div className="text-[10px] text-center text-white/30 mt-2 font-medium">
                  <p>Developed by Manas Arora</p>
                  <a href="https://manas0x.site" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">manas0x.site</a>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`main-content ${isSidebarOpen ? 'expanded' : 'collapsed'}`}>
          {!isMobile && (
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{
                position: 'fixed',
                top: '20px',
                left: isSidebarOpen ? '260px' : '60px', /* Dynamic positioning */
                zIndex: 60,
                background: 'white',
                border: '1px solid var(--border)',
                borderRadius: '50%',
                width: '32px', height: '32px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                transition: 'left 0.3s ease',
                cursor: 'pointer'
              }}
            >
              {isSidebarOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          )}

          <header className="page-header mb-8 flex justify-between items-center md:hidden">
            {/* Mobile Notification Bell & Brand */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-3 bg-surface border border-border rounded-xl flex items-center justify-center shadow-sm"
              >
                <Menu size={20} style={{ color: 'var(--text-main)' }} />
              </button>
              <div>
                <h2 className="text-xl font-bold leading-none" style={{ color: 'var(--text-main)' }}>{business.appName}</h2>

              </div>
            </div>
            {role === 'admin' && (
              <div className="relative">
                <button
                  onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                  className="p-3 bg-surface border border-border rounded-full relative shadow-sm"
                >
                  <Bell size={20} style={{ color: 'var(--text-main)' }} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-surface animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                  {unreadCount === 0 && lowStockItems.length > 0 && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-amber-500 rounded-full border-2 border-surface"></span>
                  )}
                </button>
                {/* Mobile Dropdown */}
                {showNotifDropdown && (
                  <>
                    <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowNotifDropdown(false)} />
                    <div className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-2xl border z-50 overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                      <div className="p-3 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                        <h3 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Notifications</h3>
                        {notifications.length > 0 && (
                          <button onClick={handleClearNotifs} className="text-xs text-red-500 font-bold flex items-center gap-1">
                            <Trash2 size={12} /> Clear
                          </button>
                        )}
                      </div>
                      <div className="max-h-[350px] overflow-y-auto">
                        {/* Low Stock Section */}
                        {lowStockItems.length > 0 && (
                          <div className="p-2 bg-amber-50">
                            <p className="text-[10px] font-black uppercase text-amber-600 px-2 flex items-center gap-1.5 mb-1">
                              <AlertTriangle size={10} /> Low Stock Alerts ({lowStockItems.length})
                            </p>
                            {lowStockItems.map(p => (
                              <div key={p.id} className="p-2 mb-1 bg-white rounded-lg border border-amber-100 shadow-sm flex justify-between items-center" onClick={() => setActiveTab('inventory')}>
                                <div>
                                  <p className="text-xs font-bold text-gray-800">{p.name}</p>
                                  <p className="text-[10px] text-amber-600 font-bold">Stock: {Number(p.stock).toFixed(2)} {p.unit}</p>
                                </div>
                                <div className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">Action Needed</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {notifications.length === 0 && lowStockItems.length === 0 ? (
                          <div className="p-8 text-center text-gray-400 text-sm">No new notifications</div>
                        ) : (
                          <>
                            {notifications.length > 0 && (
                              <p className="text-[10px] font-black uppercase text-gray-400 px-4 py-2 bg-gray-50 border-y border-border">System Messages</p>
                            )}
                            {notifications.map(n => (
                              <div key={n.id} className={`p-3 border-b transition-colors ${!n.read ? 'bg-primary/5' : ''}`} style={{ borderColor: 'var(--border)' }}>
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1">
                                    <p className={`text-xs ${!n.read ? 'font-black text-primary' : 'font-medium text-gray-600'}`}>
                                      {!n.read && <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full mr-1.5 mb-0.5" />}
                                      {n.title}
                                    </p>
                                    <p className={`text-xs mt-0.5 ${!n.read ? 'text-gray-900 font-semibold' : 'text-gray-500'}`}>{n.message}</p>
                                    <p className="text-[10px] mt-1 font-bold text-gray-400">{new Date(n.createdAt).toLocaleString()}</p>
                                  </div>
                                  {!n.read && (
                                    <button onClick={(e) => handleMarkRead(e, n.id)} className="text-primary bg-primary/10 p-1.5 rounded-full shadow-sm" title="Mark Read">
                                      <Check size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </header>

          {/* Desktop Header Title */}
          <div className="hidden md:flex justify-between items-end mb-8 border-b border-gray-100 pb-4">
            <div>
              <h1 className="text-3xl font-bold" style={{ color: 'var(--text-main)' }}>
                {menuItems.find(i => i.id === activeTab)?.label}
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Welcome back, {user.username}
              </p>
            </div>
            <div className="text-right flex items-center gap-4">


              {/* Desktop Notification Bell */}
              {role === 'admin' && (
                <div className="flex items-center gap-3">
                  {permissionStatus === 'default' && (
                    <button
                      onClick={requestNotificationPermission}
                      className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full font-bold border border-blue-200 hover:bg-blue-100 transition-colors animate-pulse"
                    >
                      Enable Alerts
                    </button>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                      className={`p-3 rounded-full relative transition-all ${showNotifDropdown ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'}`}
                    >
                      <Bell size={20} />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                          {unreadCount}
                        </span>
                      )}
                      {unreadCount === 0 && lowStockItems.length > 0 && (
                        <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-amber-500 rounded-full border-2 border-white shadow-sm"></span>
                      )}
                    </button>

                    {/* Desktop Dropdown */}
                    {showNotifDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowNotifDropdown(false)} />
                        <div className="absolute right-0 top-full mt-4 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 backdrop-blur-sm">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                              <Bell size={16} className="text-primary" /> Notifications
                            </h3>
                            {notifications.length > 0 && (
                              <button onClick={handleClearNotifs} className="text-xs text-red-500 font-bold flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded">
                                <Trash2 size={12} /> Clear All
                              </button>
                            )}
                          </div>
                          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                            {/* Low Stock Alerts Section */}
                            {lowStockItems.length > 0 && (
                              <div className="bg-amber-50/50 p-2">
                                <p className="text-[10px] font-black uppercase text-amber-600 px-3 py-1 flex items-center gap-2">
                                  <AlertTriangle size={12} /> Low Stock Alerts ({lowStockItems.length})
                                </p>
                                <div className="grid grid-cols-1 gap-1">
                                  {lowStockItems.map(p => (
                                    <div
                                      key={p.id}
                                      className="p-3 bg-white rounded-xl border border-amber-100 hover:border-amber-300 shadow-sm cursor-pointer transition-all flex justify-between items-center group"
                                      onClick={() => { setActiveTab('inventory'); setShowNotifDropdown(false); }}
                                    >
                                      <div>
                                        <p className="text-xs font-bold text-gray-800">{p.name}</p>
                                        <p className="text-[10px] text-amber-600 font-bold mt-0.5">Stock Level: <span className="text-red-500">{Number(p.stock).toFixed(2)}</span> / Min: {p.minStock || 10} {p.unit}</p>
                                      </div>
                                      <div className="text-[10px] bg-amber-100 group-hover:bg-amber-600 group-hover:text-white transition-colors text-amber-700 px-2 py-1 rounded-lg font-bold">Update Stock</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {notifications.length === 0 && lowStockItems.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                                  <Bell size={24} className="text-gray-400" />
                                </div>
                                <p className="text-gray-500 font-medium text-sm">No new notifications</p>
                                <p className="text-gray-400 text-xs mt-1">Everything looks good for now</p>
                              </div>
                            ) : (
                              <>
                                {notifications.length > 0 && (
                                  <p className="text-[10px] font-black uppercase text-gray-400 px-4 py-2 bg-gray-50 border-y border-gray-100">Recent Messages</p>
                                )}
                                {notifications.map(n => (
                                  <div key={n.id} className={`p-4 border-b border-gray-50 hover:bg-gray-50/80 transition-colors group ${!n.read ? 'bg-primary/5' : ''}`}>
                                    <div className="flex justify-between items-start gap-3">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className={`w-2 h-2 rounded-full ${!n.read ? 'bg-primary' : 'bg-gray-300'}`}></span>
                                          <p className={`text-sm ${!n.read ? 'font-black text-gray-900' : 'font-medium text-gray-600'}`}>{n.title}</p>
                                        </div>
                                        <p className={`text-xs leading-relaxed pl-4 ${!n.read ? 'text-gray-950 font-semibold' : 'text-gray-500'}`}>{n.message}</p>
                                        <p className="text-[10px] text-gray-400 mt-2 pl-4 font-bold uppercase tracking-tight">{new Date(n.createdAt).toLocaleString()}</p>
                                      </div>
                                      {!n.read && (
                                        <button onClick={(e) => handleMarkRead(e, n.id)} className="text-primary hover:bg-primary/20 p-2 rounded-lg show-on-hover transition-all bg-primary/5" title="Mark as Read">
                                          <Check size={16} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="text-right">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Today</div>
                <div className="text-lg font-bold text-primary">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Suspense Wrapper for Lazy Loaded Components */}
              <React.Suspense fallback={
                <div className="flex h-64 items-center justify-center">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              }>
                {renderContent()}
              </React.Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

      </div>
    )

  return content
}

export default App
