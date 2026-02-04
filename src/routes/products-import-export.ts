/**
 * Products Import/Export Routes
 * 
 * Handles template download, product export, and bulk import from Excel.
 * Extracted from products.ts for better maintainability.
 */

import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOrManager, type AuthUser } from '../middleware/auth.js';
import { strictRateLimiter } from '../middleware/rate-limit.js';
import { emitProductCreated, emitStockUpdated } from '../lib/socket.js';
import { logError } from '../lib/logger.js';
import { ExcelHelper } from '../lib/excel.js';
import { sanitizeString, sanitizeText, sanitizeSku, sanitizeUrl, sanitizePositiveInt } from '../lib/sanitize.js';
import { ERR } from '../lib/messages.js';

type Variables = {
  user: AuthUser;
};

const importExport = new Hono<{ Variables: Variables }>();

// Download Template
importExport.get('/template', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const categories = await prisma.category.findMany({ 
      where: { tenantId },
      orderBy: { name: 'asc' } 
    });
    const cabangs = await prisma.cabang.findMany({ 
      where: { isActive: true, tenantId }, 
      orderBy: { name: 'asc' } 
    });
    
    if (categories.length === 0 || cabangs.length === 0) {
      return c.json({ 
        error: 'Tidak ada kategori atau cabang. Buat kategori dan cabang terlebih dahulu.' 
      }, 400);
    }

    const workbook = await ExcelHelper.createWorkbook();

    // Sheet 1: Data
    const refData: any[] = [];
    refData.push(['KATEGORI', 'CABANG', 'TIPE_PRODUK']);
    const maxRows = Math.max(categories.length, cabangs.length, 2);
    for (let i = 0; i < maxRows; i++) {
      refData.push([
        categories[i]?.name || '',
        cabangs[i]?.name || '',
        i === 0 ? 'SINGLE' : (i === 1 ? 'VARIANT' : '')
      ]);
    }
    ExcelHelper.addWorksheet(workbook, 'Data', refData);

    // Sheet 2: Panduan
    const infoData: any[] = [];
    infoData.push(['PANDUAN IMPORT PRODUK']);
    infoData.push([]);
    infoData.push(['LANGKAH-LANGKAH:']);
    infoData.push(['1. Pindah ke Sheet "Template Import"']);
    infoData.push(['2. Gunakan DROPDOWN untuk pilih Kategori, Cabang, dan Tipe Produk']);
    infoData.push(['3. Isi data produk sesuai contoh']);
    infoData.push(['4. Simpan file dan upload ke sistem']);
    infoData.push([]);
    infoData.push(['REFERENSI KATEGORI:']);
    categories.forEach(cat => {
      infoData.push([cat.name, cat.description || '-']);
    });
    infoData.push([]);
    infoData.push(['REFERENSI CABANG:']);
    cabangs.forEach(cabang => {
      infoData.push([cabang.name, cabang.address || '-']);
    });
    ExcelHelper.addWorksheet(workbook, 'Panduan', infoData);

    // Sheet 3: Template Import
    const templateData: any[] = [];
    // Header group row
    templateData.push([
      'INFO PRODUK', '', '', '', '',
      'VARIANT ATTRIBUTES', '', '', '', '', '',
      'PRICING & STOCK', '', '',
      'SPESIFIKASI MARKETPLACE', '', '', '', ''
    ]);
    // Column headers
    templateData.push([
      'SKU*', 'Nama Produk*', 'Deskripsi', 'Kategori*', 'Tipe Produk*',
      'Type 1', 'Value 1', 'Type 2', 'Value 2', 'Type 3', 'Value 3',
      'Harga*', 'Stok*', 'Cabang*',
      'Berat (g)', 'Panjang (cm)', 'Lebar (cm)', 'Tinggi (cm)', 'Link Gambar'
    ]);
    for (let i = 0; i < 100; i++) {
      templateData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }
    
    ExcelHelper.addWorksheet(workbook, 'Template Import', templateData, {
      columnWidths: [15, 25, 20, 15, 12, 12, 15, 12, 15, 12, 15, 12, 10, 15, 10, 12, 12, 12, 30],
      merges: [
        { start: { row: 1, col: 1 }, end: { row: 1, col: 5 } },   // INFO PRODUK
        { start: { row: 1, col: 6 }, end: { row: 1, col: 11 } },  // VARIANT ATTRIBUTES
        { start: { row: 1, col: 12 }, end: { row: 1, col: 14 } }, // PRICING & STOCK
        { start: { row: 1, col: 15 }, end: { row: 1, col: 19 } }  // SPESIFIKASI MARKETPLACE
      ]
    });

    // Write to buffer and return as base64
    const buffer = await ExcelHelper.writeToBuffer(workbook);
    const base64Data = buffer.toString('base64');

    return c.json({
      filename: 'template-import-produk.xlsx',
      data: base64Data,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  } catch (error) {
    logError(error, { context: 'Download template error:' });
    return c.json({ error: 'Gagal mengunduh template' }, 500);
  }
});

