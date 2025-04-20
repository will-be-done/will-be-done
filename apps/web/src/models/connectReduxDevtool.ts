/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/prefer-ts-expect-error */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { connectReduxDevTools } from "mobx-keystone";

export const connect = async (toConnect: any, name: string) => {
  // @ts-expect-error
  const remotedev = await import("remotedev");

  const connection = remotedev.connectViaExtension({
    name,
  });

  connectReduxDevTools(remotedev, connection, toConnect, {
    logArgsNearName: false,
  });

  return connection.unsubscribe;
};
