const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedTenant(tenantData) {
  const { name, slug, ownerEmail, kasirEmail } = tenantData;
  
  console.log(`\n📦 Seeding tenant: ${name}`);
  
  // ============ TENANT ============
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: {
      name,
      slug,
      isActive: true
    }
  });

  console.log('  ✅ Tenant created:', tenant.name);

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

  console.log('  ✅ Cabang created:', cabangPusat.name);

  // ============ USERS ============
  const hashedOwnerPassword = await bcrypt.hash('owner123', 10);
  const hashedKasirPassword = await bcrypt.hash('kasir123', 10);
  
  // Owner - akses semua cabang
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      password: hashedOwnerPassword,
      cabangId: null,
      hasMultiCabangAccess: true,
      tenantId: tenant.id
    },
    create: {
      email: ownerEmail,
      password: hashedOwnerPassword,
      name: `Owner ${name}`,
      role: 'OWNER',
      cabangId: null,
      hasMultiCabangAccess: true,
      tenantId: tenant.id
    }
  });

  console.log('  ✅ Owner created:', owner.email);

  // Kasir - hanya 1 cabang
  const kasir = await prisma.user.upsert({
    where: { email: kasirEmail },
    update: {
      password: hashedKasirPassword,
      tenantId: tenant.id
    },
    create: {
      email: kasirEmail,
      password: hashedKasirPassword,
      name: `Kasir ${name}`,
      role: 'KASIR',
      cabangId: cabangPusat.id,
      hasMultiCabangAccess: false,
      tenantId: tenant.id
    }
  });

  console.log('  ✅ Kasir created:', kasir.email);

  // ============ CATEGORIES ============
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

  console.log('  ✅ Categories created:', categories.length);

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

  console.log('  ✅ Settings created:', settingsData.length);

  // ============ PRINTER SETTINGS ============
  // storeName diambil dari tenant.name (NO HARDCODE!)
  await prisma.printerSettings.upsert({
    where: { cabangId: cabangPusat.id },
    update: {
      storeName: tenant.name  // Sync from tenant
    },
    create: {
      cabang: { connect: { id: cabangPusat.id } },
      storeName: tenant.name,  // From tenant.name
      branchName: 'Cabang Pusat',
      address: 'Jl. Utama No. 1',
      phone: '081234567890',
      footerText1: 'Terima kasih telah berbelanja!',
      footerText2: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan'
    }
  });

  console.log('  ✅ Printer settings created (storeName synced from tenant)');

  return {
    tenant,
    cabangPusat,
    owner,
    kasir,
    categoriesCount: categories.length,
    settingsCount: settingsData.length
  };
}

async function main() {
  console.log('🌱 Seeding database...');
  console.log('');

  // ============ SALES CHANNELS (GLOBAL) ============
  const channelData = [
    { code: 'POS', name: 'Point of Sale', type: 'POS', isBuiltIn: true },
    { code: 'WHATSAPP', name: 'WhatsApp', type: 'SOCIAL' },
    { code: 'TOKOPEDIA', name: 'Tokopedia', type: 'MARKETPLACE' },
    { code: 'SHOPEE', name: 'Shopee', type: 'MARKETPLACE' }
  ];

  const channels = await Promise.all(
    channelData.map(ch =>
      prisma.salesChannel.upsert({
        where: { code: ch.code },
        update: {},
        create: {
          code: ch.code,
          name: ch.name,
          type: ch.type,
          isBuiltIn: ch.isBuiltIn || false,
          isActive: true
        }
      })
    )
  );

  console.log('✅ Sales Channels created:', channels.length);

  // ============ SEED TENANT 1: Demo Store ============
  const demoStore = await seedTenant({
    name: 'Demo Store',
    slug: 'demo-store',
    ownerEmail: 'owner@demo.com',
    kasirEmail: 'kasir@demo.com'
  });

  // ============ SEED TENANT 2: Harapan Abah ============
  const harapanAbah = await seedTenant({
    name: 'Harapan Abah',
    slug: 'harapan-abah',
    ownerEmail: 'owner@harapanabah.com',
    kasirEmail: 'kasir@harapanabah.com'
  });

  // ============ SUMMARY ============
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('🎉 Seeding completed successfully!');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('📋 Demo Accounts:');
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│ TENANT 1: Demo Store                    │');
  console.log('├─────────────────────────────────────────┤');
  console.log('│ OWNER                                   │');
  console.log('│   Email    : owner@demo.com             │');
  console.log('│   Password : owner123                   │');
  console.log('├─────────────────────────────────────────┤');
  console.log('│ KASIR                                   │');
  console.log('│   Email    : kasir@demo.com             │');
  console.log('│   Password : kasir123                   │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│ TENANT 2: Harapan Abah                  │');
  console.log('├─────────────────────────────────────────┤');
  console.log('│ OWNER                                   │');
  console.log('│   Email    : owner@harapanabah.com      │');
  console.log('│   Password : owner123                   │');
  console.log('├─────────────────────────────────────────┤');
  console.log('│ KASIR                                   │');
  console.log('│   Email    : kasir@harapanabah.com      │');
  console.log('│   Password : kasir123                   │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
  console.log('📦 Data Created:');
  console.log('   • 2 Tenants (Demo Store, Harapan Abah)');
  console.log('   • 2 Cabangs (1 per tenant)');
  console.log('   • 4 Users (2 per tenant)');
  console.log(`   • ${demoStore.categoriesCount * 2} Categories total`);
  console.log(`   • ${channels.length} Sales Channels (global)`);
  console.log(`   • ${demoStore.settingsCount * 2} App Settings total`);
  console.log('   • 2 Printer Settings (storeName synced from tenant.name)');
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
