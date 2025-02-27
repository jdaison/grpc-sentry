# gRPC Sentry

A gRPC microservice for product management. Features Sentry integration for error tracking, distributed tracing, and performance monitoring.

Use [Koa project](https://github.com/jdaison/koa-sentry) to do request to this gRPC service.

## Prerequisites

- Node.js (v14+)
- Sentry account

## Quick Start

1. Clone the repository:

```bash
git clone https://github.com/jdaison/grpc-sentry.git
cd grpc-sentry
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment:

```bash
cp .env.example .env
# Edit .env with your credentials
```

4. Start the service:

```bash
npm run dev
```

## Tracing

This project includes distributed tracing using Sentry. Below are some example traces captured by Sentry:

### Tracing find products

![Trace find products](./images/trace_find_products.png)

### Tracing get product with error

![Tracing get product with error](./images/trace_get_product_with_error.png)
