import { PeerRPCServer, PeerRPCClient } from "grenache-nodejs-http";
import Link from "grenache-nodejs-link";
import {
  IClientOrderAddRes,
  IOrder,
  PRODUCT,
  IReq,
  REQ_TYPES,
  THandler,
  IClientOrderAddReq,
  IServerOrder,
  IOrderAddRes,
  IOrderAddReq,
  TServerID,
  IOrderLockReq,
  IOrderLockRes,
  IOrderExecuteReq,
  IOrderCloseReq
} from "./shared";
import random from "simple-random";
import debug from "debug";

export class OrderBook {
  orders: IServerOrder[] = [];
  id: string;
  // server link
  link: Link;
  peer: PeerRPCClient;
  // TODO type
  service: any;
  log: (...msg: any) => void;

  constructor(port: number) {
    this.id = port.toString();
    this.log = debug(`distex:server:${this.id}`);

    this.log('New OrderBook', this.id)

    this.initServer(port);
    this.initClient();
  }

  initServer(port: number) {
    const link = new Link({
      grape: "http://127.0.0.1:30001"
    });
    link.start();

    const peer = new PeerRPCServer(link, {
      timeout: 300000
    });
    peer.init();

    const service = peer.transport("server");
    // TODO catch EADDRINUSE
    service.listen(port);
    service.on(`request`, this.handleReq.bind(this));

    setInterval(() => {
      link.announce(`orderbook`, service.port, {});
    }, 1000);
  }

  initClient() {
    const link = new Link({
      grape: "http://127.0.0.1:30001"
    });
    link.start();

    this.peer = new PeerRPCClient(link, {});
    this.peer.init();
  }

  handleReq(rid, key, payload: IReq, handler: THandler) {
    // skip own requests
    const isSender = payload.reqSender === this.id;
    // skip requests for another server
    const isReceiver = !payload.reqReceiver || payload.reqReceiver === this.id;

    if (isSender || !isReceiver) {
      return;
    }

    this.log("received", payload.reqType, payload);

    switch (payload.reqType) {
      case REQ_TYPES.CLIENT_ORDER_ADD:
        this.onClientOrderAddReq(payload as IClientOrderAddReq, handler);
        break;

      case REQ_TYPES.ORDER_ADD:
        this.onOrderAddReq(payload as IOrderAddReq, handler);
        break;

      case REQ_TYPES.ORDER_LOCK:
        this.onOrderLockReq(payload as IOrderLockReq, handler);
        break;

      case REQ_TYPES.ORDER_EXECUTE:
        this.onOrderExecuteReq(payload as IOrderExecuteReq, handler);
        break;

      case REQ_TYPES.ORDER_CLOSE:
        this.onOrderCloseReq(payload as IOrderCloseReq, handler);
        break;
    }
  }

  // ----- ----- -----
  // ----- RESPONSE HANDLERS
  // ----- ----- -----

  /**
   * New order reveiced from the (local) client.
   */
  onClientOrderAddReq(payload: IClientOrderAddReq, handler: THandler) {
    // respond to the client
    const resp: IClientOrderAddRes = {
      isAccepted: true
    };
    handler.reply(null, resp);

    const order: IServerOrder = {
      ...payload.order,
      // take ownership of this order
      serverID: this.id
    };

    // store it
    this.orders.push(order);
    // broadcast it to the network
    this.broadcastOrder(order);
  }

  /**
   * New order received from another orderbook.
   */
  onOrderAddReq(payload: IOrderAddReq, handler: THandler) {
    // store the order
    // TODO check for duplicates
    this.orders.push(payload.order);
  }

  /**
   * Another server wants to lock a local order.
   */
  onOrderLockReq(payload: IOrderLockReq, handler: THandler) {
    for (const order of this.orders) {
      if (order.id !== payload.orderID) {
        continue;
      }

      if (order.serverID !== this.id) {
        throw new Error("Ownership error");
      }

      if (order.remoteLock) {
        // existing lock

        if (order.remoteLock.serverID !== payload.reqSender) {
          throw new Error("Order already locked");
        }

        handler.reply(null, {
          lockID: order.remoteLock.id
        });
      } else {
        // new lock

        const id = random();
        order.remoteLock = {
          id,
          serverID: payload.reqSender,
          time: new Date().toISOString()
        };

        handler.reply(null, {
          lockID: id
        });
      }
    }
  }

  /**
   * Another server wants to execute a local order.
   *
   * The order should have been already locked by the same server.
   */
  onOrderExecuteReq(payload: IOrderExecuteReq, handler: THandler) {
    const order = this.orders.find(order => order.id === payload.orderID);

    if (!order) {
      throw new Error(`Missing order ${payload.orderID}`);
    }

    // transfer the funds back to the server which originalted the execution
    this.transferFunds(order.fromProduct, order.fromAmount, payload.reqSender);

    // close the order on other servers
    const req: IOrderCloseReq = {
      orderID: payload.orderID,
      // common
      reqSender: this.id,
      reqType: REQ_TYPES.ORDER_CLOSE
    };
    this.log(req.reqType, req);

    this.peer.map(
      `orderbook`,
      req,
      { timeout: 10000 },
      (err: Error | undefined) => {
        if (err) {
          this.log('ERROR')
          return console.error(err);
        }
        this.log("closed", order.id);
      }
    );
  }

