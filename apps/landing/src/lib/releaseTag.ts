/**
 * A release tag becomes both a file name (`src/content/releases/<tag>.md`) and a
 * URL segment (`/releases/<tag>/`). Git allows tags that are neither — most
 * notably ones containing `/`, which would nest the file outside the collection
 * and produce a route that does not match. Both the content schema and the sync
 * script check tags against this, so the two identifiers cannot drift apart.
 *
 * No runtime dependencies here: the script imports this file directly under
 * Node's type stripping, so it must not reach for `astro:content`.
 */
export const RELEASE_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const RELEASE_TAG_MESSAGE =
  "A release tag must be a single path segment of letters, digits, dots, dashes or underscores (for example v1.2.3).";

export function isSafeReleaseTag(tag: string): boolean {
  return RELEASE_TAG_PATTERN.test(tag);
}
