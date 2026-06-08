const fs = require('fs');
const path = require('path');

// 1. Modify CheckoutPage.jsx
const checkoutPath = path.join(__dirname, 'shop/src/pages/CheckoutPage.jsx');
let checkoutContent = fs.readFileSync(checkoutPath, 'utf8');

checkoutContent = checkoutContent.replace('export default function CheckoutPage({ onBack }) {', 
`export default function CheckoutPage({ onBack }) {
  const params = new URLSearchParams(window.location.search);
  const tableId = params.get('tab') || params.get('table');`);

checkoutContent = checkoutContent.replace('if (!form.name.trim() || !form.phone.trim()) {', 
`if (!tableId && (!form.name.trim() || !form.phone.trim())) {`);

checkoutContent = checkoutContent.replace(/if \(!\/\\d\{10\}\$\/\.test\(form\.phone\.replace\(\/\\s\/g, ''\)\)\) \{[\s\S]*?return\n    \}/, 
`if (!tableId && !/^\\d{10}$/.test(form.phone.replace(/\\s/g, ''))) {
      toast('Enter a valid 10-digit phone number', 'error'); return
    }`);

checkoutContent = checkoutContent.replace(/const ref = await placeOrder\(\{[\s\S]*?paymentMode: 'COD',\n      \}\)/,
`const ref = await placeOrder({
        customerName: tableId ? \`Table \${tableId}\` : form.name.trim(),
        customerPhone: form.phone.trim(),
        address: tableId ? \`Table \${tableId}\` : form.address.trim(),
        note: form.note.trim(),
        tableId: tableId || null,
        type: tableId ? 'table_order' : 'delivery',
        status: 'pending',
        items: items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, unit: i.unit })),
        totalAmount: total,
        paymentMode: tableId ? 'Pay at Counter' : 'COD',
      })`);

checkoutContent = checkoutContent.replace('<div className="success-note">',
`{tableId ? (
          <div className="success-note" style={{background:'var(--green)', color:'white'}}>
            <strong>Note:</strong> Your order has been sent to the kitchen. Please pay at the counter after eating.
          </div>
        ) : (
          <div className="success-note">
            <strong>Note:</strong> Payment will be collected at delivery (Cash on Delivery).
          </div>
        )}
        <div className="hidden" style={{display:'none'}}>`);

checkoutContent = checkoutContent.replace('</div>\n        <button className="btn-primary" style={{marginTop:\'1.5rem\'}} onClick={onBack}>',
`</div>\n        <button className="btn-primary" style={{marginTop:'1.5rem'}} onClick={onBack}>`);

checkoutContent = checkoutContent.replace('<h2>Delivery Details</h2>',
`{tableId ? <h2>Dining at Table {tableId}</h2> : <h2>Delivery Details</h2>}`);

checkoutContent = checkoutContent.replace(/<form onSubmit=\{handleSubmit\} className="form-fields">([\s\S]*?)<div className="cod-badge">/,
`<form onSubmit={handleSubmit} className="form-fields">
              {!tableId && (
                <>
                  <label className="field">
                    <span><User size={15}/> Full Name *</span>
                    <input placeholder="Your name" value={form.name} onChange={e => set('name', e.target.value)} required />
                  </label>
                  <label className="field">
                    <span><Phone size={15}/> Phone Number *</span>
                    <input placeholder="10-digit mobile number" value={form.phone} onChange={e => set('phone', e.target.value)} required maxLength={10} type="tel"/>
                  </label>
                  <label className="field">
                    <span><MapPin size={15}/> Delivery Address</span>
                    <textarea placeholder="Village / Town, District…" value={form.address} onChange={e => set('address', e.target.value)} rows={3}/>
                  </label>
                </>
              )}
              <label className="field">
                <span>Special Note (optional)</span>
                <textarea placeholder="Any specific instructions (e.g., less spicy)…" value={form.note} onChange={e => set('note', e.target.value)} rows={2}/>
              </label>

              <div className="cod-badge">`);

checkoutContent = checkoutContent.replace('💵 Cash on Delivery — pay when you receive',
`{tableId ? '🛎️ Sending order directly to kitchen' : '💵 Cash on Delivery — pay when you receive'}`);

checkoutContent = checkoutContent.replace('Place Order —', '{tableId ? "Send Order to Kitchen" : "Place Order"} —');

fs.writeFileSync(checkoutPath, checkoutContent, 'utf8');
console.log("Updated CheckoutPage.jsx");

// 2. Modify shopService.js (optional, it just adds to orders collection, we can just use `orders`)
const servicePath = path.join(__dirname, 'shop/src/services/shopService.js');
let serviceContent = fs.readFileSync(servicePath, 'utf8');
serviceContent = serviceContent.replace('paymentMode: order.paymentMode,', "paymentMode: order.paymentMode,\n    tableId: order.tableId || null,\n    type: order.type || 'delivery',\n    status: order.status || 'pending',");
fs.writeFileSync(servicePath, serviceContent, 'utf8');
console.log("Updated shopService.js");

