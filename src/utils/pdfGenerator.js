import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getAppConfig } from '../config/appConfig';

const getThemeColor = () => {
    switch (getAppConfig().theme) {
        case 'slate': return [17, 24, 39];
        case 'blue': return [37, 99, 235];
        case 'dark': return [17, 24, 39];
        case 'corporate': return [30, 27, 75];
        case 'modern': return [236, 72, 153];
        default: return [45, 106, 79]; // emerald
    }
};

export const generateInvoicePDF = (invoice) => {
    const doc = new jsPDF()
    const primaryColor = getThemeColor();

    // Header - Shop Details
    doc.setFontSize(22)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.setFont(undefined, 'bold')
    doc.text(getAppConfig().appName.toUpperCase(), 105, 20, { align: 'center' })

    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.setFont(undefined, 'normal')
    doc.text(getAppConfig().storeType, 105, 28, { align: 'center' })
    doc.text(getAppConfig().address, 105, 33, { align: 'center' })
    doc.text(`Phone: ${getAppConfig().contact}`, 105, 38, { align: 'center' })

    doc.setDrawColor(45, 106, 79)
    doc.setLineWidth(0.5)
    doc.line(20, 42, 190, 42)

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
            `${getAppConfig().currency} ${rateExcl.toFixed(2)}`,
            `${item.gst}%`,
            `${getAppConfig().currency} ${totalGST.toFixed(2)}`,
            `${getAppConfig().currency} ${totalIncl.toFixed(2)}`
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
    doc.text(`${getAppConfig().currency} ${summaryTotals.subtotal.toFixed(2)}`, 190, finalY + 5, { align: 'right' })

    doc.text(`Total GST Content:`, 125, finalY + 12)
    doc.text(`${getAppConfig().currency} ${summaryTotals.gst.toFixed(2)}`, 190, finalY + 12, { align: 'right' })

    if (invoice.discount > 0) {
        doc.text(`Discount:`, 125, finalY + 19)
        doc.setTextColor(220, 38, 38)
        doc.text(`-${getAppConfig().currency} ${Number(invoice.discount).toFixed(2)}`, 190, finalY + 19, { align: 'right' })
        doc.setTextColor(80, 80, 80)
    }

    doc.setDrawColor(200, 200, 200)
    doc.line(125, finalY + 23, 190, finalY + 23)

    doc.setFontSize(13)
    doc.setTextColor(45, 106, 79)
    doc.setFont(undefined, 'bold')
    doc.text(`Grand Total:`, 135, finalY + 31)
    doc.text(`${getAppConfig().currency} ${Number(summaryTotals.total - invoice.discount).toFixed(2)}`, 190, finalY + 31, { align: 'right' })

    // Footer
    doc.setFontSize(9)
    doc.setTextColor(150, 150, 150)
    doc.setFont(undefined, 'italic')
    doc.text('This is a computer generated invoice.', 105, 280, { align: 'center' })
    doc.text(`Thank you for visiting ${getAppConfig().appName}`, 105, 285, { align: 'center' })
    doc.text('Visit Again!', 105, 290, { align: 'center' })

    // Open PDF in new tab (Preview Mode) instead of downloading
    const pdfBlob = doc.output('bloburl')
    window.open(pdfBlob, '_blank')
}

