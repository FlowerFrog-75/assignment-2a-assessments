import type { Query, Schema } from "../mongoose";

type AppendOnlyOptions = {
  /** Model name, used in error messages. */
  name: string;
  /**
   * Paths that may still change after insert (e.g. "ledger" for blockchain
   * sync status). Everything else is write-once.
   */
  mutablePaths?: string[];
};

/**
 * Makes a collection append-only at the application level. Inserts work as
 * normal. Deletes, replacements and updates outside `mutablePaths` throw.
 *
 * This is a guard against mistakes in app code, not a security boundary:
 * someone with direct database access can still change data. Wallet events
 * get their real immutability from the Hyperledger Fabric ledger, and the
 * audit log's hash chain makes tampering detectable.
 */
export function appendOnly(schema: Schema, { name, mutablePaths = [] }: AppendOnlyOptions): void {
  const isMutable = (path: string) =>
    mutablePaths.some((allowed) => path === allowed || path.startsWith(`${allowed}.`));

  const reject = (what: string): never => {
    throw new Error(`${name} is append-only: ${what} is not allowed`);
  };

  schema.pre("deleteOne", { document: true, query: true }, () => reject("deleting records"));
  schema.pre(["deleteMany", "findOneAndDelete"], () => reject("deleting records"));
  schema.pre(["replaceOne", "findOneAndReplace"], () => reject("replacing records"));

  schema.pre(["updateOne", "updateMany", "findOneAndUpdate"], function (this: Query<unknown, unknown>) {
    const update = this.getUpdate();
    if (!update) return;
    if (Array.isArray(update)) reject("a pipeline update");

    for (const [key, value] of Object.entries(update)) {
      if (!key.startsWith("$")) {
        if (!isMutable(key)) reject(`changing "${key}"`);
        continue;
      }
      if (key !== "$set" && key !== "$unset") reject(`the ${key} operator`);
      for (const path of Object.keys(value ?? {})) {
        if (!isMutable(path)) reject(`changing "${path}"`);
      }
    }
  });

  schema.pre("save", function () {
    if (this.isNew) return;
    const changed = this.modifiedPaths().filter((path) => !isMutable(path));
    if (changed.length > 0) reject(`changing ${changed.map((p) => `"${p}"`).join(", ")}`);
  });
}
