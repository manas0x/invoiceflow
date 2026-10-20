import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getCachedStoreName, getCachedStoreProfile } from '../config/storeConfig'
import { getInvoiceTemplateSettings } from '../config/invoiceTemplateConfig'

let retailFontPromise

const loadRetailUnicodeFonts = () => {
    if (!retailFontPromise) {
        const toBase64 = async (url) => {
            const bytes = new Uint8Array(await fetch(url).then(response => response.arrayBuffer()))
            let binary = ''
            for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
            return btoa(binary)
        }
        retailFontPromise = Promise.all([
            toBase64('/fonts/NotoSans-Regular.ttf'),
            toBase64('/fonts/NotoSans-Bold.ttf')
        ])
    }
    return retailFontPromise
}

const resolveStoreName = (record, templateSettings = getInvoiceTemplateSettings()) =>
    record?.storeName?.trim() || templateSettings.sellerName?.trim() || getCachedStoreName()

export const generateInvoicePDF = (invoice) => {
    const templateSettings = getInvoiceTemplateSettings()
    if (templateSettings.template === 'retail') {
        return generateRetailInvoicePDF(invoice, templateSettings)
    }
    return generateClassicInvoicePDF(invoice, templateSettings)
}

export const createInvoicePDFBlob = async (invoice) => {
    const templateSettings = getInvoiceTemplateSettings()
    if (templateSettings.template === 'retail') {
        return generateRetailInvoicePDF(invoice, templateSettings, true)
    }
    return generateClassicInvoicePDF(invoice, templateSettings, true)
}

const generateClassicInvoicePDF = (invoice, templateSettings, returnBlob = false) => {
    const doc = new jsPDF()
    const storeName = resolveStoreName(invoice, templateSettings)

    // Header - Shop Details
    doc.setFontSize(22)
    doc.setTextColor(45, 106, 79)
    doc.setFont(undefined, 'bold')
    doc.text(doc.splitTextToSize(storeName, 170), 105, 20, { align: 'center' })

    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.setFont(undefined, 'normal')
    doc.text(templateSettings.sellerTagline, 105, 28, { align: 'center' })
    doc.text(templateSettings.sellerAddress, 105, 33, { align: 'center' })
    doc.text(`Phone: ${templateSettings.sellerPhone}`, 105, 38, { align: 'center' })
    if (templateSettings.sellerGstin) {
        doc.text(`GSTIN: ${templateSettings.sellerGstin}`, 105, 43, { align: 'center' })
    }

    doc.setDrawColor(45, 106, 79)
    doc.setLineWidth(0.5)
    doc.line(20, templateSettings.sellerGstin ? 47 : 42, 190, templateSettings.sellerGstin ? 47 : 42)

    // Invoice Info & Customer Details
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.setFont(undefined, 'bold')
    doc.text(`Invoice No: ${invoice.id}`, 20, 52)
    doc.text(`Date: ${new Date(invoice.date).toLocaleDateString('en-IN')}`, 145, 52)

    doc.setFontSize(12)
    doc.text('BILL TO:', 20, 65)
    doc.setFontSize(11)
    doc.setFont(undefined, 'normal')

    let currentY = 72
    doc.text(`Customer Name: ${invoice.customerName || 'N/A'}`, 20, currentY)

    if (invoice.customerPhone && invoice.customerPhone.toString().trim() !== '') {
        currentY += 6
        doc.text(`Phone: ${invoice.customerPhone}`, 20, currentY)
    }

    if (invoice.customerAddress && invoice.customerAddress.toString().trim() !== '') {
        currentY += 6
        doc.text(`Address: ${invoice.customerAddress}`, 20, currentY)
    }

    // Table
    const tableData = (invoice.items || []).map((item, i) => {
        const totalIncl = item.price * item.quantity
        const rateExcl = item.price / (1 + (item.gst / 100))
        const totalBase = rateExcl * item.quantity
        const totalGST = totalIncl - totalBase

        return [
            i + 1,
            item.name,
            `${item.quantity} ${item.unit || ''}`,
            `Rs. ${rateExcl.toFixed(2)}`,
            `${item.gst}%`,
            `Rs. ${totalGST.toFixed(2)}`,
            `Rs. ${totalIncl.toFixed(2)}`
        ]
    })

    autoTable(doc, {
        head: [['#', 'Item Name', 'Qty', 'Rate (Excl)', 'GST %', 'GST Amt', 'Total']],
        body: tableData,
        startY: currentY + 10,
        theme: 'grid',
        headStyles: {
            fillColor: [45, 106, 79],
            textColor: [255, 255, 255],
            fontSize: 9, // Slightly smaller to fit columns
            halign: 'center'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { cellWidth: 60 },
            2: { halign: 'center', cellWidth: 20 },
            3: { halign: 'right', cellWidth: 25 },
            4: { halign: 'center', cellWidth: 15 },
            5: { halign: 'right', cellWidth: 25 },
            6: { halign: 'right', cellWidth: 25 }
        },
        styles: { fontSize: 9, cellPadding: 3 },
        margin: { top: 85, left: 15, right: 15 }
    })

    const finalY = doc.lastAutoTable.finalY + 10

    // Calculations (Tax Inclusive logic)
    const summaryTotals = (invoice.items || []).reduce((acc, item) => {
        const total = item.price * item.quantity
        const base = total / (1 + (item.gst / 100))
        const gst = total - base
        return {
            subtotal: acc.subtotal + base,
            gst: acc.gst + gst,
            total: acc.total + total
        }
    }, { subtotal: 0, gst: 0, total: 0 })

    // Totals Panel
    doc.setFillColor(248, 250, 252)
    doc.rect(130, finalY - 5, 65, 45, 'F')

    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.text(`Subtotal (Excl. Tax):`, 125, finalY + 5)
    doc.text(`Rs. ${summaryTotals.subtotal.toFixed(2)}`, 190, finalY + 5, { align: 'right' })

    doc.text(`Total GST Content:`, 125, finalY + 12)
    doc.text(`Rs. ${summaryTotals.gst.toFixed(2)}`, 190, finalY + 12, { align: 'right' })

    if (invoice.discount > 0) {
        doc.text(`Discount:`, 125, finalY + 19)
        doc.setTextColor(220, 38, 38)
        doc.text(`-Rs. ${Number(invoice.discount).toFixed(2)}`, 190, finalY + 19, { align: 'right' })
        doc.setTextColor(80, 80, 80)
    }

    doc.setDrawColor(200, 200, 200)
    doc.line(125, finalY + 23, 190, finalY + 23)

    doc.setFontSize(13)
    doc.setTextColor(45, 106, 79)
    doc.setFont(undefined, 'bold')
    doc.text(`Grand Total:`, 135, finalY + 31)
    doc.text(`Rs. ${Number(summaryTotals.total - invoice.discount).toFixed(2)}`, 190, finalY + 31, { align: 'right' })

    // Footer
    doc.setFontSize(9)
    doc.setTextColor(150, 150, 150)
    doc.setFont(undefined, 'italic')
    doc.text('This is a computer generated invoice.', 105, 280, { align: 'center' })
    doc.text(`Thank you for visiting ${storeName}`, 105, 285, { align: 'center' })
    doc.text('Visit Again!', 105, 290, { align: 'center' })

    const pdfBlob = doc.output('blob')
    if (returnBlob) return pdfBlob

    // Open PDF in new tab (Preview Mode) instead of downloading
    const pdfUrl = URL.createObjectURL(pdfBlob)
    window.open(pdfUrl, '_blank')
}

