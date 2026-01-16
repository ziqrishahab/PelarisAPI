const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');
  console.log('');

  // ============ TENANT ============
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-store' },
    update: {},
    create: {
      name: 'Demo Store',
      slug: 'demo-store',
      isActive: true
    }
  });

  console.log('✅ Tenant created:', tenant.name);

  // ============ CABANG ============
  const cabangPusat = await prisma.cabang.upsert({
    where: { 
      tenantId_name: {
        tenantId: tenant.id,
        name: 'Cabang Pusat'
      }
    },
    update: {},
    create: {
      name: 'Cabang Pusat',
      address: 'Jl. Utama No. 1',
      phone: '081234567890',
      tenantId: tenant.id
    }
  });

  console.log('✅ Cabang created:', cabangPusat.name);

  // ============ USERS ============
  const hashedOwnerPassword = await bcrypt.hash('owner123', 10);
  const hashedKasirPassword = await bcrypt.hash('kasir123', 10);
  
  // Owner - akses semua cabang
  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.com' },
    update: {
      password: hashedOwnerPassword,
      cabangId: null,
      hasMultiCabangAccess: true,
      tenantId: tenant.id
    },
    create: {
      email: 'owner@demo.com',
      password: hashedOwnerPassword,
      name: 'Owner Demo',
      role: 'OWNER',
      cabangId: null,
      hasMultiCabangAccess: true,
      tenantId: tenant.id
    }
  });

  console.log('✅ Owner created:', owner.email);

  // Kasir - hanya 1 cabang
  const kasir = await prisma.user.upsert({
    where: { email: 'kasir@demo.com' },
    update: {
      password: hashedKasirPassword,
      tenantId: tenant.id
    },
    create: {
      email: 'kasir@demo.com',
      password: hashedKasirPassword,
      name: 'Kasir Demo',
      role: 'KASIR',
      cabangId: cabangPusat.id,
      hasMultiCabangAccess: false,
      tenantId: tenant.id
    }
  });

  console.log('✅ Kasir created:', kasir.email);

  // ============ CATEGORIES ============
  // Generic categories untuk berbagai jenis usaha
  const categoryData = [
    { name: 'Makanan', description: 'Produk makanan dan snack' },
    { name: 'Minuman', description: 'Produk minuman' },
    { name: 'Pakaian', description: 'Produk fashion dan pakaian' },
    { name: 'Elektronik', description: 'Produk elektronik dan gadget' },
    { name: 'Lainnya', description: 'Produk lainnya' }
  ];

  const categories = await Promise.all(
    categoryData.map(cat => 
      prisma.category.upsert({
        where: { 
          tenantId_name: {
            tenantId: tenant.id,
            name: cat.name
          }
        },
        update: {},
        create: {
          tenantId: tenant.id,
          name: cat.name,
          description: cat.description
        }
      })
    )
  );

  console.log('✅ Categories created:', categories.length);

  // ============ CHANNELS ============
  const channelData = [
    { name: 'POS', description: 'Point of Sale - penjualan langsung di toko' },
    { name: 'Online', description: 'Penjualan online via website/app' },
    { name: 'WhatsApp', description: 'Penjualan via WhatsApp' },
    { name: 'Marketplace', description: 'Penjualan via marketplace (Tokopedia, Shopee, dll)' }
  ];

  const channels = await Promise.all(
    channelData.map(ch =>
      prisma.channel.upsert({
        where: { name: ch.name },
        update: {},
        create: {
          name: ch.name,
          description: ch.description
        }
      })
    )
  );

  console.log('✅ Channels created:', channels.length);

  // ============ SETTINGS ============
  const settingsData = [
    // Return/Exchange settings
    { key: 'returnEnabled', value: 'true' },
    { key: 'returnDeadlineDays', value: '7' },
    { key: 'returnRequiresApproval', value: 'true' },
    { key: 'exchangeEnabled', value: 'true' },
    // General settings
    { key: 'currency', value: 'IDR' },
    { key: 'taxRate', value: '0' },
    { key: 'receiptFooter', value: 'Terima kasih telah berbelanja!' }
  ];

  await Promise.all(
    settingsData.map(setting =>
      prisma.settings.upsert({
        where: { 
          tenantId_key: { 
            tenantId: tenant.id, 
            key: setting.key 
          } 
        },
        update: { value: setting.value },
        create: { 
          tenantId: tenant.id,
          key: setting.key, 
          value: setting.value 
        }
      })
    )
  );

  console.log('✅ Settings created:', settingsData.length);

  // ============ PRINTER SETTINGS ============
  await prisma.printerSettings.upsert({
    where: { cabangId: cabangPusat.id },
    update: {},
    create: {
      cabangId: cabangPusat.id,
      storeName: 'Demo Store',
      storeAddress: 'Jl. Utama No. 1',
      storePhone: '081234567890',
      footerText: 'Terima kasih telah berbelanja!',
      showLogo: true,
      paperWidth: 58
    }
  });

  console.log('✅ Printer settings created');

  // ============ SUMMARY ============
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('🎉 Seeding completed successfully!');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('📋 Demo Accounts:');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│ OWNER                                   │');
  console.log('│   Email    : owner@demo.com             │');
  console.log('│   Password : owner123                   │');
  console.log('│   Access   : All branches               │');
  console.log('├─────────────────────────────────────────┤');
  console.log('│ KASIR                                   │');
  console.log('│   Email    : kasir@demo.com             │');
  console.log('│   Password : kasir123                   │');
  console.log('│   Access   : Cabang Pusat only          │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
  console.log('📦 Data Created:');
  console.log('   • 1 Tenant (Demo Store)');
  console.log('   • 1 Cabang (Cabang Pusat)');
  console.log('   • 2 Users (Owner + Kasir)');
  console.log(`   • ${categories.length} Categories`);
  console.log(`   • ${channels.length} Sales Channels`);
  console.log(`   • ${settingsData.length} App Settings`);
  console.log('   • 1 Printer Settings');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
