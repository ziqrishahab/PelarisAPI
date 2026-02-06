const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const counts = {
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    stocks: await prisma.stock.count()
  };
  console.log('Data counts:', counts);
  await prisma.$disconnect();
})();
