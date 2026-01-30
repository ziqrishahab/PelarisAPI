/**
 * Swagger/OpenAPI Documentation for Pelaris.id API
 */

import { Hono } from 'hono';

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Pelaris.id API',
    description: 'REST API untuk Pelaris.id Omnichannel POS System',
    version: '2.0.0',
    contact: {
      name: 'Pelaris.id Team',
      email: 'dev@pelaris.id'
    }
  },
  servers: [
    {
      url: 'http://localhost:5100/api',
      description: 'Development server'
    },
    {
      url: 'https://api.pelaris.id/api',
      description: 'Production server'
    }
  ],
  tags: [
    { name: 'Auth', description: 'Authentication & User Management' },
    { name: 'Products', description: 'Product & Category Management' },
    { name: 'Transactions', description: 'POS Transactions' },
    { name: 'Stock', description: 'Stock Management & Transfers' },
    { name: 'Returns', description: 'Return/Refund Management' },
    { name: 'Cabang', description: 'Branch Management' },
    { name: 'Reports', description: 'Sales Reports & Analytics' },
    { name: 'Settings', description: 'System Settings' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'token'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['OWNER', 'MANAGER', 'ADMIN', 'KASIR'] },
          cabangId: { type: 'string', nullable: true },
          hasMultiCabangAccess: { type: 'boolean' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          categoryId: { type: 'string' },
          productType: { type: 'string', enum: ['SINGLE', 'VARIANT'] },
          isActive: { type: 'boolean' },
          category: { $ref: '#/components/schemas/Category' },
          variants: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProductVariant' }
          }
        }
      },
      ProductVariant: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sku: { type: 'string' },
          variantName: { type: 'string' },
          variantValue: { type: 'string' },
          stocks: {
            type: 'array',
            items: { $ref: '#/components/schemas/Stock' }
          }
        }
      },
      Stock: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          quantity: { type: 'integer' },
          price: { type: 'number' },
          cabangId: { type: 'string' }
        }
      },
      Category: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          _count: {
            type: 'object',
            properties: {
              products: { type: 'integer' }
            }
          }
        }
      },
      Cabang: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          address: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          isActive: { type: 'boolean' }
        }
      },
      Transaction: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          transactionNo: { type: 'string' },
          subtotal: { type: 'number' },
          discount: { type: 'number' },
          tax: { type: 'number' },
          total: { type: 'number' },
          paymentMethod: { type: 'string', enum: ['CASH', 'QRIS', 'TRANSFER', 'DEBIT', 'CREDIT', 'SPLIT'] },
          status: { type: 'string', enum: ['PENDING', 'ONPROCESS', 'SHIPPED', 'COMPLETED', 'CANCELLED'] },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          totalCount: { type: 'integer' },
          totalPages: { type: 'integer' },
          hasNext: { type: 'boolean' },
          hasPrev: { type: 'boolean' }
        }
      }
    }
  },
  security: [
    { bearerAuth: [] },
    { cookieAuth: [] }
  ],
  paths: {
    // ==================== AUTH ====================
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'User login',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' }
                  }
                }
              }
            }
          },
          401: { description: 'Invalid credentials' }
        }
      }
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user info',
        responses: {
          200: {
            description: 'Current user data',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' }
              }
            }
          }
        }
      }
    },
    '/auth/users': {
      get: {
        tags: ['Auth'],
        summary: 'List all users (Owner/Manager only)',
        responses: {
          200: {
            description: 'List of users',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/User' }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Auth'],
        summary: 'Create new user (Owner/Manager only)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name', 'role'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                  name: { type: 'string' },
                  role: { type: 'string', enum: ['MANAGER', 'ADMIN', 'KASIR'] },
                  cabangId: { type: 'string' },
                  hasMultiCabangAccess: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'User created' },
          400: { description: 'Validation error' }
        }
      }
    },
    // ==================== PRODUCTS ====================
    '/products': {
      get: {
        tags: ['Products'],
        summary: 'List products with pagination',
        parameters: [
          { name: 'categoryId', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } }
        ],
        responses: {
          200: {
            description: 'Products list with pagination',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Product' }
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Products'],
        summary: 'Create new product',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'categoryId', 'productType'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  categoryId: { type: 'string' },
                  productType: { type: 'string', enum: ['SINGLE', 'VARIANT'] },
                  variants: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        sku: { type: 'string' },
                        variantName: { type: 'string' },
                        variantValue: { type: 'string' },
                        stocks: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              cabangId: { type: 'string' },
                              quantity: { type: 'integer' },
                              price: { type: 'number' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Product created' }
        }
      }
    },
    '/products/categories': {
      get: {
        tags: ['Products'],
        summary: 'List all categories',
        responses: {
          200: {
            description: 'Categories list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Category' }
                }
              }
            }
          }
        }
      }
    },
    '/products/{id}': {
      get: {
        tags: ['Products'],
        summary: 'Get product by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Product data',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Product' }
              }
            }
          },
          404: { description: 'Product not found' }
        }
      },
      put: {
        tags: ['Products'],
        summary: 'Update product',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  categoryId: { type: 'string' },
                  isActive: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Product updated' },
          404: { description: 'Product not found' }
        }
      },
      delete: {
        tags: ['Products'],
        summary: 'Delete product (soft delete)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Product deleted' },
          404: { description: 'Product not found' }
        }
      }
    },
    '/products/bulk-delete': {
      post: {
        tags: ['Products'],
        summary: 'Bulk delete products',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ids'],
                properties: {
                  ids: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 1
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Products deleted' }
        }
      }
    },
    '/products/stock/{variantId}/{cabangId}': {
      put: {
        tags: ['Stock'],
        summary: 'Update stock quantity and price',
        parameters: [
          { name: 'variantId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'cabangId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['quantity'],
                properties: {
                  quantity: { type: 'integer', minimum: 0 },
                  price: { type: 'number', minimum: 0 },
                  reason: { type: 'string' },
                  notes: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Stock updated' }
        }
      }
    },
    '/products/search/sku/{sku}': {
      get: {
        tags: ['Products'],
        summary: 'Search product by SKU/Barcode',
        parameters: [
          { name: 'sku', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Product found' },
          404: { description: 'Product not found' }
        }
      }
    },
    '/products/template': {
      get: {
        tags: ['Products'],
        summary: 'Download Excel import template',
        responses: {
          200: {
            description: 'Excel template file',
            content: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      }
    },
    '/products/import': {
      post: {
        tags: ['Products'],
        summary: 'Import products from Excel',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Excel file (.xlsx, .xls)'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Import result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    imported: { type: 'integer' },
                    failed: { type: 'integer' },
                    details: {
                      type: 'object',
                      properties: {
                        success: { type: 'array', items: { type: 'string' } },
                        errors: { type: 'array', items: { type: 'object' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/products/export': {
      get: {
        tags: ['Products'],
        summary: 'Export all products to Excel',
        responses: {
          200: {
            description: 'Excel file with all products',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'string', description: 'Base64 encoded file' },
                    filename: { type: 'string' },
                    mimeType: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    // ==================== TRANSACTIONS ====================
    '/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'List transactions with filters',
        parameters: [
          { name: 'cabangId', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } }
        ],
        responses: {
          200: { description: 'Transactions list' }
        }
      },
      post: {
        tags: ['Transactions'],
        summary: 'Create new transaction (POS)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items', 'paymentMethod'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        productVariantId: { type: 'string' },
                        quantity: { type: 'integer' },
                        price: { type: 'number' }
                      }
                    }
                  },
                  paymentMethod: { type: 'string' },
                  discount: { type: 'number' },
                  customerName: { type: 'string' },
                  notes: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Transaction created' }
        }
      }
    },
    '/transactions/reports/summary': {
      get: {
        tags: ['Reports'],
        summary: 'Get sales summary',
        parameters: [
          { name: 'cabangId', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } }
        ],
        responses: {
          200: {
            description: 'Sales summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalSales: { type: 'number' },
                    totalTransactions: { type: 'integer' },
                    averageTransaction: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    },
    // ==================== STOCK ====================
    '/stock/transfers': {
      get: {
        tags: ['Stock'],
        summary: 'List stock transfers',
        responses: {
          200: { description: 'Stock transfers list' }
        }
      },
      post: {
        tags: ['Stock'],
        summary: 'Create stock transfer request',
        responses: {
          201: { description: 'Transfer created' }
        }
      }
    },
    '/stock/adjustments': {
      post: {
        tags: ['Stock'],
        summary: 'Create stock adjustment',
        responses: {
          201: { description: 'Adjustment created' }
        }
      }
    },
    // ==================== RETURNS ====================
    '/returns': {
      get: {
        tags: ['Returns'],
        summary: 'List returns with filters',
        parameters: [
          { name: 'cabangId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'REJECTED', 'COMPLETED'] } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } }
        ],
        responses: {
          200: {
            description: 'Returns list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      returnNo: { type: 'string' },
                      transactionId: { type: 'string' },
                      reason: { type: 'string', enum: ['DAMAGED', 'WRONG_ITEM', 'EXPIRED', 'CUSTOMER_REQUEST', 'OTHER'] },
                      subtotal: { type: 'number' },
                      refundAmount: { type: 'number' },
                      status: { type: 'string' },
                      createdAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Returns'],
        summary: 'Create return request',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['transactionId', 'items', 'reason', 'refundMethod'],
                properties: {
                  transactionId: { type: 'string' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        productVariantId: { type: 'string' },
                        quantity: { type: 'integer' }
                      }
                    }
                  },
                  reason: { type: 'string', enum: ['DAMAGED', 'WRONG_ITEM', 'EXPIRED', 'CUSTOMER_REQUEST', 'OTHER'] },
                  reasonDetail: { type: 'string' },
                  refundMethod: { type: 'string', enum: ['CASH', 'TRANSFER', 'EXCHANGE'] },
                  notes: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Return request created' }
        }
      }
    },
    '/returns/{id}/approve': {
      post: {
        tags: ['Returns'],
        summary: 'Approve return request (Manager only)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Return approved' }
        }
      }
    },
    '/returns/{id}/reject': {
      post: {
        tags: ['Returns'],
        summary: 'Reject return request (Manager only)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  rejectionReason: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Return rejected' }
        }
      }
    },
    // ==================== CABANG ====================
    '/cabang': {
      get: {
        tags: ['Cabang'],
        summary: 'List all branches',
        responses: {
          200: {
            description: 'Branches list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Cabang' }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Cabang'],
        summary: 'Create new branch (Owner only)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  address: { type: 'string' },
                  phone: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Branch created' }
        }
      }
    },
    '/cabang/{id}': {
      put: {
        tags: ['Cabang'],
        summary: 'Update branch',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Branch updated' }
        }
      },
      delete: {
        tags: ['Cabang'],
        summary: 'Delete branch',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Branch deleted' }
        }
      }
    },
    // ==================== SETTINGS ====================
    '/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get all settings',
        responses: {
          200: { description: 'Settings list' }
        }
      }
    },
    '/settings/{key}': {
      put: {
        tags: ['Settings'],
        summary: 'Update setting (Owner only)',
        parameters: [
          { name: 'key', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['value'],
                properties: {
                  value: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Setting updated' }
        }
      }
    }
  }
};

// Swagger UI HTML
const swaggerUIHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pelaris.id API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { color: #1e3a5f; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/docs/spec',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
        persistAuthorization: true
      });
    };
  </script>
</body>
</html>
`;

// Create Hono router for docs
export const docsRouter = new Hono();

// Serve OpenAPI spec as JSON
docsRouter.get('/spec', (c) => {
  return c.json(swaggerSpec);
});

// Serve Swagger UI
docsRouter.get('/', (c) => {
  return c.html(swaggerUIHtml);
});

export default docsRouter;