const numberToIndianWords = (number) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    const underThousand = (value) => {
        if (value < 20) return ones[value]
        if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ''}`
        return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${underThousand(value % 100)}` : ''}`
    }
    const whole = Math.floor(Number(number) || 0)
    const paise = Math.round(((Number(number) || 0) - whole) * 100)
    const parts = []
    if (Math.floor(whole / 10000000)) parts.push(`${underThousand(Math.floor(whole / 10000000))} Crore`)
    const lakh = Math.floor((whole % 10000000) / 100000)
    if (lakh) parts.push(`${underThousand(lakh)} Lakh`)
    const thousand = Math.floor((whole % 100000) / 1000)
    if (thousand) parts.push(`${underThousand(thousand)} Thousand`)
    const remainder = whole % 1000
    if (remainder) parts.push(underThousand(remainder))
    const words = parts.join(' ') || 'Zero'
    return `INR ${words}${paise ? ` and ${underThousand(paise)} Paise` : ''} Only`
}

const generateRetailInvoicePDF = async (invoice, templateSettings, returnBlob = false) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const [regularFont, boldFont] = await loadRetailUnicodeFonts()
    doc.addFileToVFS('NotoSans-Regular.ttf', regularFont)
    doc.addFileToVFS('NotoSans-Bold.ttf', boldFont)
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold')
    doc.setFont('NotoSans', 'normal')
    const pageWidth = 297
    const left = 10
    const right = 287
    const storeName = resolveStoreName(invoice, templateSettings)
    const buyerName = invoice.customerName?.trim() || 'Cash Sale'
    const paymentMode = invoice.paymentMode || 'Cash'
    const items = invoice.items || []
    const buyerState = templateSettings.buyerState || templateSettings.sellerState || ''
    const buyerStateCode = templateSettings.buyerStateCode || templateSettings.sellerStateCode || ''
    const money = (value) => `₹ ${Number(value || 0).toFixed(2)}`
    const drawDoubleLine = (y, x1 = left, x2 = right) => {
        doc.setDrawColor(35, 35, 35)
        doc.setLineWidth(0.3)
        doc.line(x1, y, x2, y)
        doc.line(x1, y + 1, x2, y + 1)
    }
    const tableColumns = [
        { key: 'sr', title: 'Sr. No.', width: 13, align: 'center' },
        { key: 'description', title: 'Description of Goods', width: 128, align: 'left' },
        { key: 'gst', title: 'GST %', width: 22, align: 'right' },
        { key: 'price', title: 'S. Price\nRate', width: 29, align: 'right' },
        { key: 'unit', title: 'Unit', width: 22, align: 'center' },
        { key: 'quantity', title: 'Qty', width: 19, align: 'right' },
        { key: 'amount', title: 'Amount (₹)', width: 44, align: 'right' }
    ]
    const tableData = items.map((item, index) => {
        const qty = Number(item.quantity) || 0
        const price = Number(item.price) || 0
        const gst = Number(item.gst) || 0
        const description = [item.name || 'Product', item.batch ? `Batch: ${item.batch}` : '', item.expiry ? `Expiry: ${item.expiry}` : ''].filter(Boolean).join('\n')
        return tableColumns.map(column => ({
            sr: index + 1,
            description,
            gst: gst.toFixed(2),
            price: money(price),
            unit: item.unit || 'Pcs',
            quantity: qty,
            amount: money(price * qty)
        }[column.key]))
    })

    doc.setDrawColor(35, 35, 35)
    doc.setTextColor(15, 15, 15)
    doc.setLineWidth(0.35)
    doc.rect(left, 8, right - left, 39)
    doc.line(left, 17, right, 17)
    doc.line(94, 17, 94, 47)
    doc.line(154, 17, 154, 47)
    doc.setFont('NotoSans', 'bold')
    doc.setFontSize(10)
    doc.text(`Invoice No.: ${invoice.id || ''}`, left + 4, 14)
    doc.text(templateSettings.invoiceTitle || 'RETAIL INVOICE', pageWidth / 2, 14, { align: 'center' })
    doc.text(`Date: ${new Date(invoice.date || Date.now()).toLocaleDateString('en-IN')}`, right - 4, 14, { align: 'right' })

    doc.setFontSize(7.5)
    doc.text('Seller Details:', left + 4, 21)
    doc.text('Dispatch Document No.:', 97, 21)
    doc.text('Buyer Details:', 157, 21)
    doc.setFont('NotoSans', 'normal')
    const sellerLines = [
        storeName,
        templateSettings.sellerAddress,
        templateSettings.sellerGstin ? `GSTIN: ${templateSettings.sellerGstin}` : '',
        templateSettings.sellerState ? `State Name: ${templateSettings.sellerState}, Code: ${templateSettings.sellerStateCode || ''}` : '',
        templateSettings.sellerPhone ? `Phone: ${templateSettings.sellerPhone}` : '',
        templateSettings.sellerEmail ? `Email: ${templateSettings.sellerEmail}` : ''
    ].filter(Boolean)
    doc.text(doc.splitTextToSize(sellerLines.join('\n'), 82), left + 4, 26)
    const dispatchLines = [
        templateSettings.dispatchDocumentNo || '',
        `Dispatched through: ${templateSettings.dispatchedThrough || ''}`,
        `Destination: ${templateSettings.destination || invoice.customerAddress || ''}`,
        `Terms of Delivery: ${templateSettings.termsOfDelivery || ''}`,
        `Mode of Payment: ${paymentMode}`
    ]
    doc.text(doc.splitTextToSize(dispatchLines.join('\n'), 54), 97, 26)
    const buyerLines = [
        buyerName,
        invoice.customerPhone?.trim() ? `Phone: ${invoice.customerPhone.trim()}` : '',
        invoice.customerAddress?.trim() || '',
        invoice.customerGstin?.trim() ? `GSTIN / UIN: ${invoice.customerGstin.trim()}` : 'GSTIN / UIN: Consumer',
        `State Name: ${buyerState}, Code: ${buyerStateCode}`
    ].filter(Boolean)
    doc.text(doc.splitTextToSize(buyerLines.join('\n'), 126), 157, 26)

    const tableStartY = 47
    autoTable(doc, {
        startY: tableStartY,
        margin: { left, right: pageWidth - right },
        head: [tableColumns.map(column => column.title)],
        body: tableData,
        theme: 'plain',
        styles: { font: 'NotoSans', fontSize: 8, textColor: [15, 15, 15], cellPadding: { top: 1.8, right: 1.1, bottom: 1.4, left: 1.1 }, valign: 'middle' },
        headStyles: { fontStyle: 'bold', fillColor: [245, 245, 245], textColor: [15, 15, 15], halign: 'center', minCellHeight: 8.5, cellPadding: { top: 1.2, right: 1.1, bottom: 1.2, left: 1.1 }, lineWidth: 0.45, lineColor: [35, 35, 35] },
        columnStyles: Object.fromEntries(tableColumns.map((column, index) => [index, { cellWidth: column.width, halign: column.align }])),
        didDrawCell: (data) => {
            const { x, y, width, height } = data.cell
            doc.setDrawColor(data.section === 'head' ? 35 : 70, data.section === 'head' ? 35 : 70, data.section === 'head' ? 35 : 70)
            doc.setLineWidth(data.section === 'head' ? 0.45 : 0.25)
            doc.line(x, y, x, y + height)
            doc.line(x + width, y, x + width, y + height)
            if (data.section === 'head' && data.column.index === 0) {
                drawDoubleLine(y)
                drawDoubleLine(y + height)
            }
            if (data.section === 'body' && data.column.index === 0 && data.row.index === data.table.body.length - 1) {
                drawDoubleLine(y + height)
            }
        }
    })

    const taxGroups = new Map()
    const totals = items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0
        const price = Number(item.price) || 0
        const gst = Number(item.gst) || 0
        const amount = price * qty
        const taxable = amount / (1 + (gst / 100))
        const tax = amount - taxable
        const group = taxGroups.get(gst) || { taxable: 0, tax: 0, hsn: item.hsnCode || item.hsn || '' }
        group.taxable += taxable
        group.tax += tax
        if (!group.hsn) group.hsn = item.hsnCode || item.hsn || ''
        taxGroups.set(gst, group)
        return { taxable: sum.taxable + taxable, gst: sum.gst + tax, amount: sum.amount + amount }
    }, { taxable: 0, gst: 0, amount: 0 })
    const discount = Number(invoice.discount) || 0
    const grandTotal = totals.amount - discount
    const roundedTotal = Math.round(grandTotal)
    const roundOff = roundedTotal - grandTotal
    const footerTop = (doc.lastAutoTable?.finalY || tableStartY) + 2

    doc.setFont('NotoSans', 'bold')
    doc.setFontSize(8)
    doc.text(`Amount Chargeable (in words): ${numberToIndianWords(roundedTotal)}`, left + 4, footerTop + 5)

    const taxRows = [...taxGroups.entries()].map(([rate, group]) => [
        money(group.taxable),
        `${(rate / 2).toFixed(1)}%`,
        money(group.tax / 2),
        `${(rate / 2).toFixed(1)}%`,
        money(group.tax / 2),
        money(group.tax)
    ])
    taxRows.push([money(totals.taxable), '', '', '', '', money(totals.gst)])
    autoTable(doc, {
        startY: footerTop + 7,
        margin: { left: left + 4 },
        tableWidth: 160,
        head: [['Taxable Value', 'CGST\nRate', 'CGST\nAmt', 'SGST\nRate', 'SGST\nAmt', 'Total Tax']],
        body: taxRows,
        theme: 'grid',
        pageBreak: 'avoid',
        styles: { font: 'NotoSans', fontSize: 6, cellPadding: 0.8, minCellHeight: 4.5, halign: 'center', valign: 'middle', lineWidth: 0.18, lineColor: [130, 130, 130] },
        headStyles: { fillColor: [245, 245, 245], textColor: [15, 15, 15], fontStyle: 'bold', minCellHeight: 6 },
        columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 25 }, 2: { cellWidth: 25 }, 3: { cellWidth: 25 }, 4: { cellWidth: 25 }, 5: { cellWidth: 25 } }
    })

    const taxTableBottom = doc.lastAutoTable?.finalY || footerTop
    const paymentModeText = String(paymentMode).toLowerCase()
    const showBankDetails = paymentModeText.includes('upi') || paymentModeText.includes('bank') || paymentModeText.includes('transfer')
    if (showBankDetails) {
        const bankTop = taxTableBottom + 2
        const bankLines = [
            `Bank Name: ${templateSettings.paymentBankName || ''}`,
            `A/c Name: ${templateSettings.paymentAccountName || ''}`,
            `A/c No: ${templateSettings.paymentAccountNumber || ''}`,
            `IFSC Code: ${templateSettings.paymentIfscCode || ''}    UPI ID (ND): ${templateSettings.paymentUpiId || ''}`
        ]
        doc.setDrawColor(65, 65, 65)
        doc.setLineWidth(0.3)
        doc.rect(left + 4, bankTop, 160, 14)
        doc.setFont('NotoSans', 'bold')
        doc.setFontSize(6.5)
        doc.text('Bank / UPI Details', left + 6, bankTop + 3.5)
        doc.setFont('NotoSans', 'normal')
        doc.text(doc.splitTextToSize(bankLines.join('\n'), 154), left + 6, bankTop + 6.5)
    }

    const totalsX = 222
    const valueX = right - 4
    const rightRows = [
        ['Taxable Amt:', money(totals.taxable)],
        ...[...taxGroups.entries()].map(([rate, group]) => [`CGST @ ${(rate / 2).toFixed(1)}%:`, money(group.tax / 2)]),
        ...[...taxGroups.entries()].map(([rate, group]) => [`SGST @ ${(rate / 2).toFixed(1)}%:`, money(group.tax / 2)]),
        ['Discount:', discount > 0 ? `- ${money(discount)}` : money(0)],
        ['Round Off:', money(roundOff)]
    ]
    doc.setFont('NotoSans', 'normal')
    doc.setFontSize(8)
    rightRows.forEach(([label, value], index) => {
        const y = footerTop + 8 + (index * 3.4)
        doc.text(label, totalsX, y)
        doc.text(value, valueX, y, { align: 'right' })
    })
    const netY = footerTop + 8 + (rightRows.length * 3.4) + 1.5
    doc.setFont('NotoSans', 'bold')
    doc.text('Net Amount with GST:', totalsX, netY)
    const netValue = money(roundedTotal)
    doc.text(netValue, valueX, netY, { align: 'right' })
    drawDoubleLine(netY - 4, totalsX, valueX)
    drawDoubleLine(netY + 3, totalsX, valueX)

    const declarationY = 194
    doc.setFont('NotoSans', 'normal')
    doc.setFontSize(6.5)
    doc.text(doc.splitTextToSize('Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', 155), left + 4, declarationY)

    const pdfBlob = doc.output('blob')
    if (returnBlob) return pdfBlob

    const pdfUrl = URL.createObjectURL(pdfBlob)
    window.open(pdfUrl, '_blank')
}

export const generateThermalInvoicePDF = (invoice) => {
    const templateSettings = getInvoiceTemplateSettings()
    if (templateSettings.thermalPrinterEnabled !== true) return
    const storeName = resolveStoreName(invoice, templateSettings)
    // Helper to draw content and return final Y position
    const drawContent = (doc, isFinal = false) => {
        const centerX = 38
        let currentY = 10
        const margin = 3
        const contentWidth = 74 // Safe printable area for 80mm

        // --- Header ---
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text(storeName, centerX, currentY + 4, { align: 'center' })
        currentY += 5

        doc.setFontSize(9) // Increased base font size
        doc.setFont(undefined, 'normal')
        doc.text(templateSettings.sellerTagline, centerX, currentY + 4, { align: 'center' })
        currentY += 4
        doc.text(templateSettings.sellerAddress, centerX, currentY + 4, { align: 'center' })
        currentY += 4
        doc.text(`Ph: ${templateSettings.sellerPhone}`, centerX, currentY + 4, { align: 'center' })
        currentY += 7

        // Dotted Line
        doc.setLineWidth(0.5);
        doc.setLineDash([1, 1], 0);
        doc.line(margin, currentY, 80 - margin, currentY);
        currentY += 4

        // --- Invoice Meta ---
        doc.setFontSize(9)
        doc.setFont(undefined, 'bold')
        doc.text(`Inv: ${invoice.id}`, margin, currentY)
        doc.setFont(undefined, 'normal')
        doc.text(`${new Date(invoice.date).toLocaleDateString('en-IN')}`, 80 - margin, currentY, { align: 'right' })
        currentY += 4

        doc.text(`Cust: ${invoice.customerName || 'Walk-in'}`, margin, currentY)
        if (invoice.customerPhone) {
            currentY += 4
            doc.text(`Ph: ${invoice.customerPhone}`, margin, currentY)
        }
        currentY += 2

        doc.line(margin, currentY, 80 - margin, currentY);
        currentY += 4

        // --- Items Table Headers ---
        // We will do a custom layout: 
        // Line 1: # Item Name
        // Line 2: Qty Unit Rate(Base) GST% GSTAmt Total

        // No Standard Header row needed as it's implied or we can add a small legend if space permits
        // Let's add a small legend row
        doc.setFontSize(7)
        doc.setFont(undefined, 'bold')
        doc.text('#  Item Description', margin, currentY)
        currentY += 3
        // Legend for columns
        const colX = { qty: margin + 3, rate: margin + 18, gst: margin + 33, tax: margin + 46, total: 80 - margin - 2 }
        doc.text('Qty', colX.qty, currentY, { align: 'left' })
        doc.text('Base', colX.rate, currentY, { align: 'right' })
        doc.text('GST%', colX.gst, currentY, { align: 'right' })
        doc.text('Tax', colX.tax, currentY, { align: 'right' })
        doc.text('Total', colX.total, currentY, { align: 'right' })

        doc.line(margin, currentY + 1, 80 - margin, currentY + 1);
        currentY += 4

        // --- Items Loop ---
        doc.setFont(undefined, 'normal')

        invoice.items.forEach((item, index) => {
            // Calculations
            const qty = Number(item.quantity);
            const rateIncl = Number(item.price);
            const gstPercent = Number(item.gst || 0);

            // Reverse calc for Base Rate
            const rateExcl = rateIncl / (1 + (gstPercent / 100));
            const totalIncl = rateIncl * qty;
            const totalBase = rateExcl * qty;
            const totalTax = totalIncl - totalBase;

            // Line 1: Name
            doc.setFontSize(9)
            doc.setFont(undefined, 'bold')
            const nameLine = `${index + 1}. ${item.name}`;
            // Handle wrapping if name is too long
            const splitName = doc.splitTextToSize(nameLine, contentWidth);
            doc.text(splitName, margin, currentY);
            currentY += (splitName.length * 4); // Height of name lines

            // Line 2: Details
            doc.setFontSize(8)
            doc.setFont(undefined, 'normal')

            // Qty Unit
            doc.text(`${qty} ${item.unit || 'Pcs'}`, colX.qty, currentY, { align: 'left' })
            // Base Rate
            doc.text(`${rateExcl.toFixed(2)}`, colX.rate, currentY, { align: 'right' })
            // GST %
            doc.text(`${gstPercent}%`, colX.gst, currentY, { align: 'right' })
            // Tax Amt
            doc.text(`${totalTax.toFixed(2)}`, colX.tax, currentY, { align: 'right' })
            // Total
            doc.text(`${totalIncl.toFixed(2)}`, colX.total, currentY, { align: 'right' })

            currentY += 4 // Spacing for next item
        })

        doc.line(margin, currentY, 80 - margin, currentY);
        currentY += 4

        // --- Totals ---
        // Recalculate Totals for Display
        const summary = (invoice.items || []).reduce((acc, item) => {
            const qty = Number(item.quantity)
            const rateIncl = Number(item.price)
            const gstPercent = Number(item.gst || 0)
            const rateExcl = rateIncl / (1 + (gstPercent / 100))

            const totalIncl = rateIncl * qty
            const totalBase = rateExcl * qty
            const totalTax = totalIncl - totalBase

            return {
                base: acc.base + totalBase,
                tax: acc.tax + totalTax,
                total: acc.total + totalIncl
            }
        }, { base: 0, tax: 0, total: 0 });

        const discount = Number(invoice.discount || 0);

        doc.setFontSize(9)

        // Subtotal (Excl Tax)
        doc.text('Subtotal (Excl. Tax):', 45, currentY, { align: 'right' })
        doc.text(`Rs. ${summary.base.toFixed(2)}`, 80 - margin, currentY, { align: 'right' })
        currentY += 4

        // Total GST Content
        doc.text('Total GST Content:', 45, currentY, { align: 'right' })
        doc.text(`Rs. ${summary.tax.toFixed(2)}`, 80 - margin, currentY, { align: 'right' })
        currentY += 4

        if (discount > 0) {
            doc.text('Discount:', 45, currentY, { align: 'right' })
            doc.text(`- Rs. ${discount.toFixed(2)}`, 80 - margin, currentY, { align: 'right' })
            currentY += 4
        }

        doc.setFontSize(11)
        doc.setFont(undefined, 'bold')
        doc.text('Grand Total:', 42, currentY, { align: 'right' })
        doc.text(`Rs. ${(summary.total - discount).toFixed(2)}`, 80 - margin - 2, currentY, { align: 'right' })
        currentY += 8

        // --- Footer ---
        doc.setFontSize(9)
        doc.setFont(undefined, 'italic')
        doc.text('Thank you!', centerX, currentY, { align: 'center' })
        currentY += 4
        doc.text('Visit Again', centerX, currentY, { align: 'center' })
        currentY += 5 // Bottom padding

        return currentY;
    }

    // Pass 1: Calculate Height
    const tempDoc = new jsPDF({ unit: 'mm', format: [80, 1000] }); // Long dummy
    const contentHeight = drawContent(tempDoc);

    // Pass 2: Generate Actual PDF
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, contentHeight] // Exact height
    })

    drawContent(doc, true);

    doc.autoPrint({ variant: 'javascript' })
    const pdfBlob = doc.output('bloburl')
    window.open(pdfBlob, '_blank')
}

export const generateSaleReturnPDF = (returnRecord) => {
    const templateSettings = getInvoiceTemplateSettings()
    const returnInvoiceId = returnRecord.returnInvoiceId || returnRecord.returnInvoiceNo || returnRecord.id || 'RETURN'
    return generateRetailInvoicePDF({
        id: returnInvoiceId,
        date: returnRecord.date,
        customerName: returnRecord.customerName || 'Cash Sale',
        customerPhone: returnRecord.customerPhone || '',
        customerAddress: returnRecord.customerAddress || '',
        customerGstin: returnRecord.customerGstin || '',
        paymentMode: returnRecord.paymentMode || 'Cash',
        discount: 0,
        items: (returnRecord.items || []).map(item => ({
            ...item,
            price: Number(item.price ?? item.salePrice ?? 0) || 0,
            gst: Number(item.gst) || 0,
            unit: item.unit || 'Pcs'
        }))
    }, { ...templateSettings, template: 'retail', invoiceTitle: 'SALE RETURN INVOICE' })
}

export const generatePurchaseReturnPDF = (returnRecord) => {
    const templateSettings = getInvoiceTemplateSettings()
    const supplierName = returnRecord.supplierName || 'Supplier'
    const returnInvoiceId = returnRecord.returnInvoiceId || returnRecord.returnInvoiceNo || returnRecord.id || 'RETURN'
    const purchaseReturnSettings = {
        ...templateSettings,
        template: 'retail',
        invoiceTitle: 'PURCHASE RETURN INVOICE',
        sellerName: supplierName,
        sellerAddress: returnRecord.supplierAddress || '',
        sellerPhone: returnRecord.supplierPhone || '',
        sellerEmail: returnRecord.supplierEmail || '',
        sellerGstin: returnRecord.supplierGstin || '',
        sellerState: returnRecord.supplierState || '',
        sellerStateCode: returnRecord.supplierStateCode || '',
        buyerState: templateSettings.sellerState || '',
        buyerStateCode: templateSettings.sellerStateCode || ''
    }
    return generateRetailInvoicePDF({
        id: returnInvoiceId,
        date: returnRecord.date,
        storeName: supplierName,
        customerName: templateSettings.sellerName || getCachedStoreProfile().storeName,
        customerAddress: templateSettings.sellerAddress || getCachedStoreProfile().address,
        customerGstin: templateSettings.sellerGstin || '',
        paymentMode: returnRecord.paymentMode || 'Cash',
        discount: 0,
        items: (returnRecord.items || []).map(item => ({
            ...item,
            price: Number(item.purchasePrice ?? item.price ?? item.rateIncl ?? 0) || 0,
            gst: Number(item.gst) || 0,
            unit: item.unit || 'Pcs'
        }))
    }, purchaseReturnSettings)
}

export const generatePurchasePDF = (purchase) => {
    const templateSettings = getInvoiceTemplateSettings()
    const supplierName = purchase.supplierName || 'Supplier'
    const purchaseSettings = {
        ...templateSettings,
        template: 'retail',
        invoiceTitle: 'PURCHASE INVOICE',
        sellerName: supplierName,
        sellerAddress: purchase.supplierAddress || '',
        sellerPhone: purchase.supplierPhone || '',
        sellerEmail: purchase.supplierEmail || '',
        sellerGstin: purchase.supplierGstin || '',
        sellerState: purchase.supplierState || '',
        sellerStateCode: purchase.supplierStateCode || '',
        buyerState: templateSettings.sellerState || '',
        buyerStateCode: templateSettings.sellerStateCode || ''
    }
    const purchaseInvoice = {
        id: purchase.invoiceNo || purchase.id,
        date: purchase.date,
        storeName: supplierName,
        customerName: templateSettings.sellerName || getCachedStoreProfile().storeName,
        customerAddress: templateSettings.sellerAddress || getCachedStoreProfile().address,
        customerGstin: templateSettings.sellerGstin || '',
        paymentMode: purchase.paymentMode || 'Cash',
        discount: 0,
        items: (purchase.items || []).map(item => ({
            ...item,
            price: Number(item.purchasePrice ?? item.rateIncl ?? item.price) || 0,
            gst: Number(item.gst) || 0,
            unit: item.unit || 'Pcs'
        }))
    }
    return generateRetailInvoicePDF(purchaseInvoice, purchaseSettings)
}

export const generateCustomerLedgerPDF = (customer, transactions, totals, dateRange) => {
    const doc = new jsPDF()
    const storeName = getCachedStoreName()
    const storeProfile = getCachedStoreProfile()

    // --- Header Section Match ---

    // Line 1: Shop Name
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(storeName, 105, 15, { align: 'center' })

    // Line 2: Address Line 1
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.text(storeProfile.address, 105, 20, { align: 'center' })

    // Line 3: Address Line 2 + Contact
    doc.text(`Phone: ${storeProfile.phone}`, 105, 25, { align: 'center' })

    // Line 4: Report Title
    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text('Ledger Book', 105, 33, { align: 'center' })

    // Line 5: Date Range
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    const start = dateRange?.start ? new Date(dateRange.start).toLocaleDateString('en-GB') : 'Beginning'
    const end = dateRange?.end ? new Date(dateRange.end).toLocaleDateString('en-GB') : 'Present'
    doc.text(`(From: ${start} to ${end})`, 105, 38, { align: 'center' })

    // --- Ledger Details Section ---
    let currentY = 50
    doc.setFontSize(9)

    // Ledger Name
    doc.setFont(undefined, 'bold')
    doc.text(`Ledger : ${customer.name.toUpperCase()}`, 15, currentY)

    // Opening Balance
    const openingBalance = totals.openingBalance || 0
    doc.text(`Opening Balance : ${openingBalance.toFixed(2)} ${openingBalance >= 0 ? 'Dr' : 'Cr'}`, 195, currentY, { align: 'right' })

    currentY += 5
    doc.text(`Address : ${customer.address ? customer.address.toUpperCase() : ''}`, 15, currentY)

    currentY += 5
    doc.text(`Mobile: ${customer.phone || ''}`, 15, currentY)

    // --- Table Section ---
    const tableBody = transactions.map(t => {
        let description = ''

        // Format Description for Sales
        if (t.items && t.items.length > 0) {
            description = t.items.map(item => {
                const qty = Number(item.quantity)
                const price = Number(item.price) // Unit Price (Inclusive usually)
                const gst = Number(item.gst || 0)

                // Back-calculate Basic Rate from Inclusive Price
                // Formula: Inclusive = Basic * (1 + GST/100)
                // Basic = Inclusive / (1 + GST/100)
                const basicRate = price / (1 + (gst / 100))
                const totalBasic = basicRate * qty
                const totalTax = (price * qty) - totalBasic
                const lineTotal = price * qty

                // Format: YAMATO 1KG - 1.0 PCS @550.84 + 99.16 (GST 18) = 650.00
                return `${item.name} - ${qty} ${item.unit || 'PCS'} @${basicRate.toFixed(2)} + ${totalTax.toFixed(2)} (GST ${Math.round(gst)}) = ${lineTotal.toFixed(2)}`
            }).join('\n')
        }
        // Format Description for Payments/Expenses
        else {
            description = t.note || t.description || ''
        }

        // Map Type
        let typeStr = 'Sale'
        if (t.type === 'PAYMENT') typeStr = 'Receipt'
        if (t.type === 'EXPENSE') typeStr = 'Charge'

        // Map Voucher Number - Don't show Firebase IDs
        let vchNo = t.id
        if (t.type === 'CREDIT_SALE' || t.type === 'CASH_SALE') {
            vchNo = t.id.replace('INV-', '')
        } else {
            vchNo = '-' // Manual entries don't have a clean sequence ID usually, or represent it as Manual
        }

        return [
            new Date(t.date).toLocaleDateString('en-GB'), // dd/mm/yyyy
            typeStr,
            vchNo,
            description,
            t.amount > 0 ? t.amount.toFixed(2) : '',
            t.paidAmount > 0 ? t.paidAmount.toFixed(2) : '',
            `${Math.abs(t.balance).toFixed(2)} ${t.balance >= 0 ? 'Dr' : 'Cr'}`
        ]
    })

    autoTable(doc, {
        head: [['Date', 'Type', 'Vch. No', 'Description', 'Debit', 'Credit', 'Balance']],
        body: tableBody,
        startY: currentY + 5,
        theme: 'plain', // Clean look like the image
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            fontSize: 9,
            marginBottom: 2,
            lineWidth: { bottom: 0.5, top: 0.5 },
            lineColor: [0, 0, 0]
        },
        bodyStyles: {
            fontSize: 8,
            textColor: [0, 0, 0],
            cellPadding: 3,
            valign: 'top',
        },
        columnStyles: {
            0: { cellWidth: 20 }, // Date
            1: { cellWidth: 15 }, // Type
            2: { cellWidth: 20 }, // Vch No
            3: { cellWidth: 'auto' }, // Description (Flexible)
            4: { cellWidth: 20, halign: 'right' }, // Debit
            5: { cellWidth: 20, halign: 'right' }, // Credit
            6: { cellWidth: 25, halign: 'right' }  // Balance
        },
        // Draw lines between rows? The image has no internal lines, just spacing.
        // Let's keep it clean.
        didParseCell: function (data) {
            // Add a bottom border to the header manually if needed, but didDrawPage handles standard lines.
        },
        didDrawPage: function (data) {
            // Footer: Page numbers if needed
        }
    })

    // Add Total Row at the bottom
    const finalY = doc.lastAutoTable.finalY + 2
    doc.setLineWidth(0.5)
    doc.line(15, finalY, 195, finalY)

    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text('Totals:', 100, finalY + 5)
    doc.text(totals.sales.toFixed(2), 160, finalY + 5, { align: 'right' }) // Approx Debit col position
    doc.text(totals.received.toFixed(2), 180, finalY + 5, { align: 'right' }) // Approx Credit col Position

    // Final Closing Balance
    doc.line(15, finalY + 7, 195, finalY + 7)
    doc.setFontSize(10)
    doc.text(`Closing Balance: ${totals.due.toFixed(2)} ${totals.due >= 0 ? 'Dr' : 'Cr'}`, 195, finalY + 14, { align: 'right' })

    const pdfBlob = doc.output('bloburl')
    window.open(pdfBlob, '_blank')
}

export const generateSupplierLedgerPDF = (supplier, transactions, totals, dateRange) => {
    const doc = new jsPDF()
    const storeName = getCachedStoreName()
    const storeProfile = getCachedStoreProfile()

    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(storeName, 105, 15, { align: 'center' })

    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.text(storeProfile.address, 105, 20, { align: 'center' })
    doc.text(`Phone: ${storeProfile.phone}`, 105, 25, { align: 'center' })

    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text('Purchase Ledger Statement', 105, 33, { align: 'center' })

    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    const start = dateRange?.start ? new Date(dateRange.start).toLocaleDateString('en-GB') : 'Beginning'
    const end = dateRange?.end ? new Date(dateRange.end).toLocaleDateString('en-GB') : 'Present'
    doc.text(`(From: ${start} to ${end})`, 105, 38, { align: 'center' })

    let currentY = 50
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text(`Supplier : ${(supplier.name || '').toUpperCase()}`, 15, currentY)
    doc.text(`Opening Balance : ${Number(totals.openingBalance || 0).toFixed(2)} Dr`, 195, currentY, { align: 'right' })
    currentY += 5
    doc.setFont(undefined, 'normal')
    const addressLines = doc.splitTextToSize(`Address : ${(supplier.address || '').toUpperCase()}`, 180)
    doc.text(addressLines, 15, currentY)
    currentY += Math.max(5, addressLines.length * 4.5)
    doc.text(`Mobile: ${supplier.phone || ''}${supplier.gstin ? `  GSTIN: ${supplier.gstin}` : ''}`, 15, currentY)

    const tableBody = transactions.map(t => {
        const isPurchase = t.type === 'PURCHASE'
        const description = isPurchase && t.items?.length
            ? t.items.map(item => {
                const quantity = Number(item.quantity) || 0
                const rate = Number(item.rateIncl ?? item.purchasePrice ?? item.price ?? 0)
                const lineTotal = Number(item.lineTotal ?? rate * quantity) || 0
                const unit = item.unit ? ` ${item.unit}` : ''
                return `${item.name || 'Product'} x ${quantity}${unit} @ Rs.${rate.toFixed(2)} = Rs.${lineTotal.toFixed(2)}`
            }).join('\n')
            : (t.note || t.description || '')
        return [
            new Date(t.date).toLocaleDateString('en-GB'),
            isPurchase ? 'Purchase' : 'Payment',
            isPurchase ? (t.id || '-').replace('PUR-', '') : '-',
            description,
            isPurchase ? Number(t.amount).toFixed(2) : '',
            !isPurchase ? Number(t.amount).toFixed(2) : '',
            `${Math.abs(Number(t.balance) || 0).toFixed(2)} ${(Number(t.balance) || 0) >= 0 ? 'Dr' : 'Cr'}`
        ]
    })

    autoTable(doc, {
        head: [['Date', 'Type', 'Vch. No', 'Description', 'Debit', 'Credit', 'Balance']],
        body: tableBody,
        startY: currentY + 5,
        theme: 'plain',
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            fontSize: 9,
            lineWidth: { bottom: 0.5, top: 0.5 },
            lineColor: [0, 0, 0]
        },
        bodyStyles: { fontSize: 8, textColor: [0, 0, 0], cellPadding: 3, valign: 'top' },
        columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 20 },
            2: { cellWidth: 18 },
            3: { cellWidth: 'auto' },
            4: { cellWidth: 22, halign: 'right' },
            5: { cellWidth: 22, halign: 'right' },
            6: { cellWidth: 25, halign: 'right' }
        }
    })

    const finalY = doc.lastAutoTable.finalY + 2
    doc.setLineWidth(0.5)
    doc.line(15, finalY, 195, finalY)
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text('Totals:', 100, finalY + 5)
    doc.text(Number(totals.purchase || 0).toFixed(2), 160, finalY + 5, { align: 'right' })
    doc.text(Number(totals.paid || 0).toFixed(2), 182, finalY + 5, { align: 'right' })
    doc.line(15, finalY + 7, 195, finalY + 7)
    doc.setFontSize(10)
    doc.text(`Closing Balance: ${Math.abs(Number(totals.due) || 0).toFixed(2)} ${(Number(totals.due) || 0) >= 0 ? 'Dr' : 'Cr'}`, 195, finalY + 14, { align: 'right' })

    const pdfBlob = doc.output('bloburl')
    window.open(pdfBlob, '_blank')
}
