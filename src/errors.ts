import { status } from '@grpc/grpc-js';

interface GrpcError {
  code: status;
  message: string;
  details?: string;
}

export const grpcInternalErrorMessage = (message?: string): GrpcError => ({
  code: status.INTERNAL,
  message: message || 'Internal error',
  details: 'An internal error occurred'
});

export const grpcNotFoundErrorMessage = (message?: string): GrpcError => ({
  code: status.NOT_FOUND,
  message: message || 'Not found',
  details: 'The requested resource was not found'
});
