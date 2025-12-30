import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { appConfig } from '../config/appConfig'

export const generateInvoicePDF = (invoice) => {
    const doc = new jsPDF()

    // Header - Shop Details
    doc.setFontSize(22)
    doc.setTextColor(45, 106, 79)
    doc.setFont(undefined, 'bold')
    doc.text(appConfig.appName.toUpperCase(), 105, 20, { align: 'center' })

    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.setFont(undefined, 'normal')
    doc.text(appConfig.tagline, 105, 28, { align: 'center' })
    doc.text(appConfig.address, 105, 33, { align: 'center' })
    doc.text(`Phone: ${appConfig.contact}`, 105, 38, { align: 'center' })

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
    doc.text(`Farmer Name: ${invoice.customerName || 'N/A'}`, 20, currentY)

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
            `Rs ${rateExcl.toFixed(2)}`,
            `${item.gst}%`,
            `Rs ${totalGST.toFixed(2)}`,
            `Rs ${totalIncl.toFixed(2)}`
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
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'center' },
            5: { halign: 'right' },
            6: { halign: 'right' }
        },
        styles: { fontSize: 9, cellPadding: 3 },
        margin: { top: 85 }
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
    doc.rect(120, finalY - 5, 75, 45, 'F')

    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.text(`Subtotal (Excl. Tax):`, 125, finalY + 5)
    doc.text(`Rs ${summaryTotals.subtotal.toFixed(2)}`, 190, finalY + 5, { align: 'right' })

    doc.text(`Total GST Content:`, 125, finalY + 12)
    doc.text(`Rs ${summaryTotals.gst.toFixed(2)}`, 190, finalY + 12, { align: 'right' })

    if (invoice.discount > 0) {
        doc.text(`Discount:`, 125, finalY + 19)
        doc.setTextColor(220, 38, 38)
        doc.text(`-Rs ${Number(invoice.discount).toFixed(2)}`, 190, finalY + 19, { align: 'right' })
        doc.setTextColor(80, 80, 80)
    }

    doc.setDrawColor(200, 200, 200)
    doc.line(125, finalY + 23, 190, finalY + 23)

    doc.setFontSize(13)
    doc.setTextColor(45, 106, 79)
    doc.setFont(undefined, 'bold')
    doc.text(`Grand Total:`, 125, finalY + 31)
    doc.text(`Rs ${Number(summaryTotals.total - invoice.discount).toFixed(2)}`, 190, finalY + 31, { align: 'right' })

    // Footer
    doc.setFontSize(9)
    doc.setTextColor(150, 150, 150)
    doc.setFont(undefined, 'italic')
    doc.text('This is a computer generated invoice.', 105, 280, { align: 'center' })
    doc.text('Thank you for using InvoiceFlow', 105, 285, { align: 'center' })
    doc.text('Visit Again!', 105, 290, { align: 'center' })

    doc.save(`${invoice.id}_${invoice.customerName || 'Invoice'}.pdf`)
}

export const generatePurchasePDF = (purchase) => {
    const doc = new jsPDF()

    // Header - Shop Details
    doc.setFontSize(22)
    doc.setTextColor(45, 106, 79)
    doc.setFont(undefined, 'bold')
    doc.text('INVOICEFLOW', 105, 20, { align: 'center' })

    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.setFont(undefined, 'normal')
    doc.text(appConfig.tagline, 105, 28, { align: 'center' })
    doc.text(appConfig.address, 105, 33, { align: 'center' })
    doc.text(`Phone: ${appConfig.contact}`, 105, 38, { align: 'center' })

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
            `Rs ${rateExcl.toFixed(2)}`,
            `${gstPercent}%`,
            `Rs ${rateIncl.toFixed(2)}`,
            qty,
            `Rs ${amountExcl.toFixed(2)}`,
            `Rs ${lineTotal.toFixed(2)}`
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
    doc.text(`Rs ${Number(purchase.totalAmount).toFixed(2)}`, 195, finalY + 10, { align: 'right' })

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.setFont(undefined, 'italic')
    doc.text('Internal Purchase Record - InvoiceFlow', 105, 280, { align: 'center' })
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 285, { align: 'center' })

    doc.save(`${purchase.id}_Purchase_${purchase.supplierName || 'Entry'}.pdf`)
}
