import { readFileSync } from "node:fs";
import { expect } from "bun:test";
import { expectResponseStatus } from "./harness";

const document = JSON.parse(
  readFileSync(new URL("../../openapi.json", import.meta.url), "utf8"),
) as {
  paths: Record<string, Record<string, { operationId?: string }>>;
};

const expectedOperationIds = Object.entries(document.paths)
  .flatMap(([path, operations]) =>
    Object.entries(operations).map(([method, operation]) => {
      if (!operation.operationId) {
        throw new Error(
          `OpenAPI operation ${method.toUpperCase()} ${path} is missing an operationId`,
        );
      }
      return operation.operationId;
    }),
  )
  .sort();

const coveredOperationIds = new Set<string>();

export async function coverOperation<
  TResponse extends { status: number; data: unknown },
  const TStatus extends TResponse["status"],
>(
  operationId: string,
  responsePromise: Promise<TResponse>,
  status: TStatus,
): Promise<Extract<TResponse, { status: TStatus }>> {
  expect(expectedOperationIds).toContain(operationId);
  const response = expectResponseStatus(await responsePromise, status);
  coveredOperationIds.add(operationId);
  return response;
}

export function expectEveryOpenApiOperationCovered() {
  expect([...coveredOperationIds].sort()).toEqual(expectedOperationIds);
}