// Export Products
importExport.get('/export', authMiddleware, async (c) => {
  try {
    const productList = await prisma.product.findMany({
      include: {
        category: true,
        variants: {
          include: {
            stocks: {
              include: { cabang: true }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const exportData: any[] = [];
    productList.forEach(product => {
      product.variants.forEach(variant => {
        variant.stocks.forEach(stock => {
          const variantNames = variant.variantName?.split(' | ') || [];
          const variantValues = variant.variantValue?.split(' | ') || [];
          
          exportData.push([
            variant.sku || '',
            product.name,
            product.description || '',
            product.category?.name || '',
            product.productType,
            variantNames[0] || '',
            variantValues[0] || '',
            variantNames[1] || '',
            variantValues[1] || '',
            variantNames[2] || '',
            variantValues[2] || '',
            stock.price || 0,
            stock.quantity || 0,
            stock.cabang.name,
            variant.weight || '',
            variant.length || '',
            variant.width || '',
            variant.height || '',
            variant.imageUrl || ''
          ]);
        });
      });
    });

    if (exportData.length === 0) {
      return c.json({ error: 'Tidak ada data produk untuk diexport' }, 404);
    }

    const workbook = await ExcelHelper.createWorkbook();
    const header = [
      'SKU*', 'Nama Produk*', 'Deskripsi', 'Kategori*', 'Tipe Produk*',
      'Type 1', 'Value 1', 'Type 2', 'Value 2', 'Type 3', 'Value 3',
      'Harga*', 'Stok*', 'Cabang*',
      'Berat (g)', 'Panjang (cm)', 'Lebar (cm)', 'Tinggi (cm)', 'Link Gambar'
    ];
    const worksheetData = [header, ...exportData];
    ExcelHelper.addWorksheet(workbook, 'Export Produk', worksheetData);
    
    // Write to buffer and return as base64
    const buffer = await ExcelHelper.writeToBuffer(workbook);
    const base64Data = buffer.toString('base64');
    const fileName = `export-produk-${Date.now()}.xlsx`;

    return c.json({
      filename: fileName,
      data: base64Data,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  } catch (error) {
    logError(error, { context: 'Export error:' });
    return c.json({ error: 'Gagal export produk' }, 500);
  }
});

// Import Products from Excel - Full implementation with Hono multipart
// Rate limited: 3 imports per 15 minutes (heavy operation)
importExport.post('/import', strictRateLimiter({ max: 3 }), authMiddleware, ownerOrManager, async (c) => {
  let tempFilePath: string | null = null;
  
  // File size limit: 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  
  try {
    // Parse multipart form data
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'File tidak ditemukan' }, 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ 
        error: `Ukuran file terlalu besar. Maksimal ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
      }, 400);
    }

    const fileExtension = path.extname(file.name).toLowerCase();
    
    if (!['.xlsx', '.xls'].includes(fileExtension)) {
      return c.json({ error: 'Format file tidak didukung. Gunakan Excel (.xlsx atau .xls)' }, 400);
    }

    // Read file as buffer and parse directly (ESM compatible)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Parse Excel - read "Template Import" sheet
    const workbook = await ExcelHelper.readFromBuffer(buffer);
    
    // Try to find the template sheet
    const sheetName = 'Template Import';
    const worksheet = workbook.getWorksheet(sheetName) || 
                      workbook.worksheets.find(ws => ws.name.toLowerCase().includes('template')) ||
                      workbook.worksheets[0];
    
    if (!worksheet) {
      return c.json({ error: 'Sheet tidak ditemukan. Pastikan file Excel memiliki sheet dengan data.' }, 400);
    }
    
    // Parse with header row at index 2 (row 2 in Excel - row 1 is group header)
    const products_data = ExcelHelper.worksheetToJSON(worksheet, 2);

    if (products_data.length === 0) {
      return c.json({ error: 'File kosong atau format tidak valid. Pastikan Sheet "Template Import" berisi data dengan header di baris 2.' }, 400);
    }

    // Get all categories and cabangs
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const categories = await prisma.category.findMany({
      where: { tenantId }
    });
    const cabangs = await prisma.cabang.findMany();

    const errors: any[] = [];
    const success: any[] = [];
    const productsToCreate = new Map<string, any>();

    // Collect all SKUs from Excel first
    const allSkus = products_data
      .map((row: any) => row['SKU']?.toString().trim() || row['SKU*']?.toString().trim())
      .filter(Boolean);
    
    // Check for duplicate SKUs within Excel file
    const skuCounts = new Map<string, number[]>();
    allSkus.forEach((sku, idx) => {
      if (!skuCounts.has(sku)) {
        skuCounts.set(sku, []);
      }
      skuCounts.get(sku)!.push(idx + 2); // +2 because: +1 for header, +1 for 1-based indexing
    });
    
    const duplicateSkus = Array.from(skuCounts.entries()).filter(([_, rows]) => rows.length > 1);
    if (duplicateSkus.length > 0) {
      duplicateSkus.forEach(([sku, rows]) => {
        errors.push({ 
          error: `SKU "${sku}" duplikat ditemukan di baris: ${rows.join(', ')}. Setiap SKU harus unik.` 
        });
      });
    }

    // Fetch existing SKUs with product and stock data for upsert
    const existingVariants = await prisma.productVariant.findMany({
      where: { sku: { in: allSkus } },
      include: {
        product: { include: { category: true } },
        stocks: { include: { cabang: true } }
      }
    });
    
    const existingVariantsMap = new Map(
      existingVariants.map(v => [v.sku, v])
    );

    // Process each row
    for (let i = 0; i < products_data.length; i++) {
      const row = products_data[i];
      const rowNum = i + 2;

      try {
        const hasData = Object.values(row).some(val => val !== '' && val !== null && val !== undefined);
        if (!hasData) continue;

        // Support both formats (with and without asterisks) - WITH SANITIZATION
        const sku = sanitizeSku(row['SKU*'] || row['SKU']);
        const productName = sanitizeString(row['Nama Produk*'] || row['Nama Produk'], 200);
        const categoryName = sanitizeString(row['Kategori*'] || row['Kategori'], 100);
        const productType = sanitizeString(row['Tipe Produk*'] || row['Tipe Produk'], 10)?.toUpperCase();
        const price = sanitizePositiveInt(row['Harga*'] || row['Harga']);
        const stockRaw = row['Stok*'] || row['Stok'];
        const stock = sanitizePositiveInt(stockRaw);
        const cabangName = sanitizeString(row['Cabang*'] || row['Cabang'], 100);
        
        // Parse alert data (optional) - WITH SANITIZATION
        const minAlert = row['Min Alert'] ? sanitizePositiveInt(row['Min Alert']) : null;
        const alertActive = sanitizeString(row['Alert Active'])?.toLowerCase();
        const isAlertActive = alertActive === 'yes' || alertActive === 'ya' || alertActive === '1' || alertActive === 'true';

        // Validate required fields (stock defaults to 0 if empty)
        if (!sku || !productName || !categoryName || !productType || isNaN(price) || !cabangName) {
          errors.push({ row: rowNum, error: 'Data tidak lengkap. Pastikan SKU, Nama Produk, Kategori, Tipe Produk, Harga, dan Cabang diisi' });
          continue;
        }
        
        // Validate stock is a valid number (including 0)
        if (isNaN(stock) || stock < 0) {
          errors.push({ row: rowNum, error: 'Stok harus berupa angka >= 0' });
          continue;
        }

        if (!['SINGLE', 'VARIANT'].includes(productType)) {
          errors.push({ row: rowNum, error: 'Tipe Produk harus SINGLE atau VARIANT' });
          continue;
        }

        const category = categories.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase());
        if (!category) {
          errors.push({ row: rowNum, error: `Kategori "${categoryName}" tidak ditemukan` });
          continue;
        }

        const cabang = cabangs.find(cab => cab.name.toLowerCase() === cabangName.toLowerCase());
        if (!cabang) {
          errors.push({ row: rowNum, error: `Cabang "${cabangName}" tidak ditemukan` });
          continue;
        }

        // UPSERT: Check if SKU exists
        const existingVariant = existingVariantsMap.get(sku);
        
        if (existingVariant) {
          const existingProduct = existingVariant.product;
          
          if (existingProduct.productType !== productType) {
            errors.push({ row: rowNum, error: `SKU "${sku}" sudah terdaftar dengan tipe ${existingProduct.productType}` });
            continue;
          }
          
          const existingStock = existingVariant.stocks.find(s => s.cabangId === cabang.id);
          
          if (existingStock) {
            await prisma.stock.update({
              where: { id: existingStock.id },
              data: { quantity: stock, price: price }
            });
            
            // Handle alert update/create for existing variant
            if (minAlert !== null && minAlert > 0) {
              await prisma.stockAlert.upsert({
                where: {
                  productVariantId_cabangId: {
                    productVariantId: existingVariant.id,
                    cabangId: cabang.id
                  }
                },
                update: {
                  minStock: minAlert,
                  isActive: isAlertActive
                },
                create: {
                  productVariantId: existingVariant.id,
                  cabangId: cabang.id,
                  minStock: minAlert,
                  isActive: isAlertActive
                }
              });
            }
            
            success.push({
              row: rowNum, sku, product: productName, action: 'updated',
              message: `Stock di ${cabangName} diupdate: ${stock} pcs @ Rp ${price.toLocaleString('id-ID')}${minAlert ? ` (Alert: ${minAlert})` : ''}`
            });
            
            emitStockUpdated({
              productId: existingProduct.id,
              variantId: existingVariant.id,
              cabangId: cabang.id,
              quantity: stock,
              price: price
            }, cabang.id, tenantId);
          } else {
            await prisma.stock.create({
              data: { productVariantId: existingVariant.id, cabangId: cabang.id, quantity: stock, price: price }
            });
            
            // Handle alert create for new stock
            if (minAlert !== null && minAlert > 0) {
              await prisma.stockAlert.upsert({
                where: {
                  productVariantId_cabangId: {
                    productVariantId: existingVariant.id,
                    cabangId: cabang.id
                  }
                },
                update: {
                  minStock: minAlert,
                  isActive: isAlertActive
                },
                create: {
                  productVariantId: existingVariant.id,
                  cabangId: cabang.id,
                  minStock: minAlert,
                  isActive: isAlertActive
                }
              });
            }
            
            success.push({
              row: rowNum, sku, product: productName, action: 'stock_added',
              message: `Stock baru ditambahkan di ${cabangName}: ${stock} pcs @ Rp ${price.toLocaleString('id-ID')}${minAlert ? ` (Alert: ${minAlert})` : ''}`
            });
            
            emitStockUpdated({
              productId: existingProduct.id,
              variantId: existingVariant.id,
              cabangId: cabang.id,
              quantity: stock,
              price: price
            }, cabang.id, tenantId);
          }
          continue;
        }
        
        // NEW SKU - CREATE mode
        const productKey = productName.toLowerCase();
        
        if (!productsToCreate.has(productKey)) {
          productsToCreate.set(productKey, {
            name: productName,
            description: sanitizeText(row['Deskripsi'], 1000), // Sanitize description
            categoryId: category.id,
            productType,
            isActive: true,
            variants: []
          });
        }

        const productData = productsToCreate.get(productKey);

        if (productData.productType !== productType) {
          errors.push({ row: rowNum, error: `Produk "${productName}" memiliki tipe yang berbeda dalam file` });
          continue;
        }

        // Parse variant attributes - WITH SANITIZATION
        let variantName = 'Default';
        let variantValue = 'Default';
        
        if (productType === 'VARIANT') {
          const types: string[] = [];
          const values: string[] = [];
          
          for (let n = 1; n <= 3; n++) {
            const typeN = sanitizeString(row[`Type ${n}`], 50);
            const valueN = sanitizeString(row[`Value ${n}`], 50);
            if (typeN && valueN) {
              types.push(typeN);
              values.push(valueN);
            }
          }
          
          if (types.length === 0) {
            errors.push({ row: rowNum, error: 'Produk VARIANT harus memiliki minimal 1 pasang Type dan Value' });
            continue;
          }
          
          variantName = types.join(' | ');
          variantValue = values.join(' | ');
        }

        // Sanitize dimensions and URL
        const weight = row['Berat (g)'] ? sanitizePositiveInt(row['Berat (g)']) : null;
        const length = row['Panjang (cm)'] ? sanitizePositiveInt(row['Panjang (cm)']) : null;
        const width = row['Lebar (cm)'] ? sanitizePositiveInt(row['Lebar (cm)']) : null;
        const height = row['Tinggi (cm)'] ? sanitizePositiveInt(row['Tinggi (cm)']) : null;
        const imageUrl = sanitizeUrl(row['Link Gambar']);

        productData.variants.push({
          sku, variantName, variantValue, weight, length, width, height, imageUrl,
          stocks: [{ cabangId: cabang.id, quantity: stock, price: price }],
          alert: minAlert !== null && minAlert > 0 ? { minStock: minAlert, isActive: isAlertActive, cabangId: cabang.id } : null
        });

      } catch (error: any) {
        errors.push({ row: rowNum, error: error.message });
      }
    }

    // Preview mode
    const isPreview = c.req.query('preview') === 'true';
    
    if (isPreview) {
      if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      
      return c.json({
        preview: true,
        success: errors.length === 0,
        totalRows: products_data.length,
        validRows: productsToCreate.size,
        invalidRows: errors.length,
        productsToCreate: Array.from(productsToCreate.values()).map(p => ({
          name: p.name, type: p.productType, variants: p.variants.length,
          category: categories.find(cat => cat.id === p.categoryId)?.name
        })),
        errors
      });
    }

    // Create products in database
    for (const [, productData] of productsToCreate) {
      try {
        // Validate: VARIANT must have at least 2 variants
        if (productData.productType === 'VARIANT' && productData.variants.length < 2) {
          errors.push({ 
            product: productData.name, 
            error: `Produk VARIANT harus memiliki minimal 2 varian (ditemukan ${productData.variants.length}). Ubah ke SINGLE jika hanya 1 varian.` 
          });
          continue;
        }
        
        // Validate: SINGLE should have exactly 1 variant
        if (productData.productType === 'SINGLE' && productData.variants.length > 1) {
          errors.push({ 
            product: productData.name, 
            error: `Produk SINGLE tidak boleh memiliki lebih dari 1 varian (ditemukan ${productData.variants.length}). Ubah ke VARIANT atau gabungkan data.` 
          });
          continue;
        }
        
        const variantValues = productData.variants.map((v: any) => v.variantValue);
        const duplicates = variantValues.filter((val: string, idx: number) => variantValues.indexOf(val) !== idx);
        
        if (duplicates.length > 0) {
          errors.push({ product: productData.name, error: `Variant duplikat: "${duplicates[0]}"` });
          continue;
        }

        const product = await prisma.product.create({
          data: {
            name: productData.name,
            description: productData.description,
            categoryId: productData.categoryId,
            productType: productData.productType,
            isActive: productData.isActive,
            tenantId: tenantId,
            variants: {
              create: productData.variants.map((v: any) => ({
                sku: v.sku,
                variantName: v.variantName,
                variantValue: v.variantValue,
                weight: v.weight,
                length: v.length,
                width: v.width,
                height: v.height,
                imageUrl: v.imageUrl,
                stocks: { create: v.stocks }
              }))
            }
          },
          include: { variants: { include: { stocks: true } } }
        });
        
        // Create alerts after product creation
        for (const variant of productData.variants) {
          if (variant.alert) {
            const createdVariant = product.variants.find(pv => pv.sku === variant.sku);
            if (createdVariant) {
              await prisma.stockAlert.create({
                data: {
                  productVariantId: createdVariant.id,
                  cabangId: variant.alert.cabangId,
                  minStock: variant.alert.minStock,
                  isActive: variant.alert.isActive
                }
              });
            }
          }
        }

        success.push({
          product: product.name, variants: product.variants.length, action: 'created',
          message: `Berhasil import produk baru dengan ${product.variants.length} varian`
        });

        emitProductCreated(product, tenantId);

      } catch (error: any) {
        let errorMsg = 'Gagal membuat produk';
        if (error.code === 'P2002') {
          if (error.meta?.target?.includes('sku')) errorMsg = 'SKU sudah terdaftar';
          else errorMsg = `Data duplikat: ${error.meta?.target?.join(', ') || 'unknown'}`;
        }
        errors.push({ product: productData.name, error: errorMsg });
      }
    }

    // Cleanup temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    const warnings = errors.filter(e => e.type === 'warning');
    const actualErrors = errors.filter(e => e.type !== 'warning');

    return c.json({
      success: success.length > 0,
      imported: success.length,
      failed: actualErrors.length,
      warnings: warnings.length,
      details: { success, errors: actualErrors, warnings }
    });

  } catch (error: any) {
    logError(error, { context: 'Import error:' });
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    return c.json({ error: 'Gagal import produk: ' + error.message }, 500);
  }
});

export default importExport;