  /**
   * Existing order closed by the (owning) orderbook.
   */
  onOrderCloseReq(payload: IOrderCloseReq, handler: THandler) {
    const order = this.orders.find(order => order.id === payload.orderID);

    if (order) {
      order.closed = true;
    }
  }

  // ----- ----- -----
  // ----- REQUESTS
  // ----- ----- -----

  /**
   * Broadcast a new order to the rest of the network.
   */
  broadcastOrder(order: IServerOrder) {
    // broadcast to other servers
    const req: IOrderAddReq = {
      order,
      // common
      reqSender: this.id,
      reqType: REQ_TYPES.ORDER_ADD
    };
    this.log(req.reqType, req);

    this.peer.map(
      `orderbook`,
      req,
      { timeout: 10000 },
      (err: Error | undefined, data?: IOrderAddRes) => {
        if (err) {
          this.log('ERROR')
          return console.error(err);
        }
        this.log("broadcasted", order.id, "to", data!.serverID);
      }
    );
  }

  // TODO BigInt
  transferFunds(type: PRODUCT, amount: number, destination: TServerID) {
    this.log("Transfering funds", type, destination);
    // TODO
  }

  /**
   * Request a remote lock on a specific order.
   */
  async reqOrderLock(order: IServerOrder) {
    // broadcast to other servers
    const req: IOrderLockReq = {
      orderID: order.id,
      reqReceiver: order.serverID,
      // common
      reqSender: this.id,
      reqType: REQ_TYPES.ORDER_LOCK
    };
    this.log(req.reqType, req);

    return new Promise((resolve, reject) => {
      this.peer.map(
        `orderbook`,
        req,
        { timeout: 10000 },
        (err: Error | undefined, data?: IOrderLockRes) => {
          if (err) {
            return reject(err);
          }
          this.log("locked", order.id, "from", order.serverID);
          resolve(data!.lockID);
        }
      );
    });
  }

  /**
   * Request an order execution (after matching).
   */
  async reqOrderExecute(order: IServerOrder) {
    // broadcast to other servers
    const req: IOrderExecuteReq = {
      orderID: order.id,
      // common
      reqSender: this.id,
      reqType: REQ_TYPES.ORDER_EXECUTE
    };
    this.log(req.reqType, req);

    return new Promise((resolve, reject) => {
      this.peer.map(
        `orderbook`,
        req,
        { timeout: 10000 },
        (err: Error | undefined) => {
          if (err) {
            return reject(err);
          }
          this.log("executed", order.id, "from", order.serverID);
          resolve();
        }
      );
    });
  }

  /**
   * Try to execute a matched order by requesting locks from servers
   * owning the candidates.
   */
  async onOrderMatched(order: IServerOrder, matches: IServerOrder[]) {
    this.log("match", order, matches);

    try {
      // lock the matches
      const locks = await Promise.all(
        matches.map(this.reqOrderLock.bind(this))
      );
      this.log(`Locked ${order.id} with`, locks);

      // execute
      await Promise.all(
        matches.map(async match => {
          this.transferFunds(order.fromProduct, match.toAmount, match.serverID);
          this.reqOrderExecute(match);
        })
      );
    } catch (err) {
      console.error(err);
      // release the local locks
      for (const match of matches) {
        match.localLock = false;
      }
    }
  }

  // ----- ----- -----
  // ----- MATCHER
  // ----- ----- -----

  /**
   * Go through all the LOCAL orders and try to match them
   * against the whole order book (which is shared).
   */
  matchOffers() {
    for (const order of this.orders) {
      // local orders only
      if (order.serverID !== this.id) {
        continue;
      }
      // active only
      if (order.closed) {
        continue;
      }

      const candidates = this.getOrders(order.toProduct, order.fromProduct);
      const toPrice = order.fromAmount / order.toAmount;
      const matches: IServerOrder[] = [];
      let remaining = order.fromAmount;

      for (const candidate of candidates) {
        const oppositeToPrice = candidate.toAmount / candidate.fromAmount;
        // compare the price and amount
        if (oppositeToPrice <= toPrice && remaining >= candidate.toAmount) {
          matches.push(candidate);
          remaining -= candidate.toAmount;
          if (!remaining) {
            // lock all the matches on this tick (as onOrderMatched is a `Promise`)
            for (const match of matches) {
              match.localLock = true;
            }
            this.onOrderMatched(order, matches);
            break;
          }
        }
      }
    }
  }

  getOrders(from: PRODUCT, to: PRODUCT): IServerOrder[] {
    return this.orders.filter(
      order =>
        order.fromProduct === from &&
        order.toProduct === to &&
        !order.localLock &&
        !order.closed
    );
  }
}

export default OrderBook;
