import './instrument';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import * as Sentry from '@sentry/node';
import { grpcInternalErrorMessage, grpcNotFoundErrorMessage } from './errors';
import { Product, ProductList, GetProductRequest, GrpcCall, GrpcCallback } from './types/grpc';
// Load the protobuf
const PROTO_PATH = path.join(__dirname, 'product.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

interface ProtoType {
  product: {
    ProductService: grpc.ServiceClientConstructor;
  };
}
const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as ProtoType;

const prisma = new PrismaClient();

function timingInterceptor(methodDescriptor: any, nextCall: any) {
  //print metadata
  console.log('metadataInterceptor:', nextCall.metadata.getMap());
  const startTime = process.hrtime();
  console.log(`[Timing] ${methodDescriptor.path} started`);

  return new grpc.ServerInterceptingCall(nextCall, {
    start: (next) => {
      next();
    },
    sendMessage: (message, next) => {
      next(message);
    },
    sendStatus: (status, next) => {
      console.log('status: ', status);
      const endTime = process.hrtime(startTime);
      const duration = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2);
      console.log(`[Timing] ${methodDescriptor.path} took ${duration}ms`);
      
      // Track timing in Sentry
      Sentry.addBreadcrumb({
        category: 'grpc',
        message: `${methodDescriptor.path} duration`,
        data: {
          duration: `${duration}ms`,
          status: status.code,
          path: methodDescriptor.path,
          service: 'grpc-product-service', //maybe it is not necessary services is already in the path
          userId: nextCall.metadata.get('userid') //check if we need to redact this
        },
        level: 'info'
      });
      next(status);
    }
  });
}

// gRPC service implementations with TypeScript
const productService = {
  getProduct: async (
    call: GrpcCall<GetProductRequest>,
    callback: GrpcCallback<Product>
  ) => {
    try {
      const product = await prisma.product.findUnique({
        where: { id: Number(call.request.id) },
      });
      //intentional error to test sentry distributed tracing
      throw new Error('This is a test error');

      // if (!product) {
      //   return callback(grpcNotFoundErrorMessage('Product not found'), null);
      // }

      // callback(null, product as unknown as Product);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error in getProduct:', error);
      callback(grpcInternalErrorMessage(error instanceof Error ? error.message : 'Unknown error'), null);
    }
  },

  updateProduct: async (
    call: GrpcCall<Product>,
    callback: GrpcCallback<Product>
  ) => {
    try {
      const existingProduct = await prisma.product.findUnique({
        // where: { id: call.request.productId }, // it is call.request.id but it is wrong intentionally error to test Sentry
        where: { id: Number(call.request.id) }, // it is call.request.id but it is wrong intentionally error to test Sentry
        
      });

      if (!existingProduct) {
        return callback(grpcNotFoundErrorMessage('Product not found for update'));
      }

      const { id, ...updateData } = call.request;
      const product = await prisma.product.update({
        where: { id: Number(id) },
        data: updateData,
      });
      callback(null, product as unknown as Product);
    } catch (error) {
      Sentry.captureException(error);
      callback(grpcInternalErrorMessage(`Failed to update product: ${(error as any).message}`));
    }
  },

  findProducts: async (
    call: GrpcCall<{}>,
    callback: GrpcCallback<ProductList>
  ) => {
    try {
      const products = await prisma.product.findMany();
      throw new Error('This is a test error');
      const mappedProducts = products.map(p => ({ ...p, id: String(p.id) } as unknown as Product));
      callback(null, { products: mappedProducts });
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error in findProducts:', error);
      callback(grpcInternalErrorMessage(`Failed to fetch products: ${(error as any).message}`));
    }
  },
};


// Define gRPC server
const server = new grpc.Server(
  {
    interceptors: [timingInterceptor]
  }
);

// Add the product service to the gRPC server with interceptor
server.addService(proto.product.ProductService.service, productService);

// Start the gRPC server
const port = '0.0.0.0:50051';
server.bindAsync(port, grpc.ServerCredentials.createInsecure(), (error, port) => {
  if (error) {
    Sentry.captureException(error);
    console.error('Failed to start server:', error);
    return;
  }
  console.log(`Server running at ${port}`);
});
