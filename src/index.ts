import Sentry from './instrument';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { PrismaClient } from '@prisma/client';
import path from 'path';
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
  const metadata = nextCall.metadata.getMap();
  const sentryTrace = metadata['sentry-trace'];
  const baggage = metadata['baggage'];

  return new grpc.ServerInterceptingCall(nextCall, {
    start: (next) => {
      // Continue the trace using the extracted context
      Sentry.continueTrace({ sentryTrace, baggage }, () => {
        // Start a new span for this request
        Sentry.startSpan(
          {
            name: methodDescriptor.path,
            op: 'grpc.server',
            attributes: {
              'grpc.method': methodDescriptor.path,
              'grpc.service': 'product.ProductService',
              'grpc.status_code': grpc.status.OK,
              'grpc.status_description': 'OK',
              'grpc.userId': metadata['userid'] || 'anonymous'
            },
          },
          (span) => {
            // Store span in the call context for later use
            nextCall.span = span;
            next();
          }
        );
      });
    },
    sendMessage: (message, next) => {
      next(message);
    },
    sendStatus: (status, next) => {
      // Capture failures if needed
      if (status.code !== grpc.status.OK) {
        Sentry.captureException(new Error(`gRPC error: ${status.details}`));
      }
      
      // Finish the span
      if (nextCall.span) {
        nextCall.span.setStatus(status.code === grpc.status.OK ? 'ok' : 'error');
        console.log('nextCall.span: ', nextCall.span);
        
        // nextCall.span.finish();
      }
      
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
      // throw new Error('This is a test error');

      if (!product) {
        return callback(grpcNotFoundErrorMessage('Product not found'), null);
      }

      callback(null, product as unknown as Product);
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