export const generateThermalInvoicePDF = (invoice) => {
    // Helper to draw content and return final Y position
    const drawContent = (doc, isFinal = false) => {
        const centerX = 38
        let currentY = 10
        const margin = 3
        const contentWidth = 74 // Safe printable area for 80mm

        // --- Header ---
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text(getAppConfig().appName.toUpperCase(), centerX, currentY + 4, { align: 'center' })
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
        doc.text(`${getAppConfig().currency} ${summary.base.toFixed(2)}`, 80 - margin, currentY, { align: 'right' })
        currentY += 4

        // Total GST Content
        doc.text('Total GST Content:', 45, currentY, { align: 'right' })
        doc.text(`${getAppConfig().currency} ${summary.tax.toFixed(2)}`, 80 - margin, currentY, { align: 'right' })
        currentY += 4

        if (discount > 0) {
            doc.text('Discount:', 45, currentY, { align: 'right' })
            doc.text(`- ${getAppConfig().currency} ${discount.toFixed(2)}`, 80 - margin, currentY, { align: 'right' })
            currentY += 4
        }


        doc.setFontSize(11)
        doc.setFont(undefined, 'bold')
        doc.text('Grand Total:', 42, currentY, { align: 'right' })
        doc.text(`${getAppConfig().currency} ${(summary.total - discount).toFixed(2)}`, 80 - margin - 2, currentY, { align: 'right' })
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

    const pdfBlob = doc.output('bloburl')
    window.open(pdfBlob, '_blank')
}

export const generatePurchasePDF = (purchase) => {
    const doc = new jsPDF()

    // Header - Shop Details
    doc.setFontSize(22)
    doc.setTextColor(45, 106, 79)
    doc.setFont(undefined, 'bold')
    doc.text(getAppConfig().appName.toUpperCase(), 105, 20, { align: 'center' })

    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.setFont(undefined, 'normal')
    doc.text(getAppConfig().storeType, 105, 28, { align: 'center' })
    doc.text(getAppConfig().address, 105, 33, { align: 'center' })
    doc.text(`Phone: ${getAppConfig().contact}`, 105, 38, { align: 'center' })

    doc.setDrawColor(45, 106, 79)
    doc.setLineWidth(0.5)
    doc.line(20, 42, 190, 42)

    // Purchase Record Title - Centered
    doc.setFontSize(14)
    doc.setTextColor(45, 106, 79)
    doc.setFont(undefined, 'bold')
    doc.text('PURCHASE RECORD', 105, 52, { align: 'center' })

    // Details Grid
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.setFont(undefined, 'bold')

    // Left Side
    doc.text(`Internal ID:`, 20, 62)
    doc.setFont(undefined, 'normal')
    doc.text(`${purchase.id}`, 45, 62)

    doc.setFont(undefined, 'bold')
    doc.text(`Date:`, 20, 68)
    doc.setFont(undefined, 'normal')
    doc.text(`${new Date(purchase.date).toLocaleDateString('en-IN')}`, 45, 68)

    // Right Side
    doc.setFont(undefined, 'bold')
    doc.text(`Invoice No:`, 120, 62)
    doc.setFont(undefined, 'normal')
    doc.text(`${purchase.invoiceNo || 'N/A'}`, 190, 62, { align: 'right' })

    doc.setFont(undefined, 'bold')
    doc.text(`Supplier:`, 120, 68)
    doc.setFont(undefined, 'normal')
    doc.text(`${purchase.supplierName || 'Unknown'}`, 190, 68, { align: 'right' })

    // Table
    const tableData = (purchase.items || []).map((item, i) => {
        const gstPercent = parseFloat(item.gst) || 0
        const qty = parseFloat(item.quantity) || 0
        const rateIncl = parseFloat(item.purchasePrice) || 0

        // Calculate Excl values
        const rateExcl = rateIncl / (1 + (gstPercent / 100))
        const amountExcl = rateExcl * qty // "Amount total without GST"
        const lineTotal = rateIncl * qty  // "Gramme total" (Grand Total)

        return [
            i + 1,
            item.name,
            `${getAppConfig().currency} ${rateExcl.toFixed(2)}`,
            `${gstPercent}%`,
            `${getAppConfig().currency} ${rateIncl.toFixed(2)}`,
            qty,
            `${getAppConfig().currency} ${amountExcl.toFixed(2)}`,
            `${getAppConfig().currency} ${lineTotal.toFixed(2)}`
            ]
    })

    autoTable(doc, {
        head: [['#', 'Item', 'Rate(Excl)', 'GST%', 'Rate(Incl)', 'Qty', 'Amount', 'Total']],
        body: tableData,
        startY: 75,
        theme: 'grid',
        headStyles: {
            fillColor: [45, 106, 79],
            textColor: [255, 255, 255],
            fontSize: 9,
            halign: 'center',
            valign: 'middle'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            1: { cellWidth: 'auto' }, // Item Name
            2: { halign: 'right' },
            3: { halign: 'center' },
            4: { halign: 'right' },
            5: { halign: 'center' },
            6: { halign: 'right' },
            7: { halign: 'right' }
        },
        styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
        margin: { top: 75, left: 10, right: 10 }
    })

    const finalY = doc.lastAutoTable.finalY + 10

    // Totals Panel
    doc.setFillColor(248, 250, 252)
    doc.rect(120, finalY - 5, 80, 25, 'F')

    doc.setFontSize(12)
    doc.setTextColor(45, 106, 79)
    doc.setFont(undefined, 'bold')
    doc.text(`Grand Total:`, 125, finalY + 10)
    doc.text(`${getAppConfig().currency} ${Number(purchase.totalAmount).toFixed(2)}`, 195, finalY + 10, { align: 'right' })

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.setFont(undefined, 'italic')
    doc.text(`Internal Purchase Record - ${getAppConfig().appName}`, 105, 280, { align: 'center' })
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 285, { align: 'center' })

    doc.save(`${purchase.id}_Purchase_${purchase.supplierName || 'Entry'}.pdf`)
}

export const generateCustomerLedgerPDF = (customer, transactions, totals, dateRange) => {
    const doc = new jsPDF()

    // --- Header Section Match ---

    // Line 1: Shop Name
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(getAppConfig().appName.toUpperCase(), 105, 20, { align: 'center' })

    // Line 2: Address Line 1
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.text(getAppConfig().address, 105, 33, { align: 'center' })

    // Line 3: Address Line 2 + Contact
    doc.text(`Phone: ${getAppConfig().contact}`, 105, 38, { align: 'center' })

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
