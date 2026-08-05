import { expect, test } from "bun:test";
import {
  createSpace,
  deleteSpace,
  getSpace,
  listSpaces,
  updateSpace,
} from "../generated/v1-client";
import { createAuthorization, requestOptions } from "./harness";
import { coverOperation } from "./operationCoverage";

test("covers every space operation and authentication boundaries", async () => {
  const options = requestOptions(await createAuthorization());
  const created = await coverOperation(
    "createSpace",
    createSpace({ name: "Space operations" }, options),
    201,
  );
  const space = created.data.space;

  const listed = await coverOperation("listSpaces", listSpaces(options), 200);
  expect(listed.data.spaces.map(({ id }) => id)).toContain(space.id);

  const fetched = await coverOperation(
    "getSpace",
    getSpace(space.id, options),
    200,
  );
  expect(fetched.data.space.name).toBe("Space operations");

  const updated = await coverOperation(
    "updateSpace",
    updateSpace(space.id, { name: "Updated space" }, options),
    200,
  );
  expect(updated.data.space.name).toBe("Updated space");

  const otherUserOptions = requestOptions(await createAuthorization());
  expect((await getSpace(space.id, otherUserOptions)).status).toBe(404);

  const unauthorized = await listSpaces({
    headers: { Authorization: "Bearer invalid-api-e2e-token" },
  });
  expect(unauthorized.status).toBe(401);
  if (unauthorized.status === 401) {
    expect(unauthorized.data).toMatchObject({ code: "UNAUTHORIZED" });
  }

  await coverOperation("deleteSpace", deleteSpace(space.id, options), 204);
  expect((await getSpace(space.id, options)).status).toBe(404);
});
