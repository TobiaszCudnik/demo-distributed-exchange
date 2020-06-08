import "source-map-support/register";
import { PeerRPCClient } from "grenache-nodejs-http";
import Link from "grenache-nodejs-link";
import {
  IClientOrderAddRes,
  IOrder,
  ORDER_TYPE,
  IClientOrderAddReq,
  products,
  REQ_TYPES,
  TServerID
} from "./shared";
import sample from "lodash.sample";
import without from "lodash.without";
import random from "simple-random";
import { range } from "range";
import debug from "debug";

export function createClient(id: TServerID) {
  const log = debug(`distex:client:${id}`);

  const link = new Link({
    grape: "http://127.0.0.1:30001"
  });
  link.start();

  const peer = new PeerRPCClient(link, {});
  peer.init();

  // wait 2 secs, then
  // generate a new order every 10sec
  setTimeout(_ => {
    submitNewOrder();
    setInterval(submitNewOrder, 2000);
  }, 2000);

  function submitNewOrder() {
    const order = generateOrder();
    const req: IClientOrderAddReq = {
      reqSender: "client-" + id,
      reqReceiver: id,
      reqType: REQ_TYPES.CLIENT_ORDER_ADD,
      order
    };
    log("new order", order);

    // TODO this should request only the LOCAL orderbook
    peer.map(
      `orderbook`,
      req,
      { timeout: 2000 },
      (err: Error | undefined, data?: IClientOrderAddRes) => {
        if (err) {
          log('ERROR')
          return console.error(err);
        }
        log("new order resp", order.id, data);
      }
    );

    // TODO observe executed orders
  }
}

function generateOrder(): IOrder {
  const fromProduct = sample(products);

  return {
    id: random(),
    toProduct: sample(without(products, fromProduct)),
    toAmount: sample(range(3, 11)),
    fromProduct,
    fromAmount: sample(range(3, 11)),
    type: ORDER_TYPE.ALL_OR_NONE
  };
}

export default createClient