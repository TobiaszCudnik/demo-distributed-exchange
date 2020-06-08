export type TServerID = string;
export type TOrderID = string;

// TODO BigInt
export interface IOrder {
  id: TOrderID;
  fromProduct: PRODUCT;
  fromAmount: number;
  toProduct: PRODUCT;
  toAmount: number;
  type: ORDER_TYPE;
  // TODO expiration: Date
}

export interface IServerOrder extends IOrder {
  serverID: TServerID;
  // present only on the server owning the order
  remoteLock?: ILock;
  localLock?: boolean;
  executed?: {
    time: string;
    serverID: TServerID;
  };
  closed?: boolean;
}

export interface IReq {
  reqType: REQ_TYPES;
  // sender ID
  reqSender: TServerID;
  // optional request destination
  reqReceiver?: TServerID;
}

// ----- ----- -----
// ----- REQUESTS
// ----- ----- -----

export enum REQ_TYPES {
  CLIENT_ORDER_ADD = "ClientOrderAdd",
  ORDER_ADD = "OrderAdd",
  ORDER_LOCK = "OrderLock",
  ORDER_EXECUTE = "OrderExecute",
  ORDER_CLOSE = "OrderExecute"
}

export interface IClientOrderAddReq extends IReq {
  // server which should handle the request
  // TODO tmp, remove
  reqReceiver: string;
  order: IOrder;
  reqType: REQ_TYPES.CLIENT_ORDER_ADD;
}

export interface IOrderAddReq extends IReq {
  order: IServerOrder;
  reqType: REQ_TYPES.ORDER_ADD;
}

export interface IOrderLockReq extends IReq {
  orderID: TOrderID;
  reqType: REQ_TYPES.ORDER_LOCK;
}

export interface IOrderExecuteReq extends IReq {
  orderID: TOrderID;
  reqType: REQ_TYPES.ORDER_EXECUTE;
}

export interface IOrderCloseReq extends IReq {
  orderID: TOrderID;
  reqType: REQ_TYPES.ORDER_EXECUTE;
}

// ----- ----- -----
// ----- RESPONSES
// ----- ----- -----

export interface IClientOrderAddRes {
  isAccepted: boolean;
}

export interface IOrderAddRes {
  isAccepted: boolean;
  serverID: string;
}

export interface IOrderLockRes {
  lockID: string;
}

// ----- ----- -----
// ----- ENUMS
// ----- ----- -----

export enum PRODUCT {
  USD = "usd",
  BTC = "btc",
  ETH = "eth"
}
// TODO get the the enum
export const products = ["usd", "btc", "eth"];

export enum ORDER_TYPE {
  ALL_OR_NONE
  // TODO others
}

export type THandler = {
  reply(err: Error | undefined | null, payload?: object): void;
};

export interface ILock {
  // ID of the lock
  id: string;
  // server who owns the lock
  serverID: TServerID;
  // time when the lock was created
  time: string;
}
