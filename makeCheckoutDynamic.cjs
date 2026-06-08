const fs = require('fs');

// 1. Update appConfig.js
let config = fs.readFileSync('src/config/appConfig.js', 'utf8');
config = config.replace('storeType: parsed.storeType || "General Store",', 'storeType: parsed.storeType || "General Store",\n                businessMode: parsed.businessMode || "retail",');
config = config.replace('storeType: "General Store",', 'storeType: "General Store",\n        businessMode: "retail",');
fs.writeFileSync('src/config/appConfig.js', config);

// 2. Update InstallPage.jsx
let install = fs.readFileSync('src/pages/InstallPage.jsx', 'utf8');
// Fix the weird newline artifact from previous replace
install = install.replace("ownerName: '',\\n        storeType: 'General Store',", "ownerName: '',\n        storeType: 'General Store',\n        businessMode: 'retail',");
install = install.replace("ownerName: formData.ownerName,\\n                storeType: formData.storeType,", "ownerName: formData.ownerName,\n                storeType: formData.storeType,\n                businessMode: formData.businessMode,");
install = install.replace('ownerName: \'\',\\n        storeType: \'General Store\',', "ownerName: '',\n        storeType: 'General Store',\n        businessMode: 'retail',");
install = install.replace('ownerName: formData.ownerName,\\n                storeType: formData.storeType,', "ownerName: formData.ownerName,\n                storeType: formData.storeType,\n                businessMode: formData.businessMode,");

install = install.replace(
`                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Owner Name</label>
                                    <input required type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} placeholder="John Doe" className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-[var(--text-main)]" />
                                </div>`,
`                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Business Mode</label>
                                    <select required name="businessMode" value={formData.businessMode} onChange={handleChange} className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-[var(--text-main)]">
                                        <option value="retail">General Retail / Shop</option>
                                        <option value="restaurant">Restaurant / Cafe</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Owner Name</label>
                                    <input required type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} placeholder="John Doe" className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-[var(--text-main)]" />
                                </div>`
);
fs.writeFileSync('src/pages/InstallPage.jsx', install);

// 3. Update CheckoutPage.jsx
let checkout = fs.readFileSync('shop/src/pages/CheckoutPage.jsx', 'utf8');
checkout = checkout.replace("import { CheckCircle, ArrowLeft, User, Phone, MapPin, Loader } from 'lucide-react'", "import { CheckCircle, ArrowLeft, User, Phone, MapPin, Loader } from 'lucide-react'\nimport { appConfig } from '../../../src/config/appConfig'");
checkout = checkout.replace("{tableId ? <h2>Dining at Table {tableId}</h2> : <h2>Delivery Details</h2>}", "{tableId ? <h2>{appConfig.businessMode === 'restaurant' ? `Dining at Table ${tableId}` : `Ordering at Counter/Kiosk ${tableId}`}</h2> : <h2>Delivery Details</h2>}");
checkout = checkout.replace("placeholder=\"Any specific instructions (e.g., less spicy)…\"", "placeholder={appConfig.businessMode === 'restaurant' ? 'Any specific instructions (e.g., less spicy)…' : 'Any specific instructions…'}");
checkout = checkout.replace("{tableId ? '🛎️ Sending order directly to kitchen' : '💵 Cash on Delivery — pay when you receive'}", "{tableId ? (appConfig.businessMode === 'restaurant' ? '🛎️ Sending order directly to kitchen' : '🛎️ Sending order directly to counter') : '💵 Cash on Delivery — pay when you receive'}");
checkout = checkout.replace('{tableId ? "Send Order to Kitchen" : "Place Order"}', '{tableId ? (appConfig.businessMode === "restaurant" ? "Send Order to Kitchen" : "Send Order to Counter") : "Place Order"}');
checkout = checkout.replace('Your order has been sent to the kitchen', '{appConfig.businessMode === "restaurant" ? "Your order has been sent to the kitchen" : "Your order has been sent to the counter"}');
fs.writeFileSync('shop/src/pages/CheckoutPage.jsx', checkout);

// 4. Update LiveOrders.jsx
let liveOrders = fs.readFileSync('src/pages/LiveOrders.jsx', 'utf8');
liveOrders = liveOrders.replace("import { appConfig } from '../config/appConfig'", ""); // Prevent dupes if rerun
liveOrders = liveOrders.replace("import { showSuccess, showError } from '../utils/alert';", "import { showSuccess, showError } from '../utils/alert';\nimport { appConfig } from '../config/appConfig';");
liveOrders = liveOrders.replace("Live Orders (KDS)", "{appConfig.businessMode === 'restaurant' ? 'Live Orders (KDS)' : 'Live Orders (Counter)'}");
fs.writeFileSync('src/pages/LiveOrders.jsx', liveOrders);

console.log("Done");
