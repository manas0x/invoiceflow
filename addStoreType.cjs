const fs = require('fs');

let install = fs.readFileSync('src/pages/InstallPage.jsx', 'utf8');
install = install.replace("ownerName: '',", "ownerName: '',\\n        storeType: 'General Store',");
install = install.replace("ownerName: formData.ownerName,", "ownerName: formData.ownerName,\\n                storeType: formData.storeType,");
install = install.replace(
`                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Business Name</label>
                                    <input required type="text" name="shopName" value={formData.shopName} onChange={handleChange} placeholder="Supermart" className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-[var(--text-main)]" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Owner Name</label>
                                    <input required type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} placeholder="John Doe" className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-[var(--text-main)]" />
                                </div>`,
`                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Business Name</label>
                                    <input required type="text" name="shopName" value={formData.shopName} onChange={handleChange} placeholder="Supermart" className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-[var(--text-main)]" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Store Type / Tagline</label>
                                    <input required type="text" name="storeType" value={formData.storeType} onChange={handleChange} placeholder="Restaurant / Agricultural Store" className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-[var(--text-main)]" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Owner Name</label>
                                    <input required type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} placeholder="John Doe" className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-[var(--text-main)]" />
                                </div>`
);
fs.writeFileSync('src/pages/InstallPage.jsx', install);

let shop = fs.readFileSync('shop/src/pages/ShopPage.jsx', 'utf8');
shop = shop.replace("{tableId ? `🛎️ Ordering for Table ${tableId}` : 'Welcome to our online store'}", 
"{tableId ? `🛎️ Ordering for Table ${tableId}` : (appConfig.storeType || 'Welcome to our online store')}");
fs.writeFileSync('shop/src/pages/ShopPage.jsx', shop);

console.log("Done");
