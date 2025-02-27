import { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface ProductList {
  products: Product[];
}

export interface GetProductRequest {
  id: string;
}

interface NextCall {
  trx?: any; 
}
interface CallExtension {
  nextCall?: NextCall;
}

export type GrpcCallback<T> = sendUnaryData<T>;
export type GrpcCall<T> = ServerUnaryCall<T, any> & {
  call?: CallExtension;
};
